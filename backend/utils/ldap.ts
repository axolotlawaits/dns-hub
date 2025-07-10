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
    });
}

async function searchUser(client: Client, login: string) {
    const { searchEntries } = await client.search('OU=DNS Users,DC=partner,DC=ru', {
        scope: 'sub',
        filter: `(sAMAccountName=${login})`,
        attributes: ['department', 'displayName', 'description', 'mail', 'thumbnailPhoto;binary', 'dn'], // Явно запрашиваем бинарные данные
    });

    if (searchEntries.length === 0) {
        throw new Error('User not found in directory');
    }

    return searchEntries[0];
}

export async function ldapAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { login, pass } = req.body;

    if (!login || !pass) {
        res.status(400).json({ message: 'Login and password are required' });
        return;
    }

    const client = await createLdapClient();

    try {
        // Аутентификация в LDAP
        await client.bind(`${login}@partner.ru`, pass);
        const entry = await searchUser(client, login);

        // Получаем фото из LDAP с проверкой
        let ldapPhoto = null;
        if (entry.thumbnailPhoto) {
            try {
                const photoBuffer = Buffer.isBuffer(entry.thumbnailPhoto) 
                    ? entry.thumbnailPhoto 
                    : Buffer.from(entry.thumbnailPhoto);

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

        res.locals.user = user;
        next();
    } catch (error) {
        console.error('LDAP authentication failed:', error);
        res.status(401).json({ 
            message: error instanceof Error ? error.message : 'Authentication failed',
            details: 'Please check your credentials and try again'
        });
    } finally {
        await client.unbind();
    }
}

export async function updateUserPhoto(req: Request, res: Response): Promise<void> {
    try {
        const { login, photo, password } = req.body;

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
            // Аутентификация в LDAP
            await client.bind(`${login}@partner.ru`, password);
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