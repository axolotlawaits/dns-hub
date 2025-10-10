import { Client, SearchEntry, Change, Attribute } from 'ldapts';
import { NextFunction, Request, Response } from "express";
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface LdapUser {
    department?: string;
    displayName?: string;
    description?: string;
    mail?: string;
    thumbnailPhoto?: string | null;
}

// Новая функция для проверки валидности изображения
function isValidImageBuffer(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 4) return false;
    
    // Проверка сигнатур популярных форматов изображений
    return (
        // JPEG
        (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) ||
        // PNG
        (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) ||
        // GIF
        (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46)
    );
}

async function processLdapPhoto(photoBase64: string): Promise<Buffer> {
    try {
        const inputBuffer = Buffer.from(photoBase64, 'base64');
        
        // Проверяем, что данные похожи на изображение
        if (!isValidImageBuffer(inputBuffer)) {
            throw new Error('Invalid image data');
        }

        const metadata = await sharp(inputBuffer).metadata();
        console.log(`Original image: ${metadata.width}x${metadata.height}, ${metadata.format}, ${inputBuffer.length} bytes`);

        const processedImage = await sharp(inputBuffer)
            .resize({
                width: 200,
                height: 200,
                fit: 'cover',
                position: 'center',
                withoutEnlargement: true
            })
            .rotate()
            .jpeg({
                quality: 80,
                progressive: true,
                mozjpeg: true,
                chromaSubsampling: '4:2:0'
            })
            .toBuffer();

        console.log(`Processed image: 200x200, JPEG, ${processedImage.length} bytes (${Math.round(processedImage.length / inputBuffer.length * 100)}% of original)`);

        return processedImage;
    } catch (error) {
        console.error('Image processing error:', error);
        throw new Error('Failed to process image: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}

async function createLdapClient() {
    return new Client({
        url: 'ldap://ural-dc01.partner.ru',
        timeout: 10000, // 10 секунд таймаут
        connectTimeout: 5000, // 5 секунд на подключение
        strictDN: false, // Отключаем строгую проверку DN
        // Убираем tlsOptions для ldap:// (не ldaps://)
    });
}

async function searchUser(client: Client, login: string) {
    console.log(`[LDAP] Searching for user: ${login}`);
    
    // Экранируем специальные символы в логине для безопасности
    const escapedLogin = login.replace(/[\\*()]/g, '\\$&');
    console.log(`[LDAP] Escaped login: ${escapedLogin}`);
    
    const searchBase = 'OU=DNS Users,DC=partner,DC=ru';
    const searchFilter = `(sAMAccountName=${escapedLogin})`;
    console.log(`[LDAP] Search base: ${searchBase}`);
    console.log(`[LDAP] Search filter: ${searchFilter}`);
    
    const { searchEntries } = await client.search(searchBase, {
        scope: 'sub',
        filter: searchFilter,
        attributes: ['department', 'displayName', 'description', 'mail', 'thumbnailPhoto;binary', 'dn'],
        sizeLimit: 1, // Ограничиваем результат для безопасности
        timeLimit: 10, // 10 секунд на поиск
    });

    console.log(`[LDAP] Search completed. Found ${searchEntries.length} entries for user: ${login}`);

    if (searchEntries.length === 0) {
        console.error(`[LDAP] User not found in directory: ${login}`);
        console.error(`[LDAP] Search was performed in: ${searchBase}`);
        console.error(`[LDAP] Search filter was: ${searchFilter}`);
        throw new Error('User not found in directory');
    }

    console.log(`[LDAP] User found: ${login}, DN: ${searchEntries[0].dn}`);
    return searchEntries[0];
}

// Функция для аутентификации через служебный аккаунт
async function authenticateWithServiceAccount(client: Client, login: string, password: string) {
    console.log(`[LDAP Service Auth] Starting service account authentication for user: ${login}`);
    
    try {
        // Сначала подключаемся с служебным аккаунтом
		console.log(`[LDAP Service Auth] Binding with service account: ${process.env.LDAP_SERVICE_USER}`);
		const serviceUser = process.env.LDAP_SERVICE_USER;
		const servicePassword = process.env.LDAP_SERVICE_PASSWORD;
		if (!serviceUser || !servicePassword) {
			throw new Error('LDAP service account credentials are not configured');
		}
		await client.bind(serviceUser, servicePassword);
        console.log(`[LDAP Service Auth] ✅ Successfully bound with service account`);
        
        // Ищем пользователя
        const userEntry = await searchUser(client, login);
        console.log(`[LDAP Service Auth] ✅ User found: ${login}, DN: ${userEntry.dn}`);
        
        // Теперь проверяем пароль пользователя, создав новый клиент
        const userClient = await createLdapClient();
        try {
            console.log(`[LDAP Service Auth] Verifying user password for: ${userEntry.dn}`);
            await userClient.bind(userEntry.dn, password);
            console.log(`[LDAP Service Auth] ✅ User password verified successfully`);
            return userEntry;
        } finally {
            await userClient.unbind();
        }
        
    } catch (error) {
        console.error(`[LDAP Service Auth] Service account authentication failed for user: ${login}`, error);
        throw error;
    }
}

// Функция для обработки данных пользователя из LDAP
async function processUserData(entry: any, login: string) {
    // Получаем фото из LDAP с проверкой
    let ldapPhoto = null;
    if (entry.thumbnailPhoto) {
        let photoData: Buffer | string;
        if (Array.isArray(entry.thumbnailPhoto)) {
            photoData = entry.thumbnailPhoto[0];
        } else {
            photoData = entry.thumbnailPhoto;
        }
        try {
            const photoBuffer = Buffer.isBuffer(entry.thumbnailPhoto) 
                ? entry.thumbnailPhoto 
                : Buffer.from(photoData);

            if (isValidImageBuffer(photoBuffer)) {
                ldapPhoto = photoBuffer.toString('base64');
            } else {
                console.warn(`Invalid image data from LDAP for user ${login}`);
            }
        } catch (e) {
            console.error(`Failed to process thumbnailPhoto for user ${login}:`, e);
        }
    }

    // Формируем объект пользователя
    const user: LdapUser = {
        department: entry.department?.toString(),
        displayName: entry.displayName?.toString(),
        description: entry.description?.toString(),
        mail: entry.mail?.toString(),
        thumbnailPhoto: ldapPhoto,
    };

    // Синхронизация фото с базой данных (только если фото валидно)
    if (ldapPhoto) {
        try {
            const dbUser = await prisma.user.findUnique({
                where: { login },
                select: { image: true }
            });

            if (dbUser) {
                if (dbUser.image !== ldapPhoto) {
                    await prisma.user.update({
                        where: { login },
                        data: { image: ldapPhoto }
                    });
                    console.log(`Photo synced from LDAP to database for user ${login}`);
                }
            } else {
                console.log(`User ${login} not found in database, skipping photo sync`);
            }
        } catch (dbError) {
            console.error('Database photo sync error:', dbError);
        }
    }

    return user;
}

export async function ldapAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { login: rawLogin, pass: rawPass } = req.body;

    // Обрезаем пробелы в логине и пароле
    const login = typeof rawLogin === 'string' ? rawLogin.trim() : rawLogin;
    const pass = typeof rawPass === 'string' ? rawPass.trim() : rawPass;

    console.log(`[LDAP Auth] Starting authentication for user: ${login}`);

    // Валидация входных данных
    if (!login || !pass) {
        console.log(`[LDAP Auth] Missing credentials - login: ${!!login}, pass: ${!!pass}`);
        res.status(400).json({ message: 'Login and password are required' });
        return;
    }

    // Дополнительная валидация
    if (typeof login !== 'string' || typeof pass !== 'string') {
        console.log(`[LDAP Auth] Invalid credential types - login: ${typeof login}, pass: ${typeof pass}`);
        res.status(400).json({ message: 'Login and password must be strings' });
        return;
    }

    // Проверка длины и содержимого (после обрезки пробелов)
    if (login.length < 1 || login.length > 50) {
        console.log(`[LDAP Auth] Invalid login length: ${login.length}`);
        res.status(400).json({ message: 'Login must be between 1 and 50 characters' });
        return;
    }

    if (pass.length < 1 || pass.length > 128) {
        console.log(`[LDAP Auth] Invalid password length: ${pass.length}`);
        res.status(400).json({ message: 'Password must be between 1 and 128 characters' });
        return;
    }

    const client = await createLdapClient();

    try {
        console.log(`[LDAP Auth] Attempting to bind user: ${login} (trying @dns-shop.ru first)`);
        
        // Аутентификация в LDAP - пробуем разные форматы
        let bindSuccess = false;
        let lastError = null;
        
        // Попытка 1: username@dns-shop.ru (тестируем первым)
        try {
            console.log(`[LDAP Auth] Trying bind: ${login}@dns-shop.ru`);
            await client.bind(`${login}@dns-shop.ru`, pass);
            console.log(`[LDAP Auth] ✅ Successfully bound user: ${login}@dns-shop.ru`);
            bindSuccess = true;
        } catch (bindError1: any) {
            lastError = bindError1;
            console.log(`[LDAP Auth] ❌ First bind attempt failed: ${login}@dns-shop.ru`, {
                error: bindError1.message,
                code: bindError1.code || 'unknown'
            });
            
            // Попытка 2: username@partner.ru
            try {
                console.log(`[LDAP Auth] Trying bind: ${login}@partner.ru`);
                await client.bind(`${login}@partner.ru`, pass);
                console.log(`[LDAP Auth] ✅ Successfully bound user: ${login}@partner.ru`);
                bindSuccess = true;
            } catch (bindError2: any) {
                lastError = bindError2;
                console.log(`[LDAP Auth] ❌ Second bind attempt failed: ${login}@partner.ru`, {
                    error: bindError2.message,
                    code: bindError2.code || 'unknown'
                });
                
                // Попытка 3: полный DN формат (DNS Users)
                try {
                    const dnFormat = `CN=${login},OU=DNS Users,DC=partner,DC=ru`;
                    console.log(`[LDAP Auth] Trying bind: ${dnFormat}`);
                    await client.bind(dnFormat, pass);
                    console.log(`[LDAP Auth] ✅ Successfully bound user with DN format: ${login}`);
                    bindSuccess = true;
                } catch (bindError3: any) {
                    lastError = bindError3;
                    console.log(`[LDAP Auth] ❌ Third bind attempt failed with DN format`, {
                        error: bindError3.message,
                        code: bindError3.code || 'unknown'
                    });
                }
            }
        }
        
        if (!bindSuccess) {
            // Если все прямые попытки bind'а не удались, пробуем через служебный аккаунт
            console.log(`[LDAP Auth] All direct bind attempts failed, trying service account authentication`);
            try {
                const entry = await authenticateWithServiceAccount(client, login, pass);
                console.log(`[LDAP Auth] ✅ Service account authentication successful for user: ${login}`);
                // Продолжаем с найденным пользователем
                const user = await processUserData(entry, login);
                res.locals.user = user;
                next();
                return;
            } catch (serviceError: any) {
                console.error(`[LDAP Auth] Service account authentication also failed:`, serviceError);
                throw lastError || new Error('All authentication methods failed');
            }
        }
        
        // Теперь ищем пользователя и получаем его данные
        console.log(`[LDAP Auth] Searching for user data: ${login}`);
        const entry = await searchUser(client, login);
        
        // Обрабатываем данные пользователя
        const user = await processUserData(entry, login);

        console.log(`[LDAP Auth] Authentication successful for user: ${login}`);
        res.locals.user = user;
        next();
    } catch (error) {
        console.error(`[LDAP Auth] Authentication failed for user: ${login}`, error);
        
        let errorMessage = 'Authentication failed';
        let errorDetails = 'Please check your credentials and try again';
        
        if (error instanceof Error) {
            errorMessage = error.message;
            
            // Более детальные сообщения об ошибках
            if (error.message.includes('InvalidCredentialsError') || error.message.includes('invalid credentials')) {
                errorDetails = 'Invalid username or password - check your credentials';
            } else if (error.message.includes('User not found')) {
                errorDetails = 'User account not found in directory';
            } else if (error.message.includes('timeout')) {
                errorDetails = 'Connection timeout - please try again';
            } else if (error.message.includes('ECONNREFUSED')) {
                errorDetails = 'Cannot connect to authentication server';
            } else if (error.message.includes('ECONNRESET')) {
                errorDetails = 'Connection was reset by server - try again';
            } else if (error.message.includes('All bind attempts failed')) {
                errorDetails = 'All authentication methods failed - check username format';
            }
        }
        
        res.status(401).json({ 
            message: errorMessage,
            details: errorDetails,
            timestamp: new Date().toISOString()
        });
    } finally {
        try {
            await client.unbind();
            console.log(`[LDAP Auth] Connection closed for user: ${login}`);
        } catch (unbindError) {
            console.error(`[LDAP Auth] Error closing connection for user: ${login}`, unbindError);
        }
    }
}



export async function updateUserPhoto(req: Request, res: Response): Promise<void> {
    try {
        const { login: rawLogin, photo, password: rawPassword } = req.body;

        // Обрезаем пробелы в логине и пароле
        const login = typeof rawLogin === 'string' ? rawLogin.trim() : rawLogin;
        const password = typeof rawPassword === 'string' ? rawPassword.trim() : rawPassword;

        // Валидация входных данных
        if (!login || !photo || !password) {
            const missingFields = [];
            if (!login) missingFields.push('login');
            if (!photo) missingFields.push('photo');
            if (!password) missingFields.push('password');

            console.log('Photo update request rejected - missing required fields:', missingFields.join(', '));
            res.status(400).json({
                message: 'Login, photo, and password are required',
                missingFields,
                details: 'Please provide all required fields'
            });
            return;
        }

        console.log(`Starting photo update process for user: ${login}`);

        // Проверка валидности base64
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(photo)) {
            res.status(400).json({
                message: 'Invalid base64 photo data',
                details: 'Please provide a valid base64 encoded image'
            });
            return;
        }

        // Проверка размера фото
        const photoSize = Buffer.from(photo, 'base64').length;
        if (photoSize > 5 * 1024 * 1024) {
            res.status(413).json({
                message: 'Photo is too large. Maximum size is 5MB.',
                actualSize: `${(photoSize / (1024 * 1024)).toFixed(2)}MB`,
                details: 'Please reduce the image size and try again'
            });
            return;
        }

        // Обработка фото
        let photoBuffer: Buffer;
        try {
            photoBuffer = await processLdapPhoto(photo);
        } catch (error) {
            res.status(400).json({
                message: 'Invalid image data',
                details: error instanceof Error ? error.message : 'The provided image could not be processed'
            });
            return;
        }

        const photoBase64 = photoBuffer.toString('base64');
        const client = await createLdapClient();

        try {
            // Аутентификация в LDAP - пробуем разные форматы
            let bindSuccess = false;
            let lastError = null;
            
            // Попытка 1: username@dns-shop.ru (тестируем первым)
            try {
                await client.bind(`${login}@dns-shop.ru`, password);
                console.log(`[Photo Update] Successfully bound user: ${login}@dns-shop.ru`);
                bindSuccess = true;
            } catch (bindError1) {
                lastError = bindError1;
                console.log(`[Photo Update] First bind attempt failed: ${login}@dns-shop.ru`);
                
                // Попытка 2: username@partner.ru
                try {
                    await client.bind(`${login}@partner.ru`, password);
                    console.log(`[Photo Update] Successfully bound user: ${login}@partner.ru`);
                    bindSuccess = true;
                } catch (bindError2) {
                    lastError = bindError2;
                    console.log(`[Photo Update] Second bind attempt failed: ${login}@partner.ru`);
                    
                    // Попытка 3: полный DN формат
                    try {
                        await client.bind(`CN=${login},OU=DNS Users,DC=partner,DC=ru`, password);
                        console.log(`[Photo Update] Successfully bound user with DN format: ${login}`);
                        bindSuccess = true;
                    } catch (bindError3) {
                        lastError = bindError3;
                        console.log(`[Photo Update] Third bind attempt failed with DN format`);
                    }
                }
            }
            
            if (!bindSuccess) {
                throw lastError || new Error('All bind attempts failed');
            }
            
            const entry = await searchUser(client, login);

            const userDn = entry.dn;
            if (!userDn) {
                res.status(404).json({ 
                    message: 'User DN not found',
                    details: 'The user was authenticated but their distinguished name was not found'
                });
                return;
            }

            console.log(`Found user DN: ${userDn}`);

            // Обновление фото в LDAP
            const change = new Change({
                operation: 'replace',
                modification: new Attribute({
                    type: 'thumbnailPhoto',
                    values: [photoBuffer]
                }),
            });

            await client.modify(userDn, change);
            console.log(`Photo updated in LDAP for user ${login}`);

            // Обновление фото в базе данных
            try {
                await prisma.user.update({
                    where: { login },
                    data: { image: photoBase64 }
                });
                console.log(`Photo updated in database for user ${login}`);
            } catch (dbError) {
                console.error('Database update failed:', dbError);
            }

            // Успешный ответ
            res.status(200).json({
                message: 'Photo updated successfully in both LDAP and database',
                details: {
                    originalSize: photoSize,
                    processedSize: photoBuffer.length,
                    compressionRatio: `${Math.round(photoBuffer.length / photoSize * 100)}%`,
                    updatedInDatabase: true
                }
            });

        } catch (error) {
            console.error('Photo update process failed:', error);
            res.status(500).json({
                message: 'Photo update failed',
                error: error instanceof Error ? error.message : 'Unknown error',
                details: 'Please try again later or contact support'
            });
        } finally {
            await client.unbind();
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes('request entity too large')) {
            res.status(413).json({
                message: 'Request payload is too large. Maximum size is 5MB.',
                details: 'Please check the size of your photo and try again'
            });
        } else {
            console.error('Unexpected error in updateUserPhoto:', error);
            res.status(500).json({
                message: 'Internal server error',
                error: error instanceof Error ? error.message : 'Unknown error',
                details: 'Please contact support'
            });
        }
    }
}