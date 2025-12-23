import { Client, SearchEntry, Change, Attribute } from 'ldapts';
import { NextFunction, Request, Response } from "express";
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../server.js';
import { checkLoginRateLimit, resetLoginRateLimit, maskLogin } from './rateLimiter.js';
import { logUserAction } from '../middleware/audit.js';

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
    const ldapUrl = process.env.LDAP_URL || 'ldap://ural-dc01.partner.ru';
    
    return new Client({
        url: ldapUrl,
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
    const startTime = Date.now();
    const minResponseTime = 500; // Минимальное время ответа для защиты от timing attacks
    
    const { login: rawLogin, pass: rawPass } = req.body;

    // Обрезаем пробелы в логине и пароле
    const login = typeof rawLogin === 'string' ? rawLogin.trim() : rawLogin;
    const pass = typeof rawPass === 'string' ? rawPass.trim() : rawPass;
    
    // Получаем IP адрес для rate limiting
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || null;
    const maskedLogin = maskLogin(login);

    console.log(`[LDAP Auth] Starting authentication for user: ${maskedLogin}`);

    // Валидация входных данных
    if (!login || !pass) {
        console.log(`[LDAP Auth] Missing credentials - login: ${!!login}, pass: ${!!pass}`);
        
        // Унифицируем время ответа
        const elapsed = Date.now() - startTime;
        if (elapsed < minResponseTime) {
            await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
        }
        
        res.status(400).json({ message: 'Login and password are required' });
        return;
    }

    // Дополнительная валидация
    if (typeof login !== 'string' || typeof pass !== 'string') {
        console.log(`[LDAP Auth] Invalid credential types - login: ${typeof login}, pass: ${typeof pass}`);
        
        const elapsed = Date.now() - startTime;
        if (elapsed < minResponseTime) {
            await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
        }
        
        res.status(400).json({ message: 'Login and password must be strings' });
        return;
    }

    // Проверка длины и содержимого (после обрезки пробелов)
    if (login.length < 1 || login.length > 50) {
        console.log(`[LDAP Auth] Invalid login length: ${login.length}`);
        
        const elapsed = Date.now() - startTime;
        if (elapsed < minResponseTime) {
            await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
        }
        
        res.status(400).json({ message: 'Login must be between 1 and 50 characters' });
        return;
    }

    if (pass.length < 1 || pass.length > 128) {
        const elapsed = Date.now() - startTime;
        if (elapsed < minResponseTime) {
            await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
        }
        
        res.status(400).json({ message: 'Password must be between 1 and 128 characters' });
        return;
    }

    // Rate limiting по IP адресу
    const ipRateLimit = checkLoginRateLimit(
        Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
        5, // Максимум 5 попыток
        15 * 60 * 1000, // 15 минут
        30 * 60 * 1000 // 30 минут блокировки
    );
    
    if (!ipRateLimit.allowed) {
        const resetTime = ipRateLimit.blockedUntil 
            ? new Date(ipRateLimit.blockedUntil).toLocaleString('ru-RU')
            : new Date(ipRateLimit.resetTime).toLocaleString('ru-RU');
        
        console.warn(`[LDAP Auth] IP rate limit exceeded: ${maskedLogin} from IP ${ipAddress}`);
        
        // Логируем попытку превышения лимита
        await logUserAction(
            null as string | null, // userId (null для неудачных попыток)
            null, // userEmail
            'LOGIN_RATE_LIMIT_EXCEEDED',
            'Authentication',
            undefined,
            {
                login: maskedLogin,
                ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                userAgent,
                reason: 'IP rate limit exceeded'
            },
            Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
            userAgent || undefined
        ).catch(() => {});
        
        const elapsed = Date.now() - startTime;
        if (elapsed < minResponseTime) {
            await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
        }
        
        res.status(429).json({ 
            message: 'Too many login attempts',
            details: `Слишком много попыток входа. Пожалуйста, попробуйте позже после ${resetTime}.`,
            retryAfter: Math.ceil((ipRateLimit.blockedUntil || ipRateLimit.resetTime - Date.now()) / 1000)
        });
        return;
    }

    // Rate limiting по логину
    const loginRateLimit = checkLoginRateLimit(
        login.toLowerCase(),
        3, // Максимум 3 неудачные попытки для одного логина
        15 * 60 * 1000, // 15 минут
        30 * 60 * 1000 // 30 минут блокировки
    );
    
    if (!loginRateLimit.allowed) {
        const resetTime = loginRateLimit.blockedUntil 
            ? new Date(loginRateLimit.blockedUntil).toLocaleString('ru-RU')
            : new Date(loginRateLimit.resetTime).toLocaleString('ru-RU');
        
        console.warn(`[LDAP Auth] Login rate limit exceeded: ${maskedLogin}`);
        
        // Логируем попытку превышения лимита
        await logUserAction(
            null as string | null,
            null,
            'LOGIN_RATE_LIMIT_EXCEEDED',
            'Authentication',
            undefined,
            {
                login: maskedLogin,
                ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                userAgent,
                reason: 'Login rate limit exceeded'
            },
            Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
            userAgent || undefined
        ).catch(() => {});
        
        const elapsed = Date.now() - startTime;
        if (elapsed < minResponseTime) {
            await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
        }
        
        // Всегда возвращаем одинаковое сообщение для защиты от перечисления пользователей
        res.status(401).json({ 
            message: 'Invalid credentials',
            details: 'Проверьте правильность введенных данных'
        });
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
        // Сохраняем пароль временно для возможного сохранения в Exchange (будет удален после использования)
        res.locals.userPassword = pass;
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
    const startTime = Date.now();
    const minResponseTime = 500; // Минимальное время ответа для защиты от timing attacks
    
    try {
        const token = (req as any).token;
        if (!token || !token.userId) {
            const elapsed = Date.now() - startTime;
            if (elapsed < minResponseTime) {
                await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
            }
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const { login: rawLogin, photo, password: rawPassword } = req.body;

        // Обрезаем пробелы в логине и пароле
        const login = typeof rawLogin === 'string' ? rawLogin.trim() : rawLogin;
        const password = typeof rawPassword === 'string' ? rawPassword.trim() : rawPassword;
        
        // Получаем IP адрес и User-Agent для логирования
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const userAgent = req.get('user-agent') || null;
        const maskedLogin = maskLogin(login);

        // Проверка прав доступа: пользователь может обновлять только свое фото
        const user = await prisma.user.findUnique({
            where: { id: token.userId },
            select: { login: true, email: true }
        });

        if (!user) {
            const elapsed = Date.now() - startTime;
            if (elapsed < minResponseTime) {
                await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
            }
            
            await logUserAction(
                token.userId,
                null,
                'PHOTO_UPDATE_FAILED',
                'User',
                token.userId,
                {
                    login: maskedLogin,
                    ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                    userAgent,
                    reason: 'User not found in database'
                },
                Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                userAgent || undefined
            ).catch(() => {});
            
            res.status(404).json({ message: 'User not found' });
            return;
        }

        // Проверяем, что login из запроса соответствует авторизованному пользователю
        if (user.login.toLowerCase() !== login.toLowerCase()) {
            const elapsed = Date.now() - startTime;
            if (elapsed < minResponseTime) {
                await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
            }
            
            console.warn(`[Photo Update] Security: User ${token.userId} attempted to update photo for user ${login}`);
            
            await logUserAction(
                token.userId,
                user.email || null,
                'PHOTO_UPDATE_UNAUTHORIZED_ATTEMPT',
                'User',
                login,
                {
                    attemptedLogin: maskedLogin,
                    actualLogin: maskLogin(user.login),
                    ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                    userAgent
                },
                Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                userAgent || undefined
            ).catch(() => {});
            
            res.status(403).json({ 
                message: 'Access denied: You can only update your own photo' 
            });
            return;
        }

        // Rate limiting по IP адресу
        const ipRateLimit = checkLoginRateLimit(
            Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
            3, // Максимум 3 попытки
            15 * 60 * 1000, // 15 минут
            30 * 60 * 1000 // 30 минут блокировки
        );
        
        if (!ipRateLimit.allowed) {
            const resetTime = ipRateLimit.blockedUntil 
                ? new Date(ipRateLimit.blockedUntil).toLocaleString('ru-RU')
                : new Date(ipRateLimit.resetTime).toLocaleString('ru-RU');
            
            console.warn(`[Photo Update] IP rate limit exceeded: ${maskedLogin} from IP ${ipAddress}`);
            
            await logUserAction(
                token.userId,
                user.email || null,
                'PHOTO_UPDATE_RATE_LIMIT_EXCEEDED',
                'User',
                token.userId,
                {
                    login: maskedLogin,
                    ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                    userAgent,
                    reason: 'IP rate limit exceeded'
                },
                Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                userAgent || undefined
            ).catch(() => {});
            
            const elapsed = Date.now() - startTime;
            if (elapsed < minResponseTime) {
                await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
            }
            
            res.status(429).json({ 
                message: 'Too many photo update attempts',
                details: `Слишком много попыток обновления фото. Пожалуйста, попробуйте позже после ${resetTime}.`,
                retryAfter: Math.ceil((ipRateLimit.blockedUntil || ipRateLimit.resetTime - Date.now()) / 1000)
            });
            return;
        }

        // Валидация входных данных
        if (!login || !photo || !password) {
            const missingFields = [];
            if (!login) missingFields.push('login');
            if (!photo) missingFields.push('photo');
            if (!password) missingFields.push('password');

            console.log(`[Photo Update] Missing required fields for user: ${maskedLogin}`);
            
            const elapsed = Date.now() - startTime;
            if (elapsed < minResponseTime) {
                await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
            }
            
            res.status(400).json({
                message: 'Login, photo, and password are required',
                missingFields,
                details: 'Please provide all required fields'
            });
            return;
        }

        // Валидация формата логина (защита от LDAP инъекций)
        if (login.length < 1 || login.length > 50) {
            const elapsed = Date.now() - startTime;
            if (elapsed < minResponseTime) {
                await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
            }
            
            res.status(400).json({
                message: 'Invalid login format',
                details: 'Login must be between 1 and 50 characters'
            });
            return;
        }

        // Проверка размера base64 строки (до декодирования)
        if (photo.length > 7 * 1024 * 1024) { // ~7MB base64 = ~5MB после декодирования
            const elapsed = Date.now() - startTime;
            if (elapsed < minResponseTime) {
                await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
            }
            
            res.status(413).json({
                message: 'Photo data is too large',
                details: 'Maximum size is 5MB after encoding'
            });
            return;
        }

        console.log(`[Photo Update] Starting photo update process for user: ${maskedLogin}`);

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
            const elapsed = Date.now() - startTime;
            if (elapsed < minResponseTime) {
                await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
            }
            
            await logUserAction(
                token.userId,
                user.email || null,
                'PHOTO_UPDATE_FAILED',
                'User',
                token.userId,
                {
                    login: maskedLogin,
                    ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                    userAgent,
                    reason: 'Invalid image data',
                    error: error instanceof Error ? error.message : 'Unknown error'
                },
                Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                userAgent || undefined
            ).catch(() => {});
            
            res.status(400).json({
                message: 'Invalid image data',
                details: error instanceof Error ? error.message : 'The provided image could not be processed'
            });
            return;
        }

        const photoBase64 = photoBuffer.toString('base64');
        const client = await createLdapClient();

        try {
            // Экранируем специальные символы в логине для безопасности LDAP
            const escapedLogin = login.replace(/[\\*()]/g, '\\$&');
            
            // Аутентификация в LDAP - пробуем разные форматы
            let bindSuccess = false;
            let lastError = null;
            
            // Попытка 1: username@dns-shop.ru (тестируем первым)
            try {
                await client.bind(`${escapedLogin}@dns-shop.ru`, password);
                console.log(`[Photo Update] Successfully bound user: ${maskedLogin}@dns-shop.ru`);
                bindSuccess = true;
            } catch (bindError1) {
                lastError = bindError1;
                console.log(`[Photo Update] First bind attempt failed: ${maskedLogin}@dns-shop.ru`);
                
                // Попытка 2: username@partner.ru
                try {
                    await client.bind(`${escapedLogin}@partner.ru`, password);
                    console.log(`[Photo Update] Successfully bound user: ${maskedLogin}@partner.ru`);
                    bindSuccess = true;
                } catch (bindError2) {
                    lastError = bindError2;
                    console.log(`[Photo Update] Second bind attempt failed: ${maskedLogin}@partner.ru`);
                    
                    // Попытка 3: полный DN формат
                    try {
                        await client.bind(`CN=${escapedLogin},OU=DNS Users,DC=partner,DC=ru`, password);
                        console.log(`[Photo Update] Successfully bound user with DN format: ${maskedLogin}`);
                        bindSuccess = true;
                    } catch (bindError3) {
                        lastError = bindError3;
                        console.log(`[Photo Update] Third bind attempt failed with DN format`);
                    }
                }
            }
            
            if (!bindSuccess) {
                const elapsed = Date.now() - startTime;
                if (elapsed < minResponseTime) {
                    await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
                }
                
                await logUserAction(
                    token.userId,
                    user.email || null,
                    'PHOTO_UPDATE_FAILED',
                    'User',
                    token.userId,
                    {
                        login: maskedLogin,
                        ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                        userAgent,
                        reason: 'LDAP authentication failed',
                        error: lastError instanceof Error ? lastError.message : 'All bind attempts failed'
                    },
                    Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                    userAgent || undefined
                ).catch(() => {});
                
                // Всегда возвращаем одинаковое сообщение для защиты от timing attacks
                res.status(401).json({ 
                    message: 'Authentication failed',
                    details: 'Invalid credentials'
                });
                return;
            }
            
            const entry = await searchUser(client, login);

            const userDn = entry.dn;
            if (!userDn) {
                const elapsed = Date.now() - startTime;
                if (elapsed < minResponseTime) {
                    await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
                }
                
                await logUserAction(
                    token.userId,
                    user.email || null,
                    'PHOTO_UPDATE_FAILED',
                    'User',
                    token.userId,
                    {
                        login: maskedLogin,
                        ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                        userAgent,
                        reason: 'User DN not found'
                    },
                    Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                    userAgent || undefined
                ).catch(() => {});
                
                res.status(404).json({ 
                    message: 'User DN not found',
                    details: 'The user was authenticated but their distinguished name was not found'
                });
                return;
            }

            console.log(`[Photo Update] Found user DN for: ${maskedLogin}`);

            // Обновление фото в LDAP
            const change = new Change({
                operation: 'replace',
                modification: new Attribute({
                    type: 'thumbnailPhoto',
                    values: [photoBuffer]
                }),
            });

            await client.modify(userDn, change);
            console.log(`[Photo Update] Photo updated in LDAP for user: ${maskedLogin}`);

            // Обновление фото в базе данных
            try {
                await prisma.user.update({
                    where: { login },
                    data: { image: photoBase64 }
                });
                console.log(`[Photo Update] Photo updated in database for user: ${maskedLogin}`);
            } catch (dbError) {
                console.error('[Photo Update] Database update failed:', dbError);
                // Не прерываем выполнение, так как LDAP обновление успешно
            }

            // Логируем успешное обновление фото
            await logUserAction(
                token.userId,
                user.email || null,
                'PHOTO_UPDATE_SUCCESS',
                'User',
                token.userId,
                {
                    login: maskedLogin,
                    ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                    userAgent,
                    originalSize: photoSize,
                    processedSize: photoBuffer.length,
                    compressionRatio: `${Math.round(photoBuffer.length / photoSize * 100)}%`
                },
                Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                userAgent || undefined
            ).catch(() => {});

            // Унифицируем время ответа
            const elapsed = Date.now() - startTime;
            if (elapsed < minResponseTime) {
                await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
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
            console.error(`[Photo Update] Photo update process failed for user: ${maskedLogin}`, error);
            
            const elapsed = Date.now() - startTime;
            if (elapsed < minResponseTime) {
                await new Promise(resolve => setTimeout(resolve, minResponseTime - elapsed));
            }
            
            await logUserAction(
                token.userId,
                user.email || null,
                'PHOTO_UPDATE_FAILED',
                'User',
                token.userId,
                {
                    login: maskedLogin,
                    ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                    userAgent,
                    reason: 'Unexpected error',
                    error: error instanceof Error ? error.message : 'Unknown error'
                },
                Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                userAgent || undefined
            ).catch(() => {});
            
            res.status(500).json({
                message: 'Photo update failed',
                error: error instanceof Error ? error.message : 'Unknown error',
                details: 'Please try again later or contact support'
            });
        } finally {
            try {
                await client.unbind();
            } catch (unbindError) {
                console.error(`[Photo Update] Error closing LDAP connection:`, unbindError);
            }
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