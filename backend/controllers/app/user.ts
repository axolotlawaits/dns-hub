import { prisma, refreshPrivateKey } from "../../server.js";
import { Request, Response } from "express";
import jwt from 'jsonwebtoken';
import { accessPrivateKey } from "../../server.js";
import { encrypt } from "../../utils/encryption.js";
import { checkPasswordRateLimit, maskLogin } from "../../utils/rateLimiter.js";
import { logUserAction } from "../../middleware/audit.js";
import { exchangeService } from "../../services/exchange.js";

export const updateUserSettings = async (req: Request, res: Response):Promise<any> => {
  const token = (req as any).token;
  const { userId, parameter, value } = req.body;

  if (!userId || !parameter) {
    return res.status(400).json({ error: 'User ID and parameter are required' });
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА БЕЗОПАСНОСТИ: пользователь может изменять только свои настройки
  if (!token || !token.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (token.userId !== userId) {
    console.warn(`[User] Security: User ${token.userId} attempted to modify settings for user ${userId}`);
    return res.status(403).json({ error: 'Access denied: You can only modify your own settings' });
  }

  try {
    // Если это пароль Exchange, применяем rate limiting и шифруем его перед сохранением
    let finalValue = value;
    let passwordValue: string | null = null;
    
    if (parameter === 'exchange.password' && typeof value === 'string') {
      // Rate limiting только для операций с паролями Exchange
      const rateLimitCheck = checkPasswordRateLimit(token.userId, 5, 15 * 60 * 1000);
      if (!rateLimitCheck.allowed) {
        const resetTime = new Date(rateLimitCheck.resetTime).toLocaleString('ru-RU');
        console.warn(`[User] Security: Rate limit exceeded for password operation by user ${token.userId}`);
        
        // Логируем попытку превышения лимита
        await logUserAction(
          token.userId,
          token.userEmail || null,
          'EXCHANGE_PASSWORD_RATE_LIMIT_EXCEEDED',
          'UserSettings',
          userId,
          { parameter: 'exchange.password' },
          req.ip || undefined,
          req.get('user-agent') || undefined
        ).catch(() => {}); // Игнорируем ошибки логирования
        
        return res.status(429).json({
          error: 'Too many password operations',
          message: `Слишком много операций с паролем. Пожалуйста, попробуйте позже после ${resetTime}.`,
          retryAfter: Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000)
        });
      }
      
      passwordValue = value;
      
      // Валидация пароля перед шифрованием
      if (passwordValue.length === 0) {
        passwordValue = null;
        return res.status(400).json({ 
          error: 'Пароль не может быть пустым'
        });
      }
      
      // Проверка на слишком длинный пароль (защита от DoS)
      if (passwordValue.length > 1024) {
        passwordValue = null;
        return res.status(400).json({ 
          error: 'Пароль слишком длинный (максимум 1024 символа)'
        });
      }
      
      try {
        finalValue = encrypt(passwordValue);
        // НЕ логируем факт шифрования пароля для безопасности
      } catch (encryptError: any) {
        const errorMessage = encryptError?.message || 'Failed to encrypt password';
        
        // Если ошибка связана с отсутствием ENCRYPTION_KEY, даем более понятное сообщение
        if (errorMessage.includes('ENCRYPTION_KEY')) {
          passwordValue = null;
          return res.status(500).json({ 
            error: 'Ошибка конфигурации шифрования',
            message: 'Переменная окружения ENCRYPTION_KEY не установлена. Запустите: node scripts/generate-encryption-key.js',
            details: 'ENCRYPTION_KEY environment variable is not set. Run: node scripts/generate-encryption-key.js'
          });
        }
        
        // Не раскрываем детали ошибки шифрования для безопасности
        console.error('[User] Error encrypting Exchange password: encryption failed');
        passwordValue = null;
        return res.status(500).json({ 
          error: 'Ошибка шифрования пароля',
          message: 'Не удалось зашифровать пароль. Обратитесь к администратору.'
        });
      } finally {
        // Очищаем пароль из памяти после шифрования
        passwordValue = null;
      }
    }

    const setting = await prisma.userSettings.upsert({
      where: {
        userId_parameter: {
          userId: userId,
          parameter: parameter,
        },
      },
      update: {
        value: finalValue,
      },
      create: {
        userId: userId,
        parameter: parameter,
        value: finalValue,
        type: typeof value,
      },
    });

    // Аудит-логирование для операций с паролями Exchange
    if (parameter === 'exchange.password') {
      await logUserAction(
        token.userId,
        token.userEmail || null,
        'EXCHANGE_PASSWORD_UPDATED',
        'UserSettings',
        userId,
        { parameter: 'exchange.password', success: true },
        req.ip || undefined,
        req.get('user-agent') || undefined
      ).catch(() => {}); // Игнорируем ошибки логирования
    }

    return res.status(200).json(setting);
  } catch (error) {
    console.error('[User] Error updating user settings:', error);
    return res.status(500).json({ error: 'Failed to update user settings' });
  }
};

export const getUserSettings = async (req: Request, res: Response):Promise<any> => {
  const token = (req as any).token;
  const { userId, parameter } = req.params;

  if (!userId || !parameter) {
    return res.status(400).json({ error: 'User ID and parameter are required' });
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА БЕЗОПАСНОСТИ: пользователь может получать только свои настройки
  if (!token || !token.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (token.userId !== userId) {
    console.warn(`[User] Security: User ${token.userId} attempted to access settings for user ${userId}`);
    
    // Логируем попытку несанкционированного доступа
    await logUserAction(
      token.userId,
      token.userEmail || null,
      'UNAUTHORIZED_SETTINGS_ACCESS_ATTEMPT',
      'UserSettings',
      userId,
      { parameter, attemptedUserId: userId },
      req.ip || undefined,
      req.get('user-agent') || undefined
    ).catch(() => {});
    
    return res.status(403).json({ error: 'Access denied: You can only access your own settings' });
  }

  // Rate limiting только для операций с паролями Exchange
  if (parameter === 'exchange.password') {
    const rateLimitCheck = checkPasswordRateLimit(token.userId, 5, 15 * 60 * 1000);
    if (!rateLimitCheck.allowed) {
      const resetTime = new Date(rateLimitCheck.resetTime).toLocaleString('ru-RU');
      console.warn(`[User] Security: Rate limit exceeded for password access by user ${token.userId}`);
      
      // Логируем попытку превышения лимита
      await logUserAction(
        token.userId,
        token.userEmail || null,
        'EXCHANGE_PASSWORD_RATE_LIMIT_EXCEEDED',
        'UserSettings',
        userId,
        { parameter: 'exchange.password', operation: 'get' },
        req.ip || undefined,
        req.get('user-agent') || undefined
      ).catch(() => {});
      
      return res.status(429).json({
        error: 'Too many password operations',
        message: `Слишком много операций с паролем. Пожалуйста, попробуйте позже после ${resetTime}.`,
        retryAfter: Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000)
      });
    }
  }

  try {
    const setting = await prisma.userSettings.findUnique({
      where: {
        userId_parameter: {
          userId: userId,
          parameter: parameter,
        },
      },
    });

    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    // Аудит-логирование для операций с паролями Exchange
    if (parameter === 'exchange.password') {
      await logUserAction(
        token.userId,
        token.userEmail || null,
        'EXCHANGE_PASSWORD_ACCESSED',
        'UserSettings',
        userId,
        { parameter: 'exchange.password', success: true },
        req.ip || undefined,
        req.get('user-agent') || undefined
      ).catch(() => {}); // Игнорируем ошибки логирования
    }

    return res.status(200).json(setting);
  } catch (error) {
    console.error('[User] Error fetching user settings:', error);
    return res.status(500).json({ error: 'Failed to fetch user settings' });
  }
};

export const login = async (req: Request, res: Response): Promise<any> => {
  const { login: rawLogin } = req.body;
  
  // Обрезаем пробелы в логине
  const login = typeof rawLogin === 'string' ? rawLogin.trim() : rawLogin;
  const loginLowerCase = login.toLowerCase();
  const data = res.locals.user;
  const maskedLogin = maskLogin(loginLowerCase);
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const userAgent = req.get('user-agent') || null;

  console.log(`[Login] Starting login process for user: ${maskedLogin}`);

  if (!data) {
    console.error(`[Login] No user data in res.locals for user: ${maskedLogin}`);
    
    // Логируем ошибку аутентификации
    await logUserAction(
      null as string | null,
      null,
      'LOGIN_FAILED',
      'Authentication',
      undefined,
      {
        login: maskedLogin,
        ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
        userAgent,
        success: false,
        error: 'Authentication data missing'
      },
      Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
      userAgent || undefined
    ).catch(() => {});
    
    return res.status(500).json({ error: 'Authentication data missing' });
  }

  console.log(`[Login] LDAP data received for user: ${maskedLogin}`, {
    hasDisplayName: !!data.displayName,
    hasEmail: !!data.mail,
    hasDepartment: !!data.department,
    hasPhoto: !!data.thumbnailPhoto
  });

  try {
    const user = await prisma.user.findUnique({
      where: { login: loginLowerCase }
    });

    if (!user) {
      console.log(`[Login] Creating new user: ${loginLowerCase}`);
      
      const userData = {
        login: loginLowerCase,
        email: data.mail?.toLowerCase() || null,
        position: data.description || null,
        name: data.displayName || null,
        branch: data.department || null,
        image: data.thumbnailPhoto,
        telegramLinkToken: null,
        telegramChatId: null
      };

      console.log(`[Login] User data to create:`, {
        login: userData.login,
        email: userData.email ? `${userData.email.substring(0, 3)}***` : null,
        position: userData.position,
        name: userData.name,
        branch: userData.branch,
        hasImage: !!userData.image
      });

      const newUser = await prisma.user.create({
        data: userData
      });
      
      console.log(`[Login] New user created successfully: ${newUser.id}`);
      const getGroupName = await prisma.position.findUnique({
        where: {name: newUser.position},
        select: {group: {select: {name: true}}}
      })

      const getUserUuid = await prisma.userData.findUnique({
        where: { email: newUser.email },
        select: { uuid: true }
      })

      const groupName = getGroupName?.group?.name
      const userUuid = getUserUuid?.uuid

      const payload = { userId: newUser.id, userUuid, positionName: newUser.position, groupName, userRole: newUser.role }
      const token = jwt.sign(payload, accessPrivateKey, { algorithm: 'RS256', expiresIn: '30m' })
      const refreshToken = jwt.sign(payload, refreshPrivateKey, { algorithm: 'RS256', expiresIn: '90d' })

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',      
        maxAge: 90 * 24 * 60 * 60 * 1000
      })

      console.log(`[Login] Login successful for new user: ${maskedLogin}`);
      
      // Автоматически сохраняем пароль Exchange для нового пользователя
      const userPassword = (res.locals as any).userPassword;
      if (userPassword && newUser.email) {
        try {
          const encryptedPassword = encrypt(userPassword);
          await prisma.userSettings.create({
            data: {
              userId: newUser.id,
              parameter: 'exchange.password',
              value: encryptedPassword,
              type: 'string'
            }
          });
          // Очищаем пароль из памяти после использования
          (res.locals as any).userPassword = null;
        } catch (passwordError: any) {
          // Не блокируем логин, если не удалось сохранить пароль
          console.error(`[Login] Error saving Exchange password for new user ${newUser.id}:`, passwordError.message);
          // Очищаем пароль из памяти даже при ошибке
          (res.locals as any).userPassword = null;
        }
      }
      
      // Логируем успешный вход для нового пользователя
      await logUserAction(
        newUser.id,
        newUser.email || null,
        'LOGIN_SUCCESS',
        'Authentication',
        newUser.id,
        {
          login: maskedLogin,
          ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
          userAgent,
          success: true,
          isNewUser: true
        },
        Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
        userAgent || undefined
      ).catch(() => {});
      
      // Проверяем новые письма для авторизованного пользователя (асинхронно, не блокируем ответ)
      if (newUser.email && exchangeService.isConfigured()) {
        exchangeService.checkNewEmailsAndNotify(newUser.id, newUser.email).catch((err: any) => {
          console.error(`[Login] Error checking emails for new user ${newUser.id}:`, err.message);
        });
      }
      
      return res.status(200).json({user: newUser, token})
    }

    console.log(`[Login] Existing user found: ${loginLowerCase}, ID: ${user.id}`);

    const getGroupName = await prisma.position.findUnique({
      where: {name: user.position},
      select: {group: {select: {name: true}}}
    })
    const getUserUuid = await prisma.userData.findUnique({
      where: { email: user.email },
      select: { uuid: true }
    })

    const groupName = getGroupName?.group?.name
    const userUuid = getUserUuid?.uuid

    console.log(`[Login] User metadata:`, {
      groupName,
      userUuid,
      position: user.position,
      role: user.role
    });

    const payload = { userId: user.id, userUuid, positionName: user.position, groupName, userRole: user.role }

    const token = jwt.sign(payload, accessPrivateKey, { algorithm: 'RS256', expiresIn: '30m' })
    const refreshToken = jwt.sign(payload, refreshPrivateKey, { algorithm: 'RS256', expiresIn: '90d' })

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',      
      maxAge: 90 * 24 * 60 * 60 * 1000
    })
    
    console.log(`[Login] Login successful for existing user: ${maskedLogin}`);
    
    // Автоматически сохраняем пароль Exchange при каждом логине
    // Пароль LDAP = пароль Exchange, поэтому обновляем его при каждом входе
    // Это гарантирует, что пароль всегда в актуальном формате шифрования (AES-256-GCM)
    const userPassword = (res.locals as any).userPassword;
    if (userPassword && user.email) {
      try {
        const encryptedPassword = encrypt(userPassword);
        await prisma.userSettings.upsert({
          where: {
            userId_parameter: {
              userId: user.id,
              parameter: 'exchange.password'
            }
          },
          update: {
            value: encryptedPassword
          },
          create: {
            userId: user.id,
            parameter: 'exchange.password',
            value: encryptedPassword,
            type: 'string'
          }
        });
        // Очищаем пароль из памяти после использования
        (res.locals as any).userPassword = null;
      } catch (passwordError: any) {
        // Не блокируем логин, если не удалось сохранить пароль
        console.error(`[Login] Error saving Exchange password for user ${user.id}:`, passwordError.message);
        // Очищаем пароль из памяти даже при ошибке
        (res.locals as any).userPassword = null;
      }
    }
    
    // Логируем успешный вход для существующего пользователя
    await logUserAction(
      user.id,
      user.email || null,
      'LOGIN_SUCCESS',
      'Authentication',
      user.id,
      {
        login: maskedLogin,
        ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
        userAgent,
        success: true,
        isNewUser: false
      },
      Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
      userAgent || undefined
    ).catch(() => {});
    
    // Проверяем новые письма для авторизованного пользователя (асинхронно, не блокируем ответ)
    if (user.email && exchangeService.isConfigured()) {
      exchangeService.checkNewEmailsAndNotify(user.id, user.email).catch((err: any) => {
        console.error(`[Login] Error checking emails for user ${user.id}:`, err.message);
      });
    }
    
    return res.status(200).json({user, token})
  } catch (error) {
    console.error(`[Login] Login error for user: ${loginLowerCase}`, error);
    
    let errorMessage = 'Login failed';
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        errorMessage = 'User already exists with different data';
      } else if (error.message.includes('Foreign key constraint')) {
        errorMessage = 'Invalid user data references';
      } else if (error.message.includes('Connection')) {
        errorMessage = 'Database connection error';
      }
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

export const getLastUser = async (req: Request, res: Response): Promise<any> => {
  const { login: rawLogin } = req.params;

  // Обрезаем пробелы в логине
  const login = typeof rawLogin === 'string' ? rawLogin.trim() : rawLogin;

  if (!login) {
    return res.status(400).json({ error: 'Login parameter is required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { login: login.toLowerCase() },
      select: {
        login: true,
        name: true,
        image: true,
        telegramChatId: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      login: user.login,
      name: user.name,
      image: user.image,
      hasTelegram: !!user.telegramChatId
    });
  } catch (error) {
    console.error('[User] Error fetching user data:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUser = async (req: Request, res: Response): Promise<any> => {
  const newUserData = req.body
  const userId = req.params.id

  const user = await prisma.user.update({
    where: { id: userId },
    data: newUserData
  })

  if (user) {
    res.status(200).json(user)
  } else {
    res.status(400).json({error: 'не удалась обновить пользователя'})
  }
}

/**
 * GET /api/user/users-with-email
 * Получить список пользователей с email из UserData для выбора приглашенных
 */
export const getUsersWithEmail = async (req: Request, res: Response): Promise<any> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Получаем всех пользователей из UserData с email
    const userDataList = await prisma.userData.findMany({
      where: {
        email: {
          not: null
        } as any
      },
      include: {
        branch: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        fio: 'asc'
      }
    });

    // Форматируем для фронтенда
    const users = userDataList
      .filter(ud => ud.email) // Фильтруем только тех, у кого есть email
      .map(ud => ({
        value: ud.email!,
        label: `${ud.fio}${ud.branch?.name ? ` (${ud.branch.name})` : ''}`,
        email: ud.email!,
        fio: ud.fio,
        branch: ud.branch?.name || null
      }));

    return res.status(200).json(users);
  } catch (error: any) {
    console.error('[User] Error getting users with email:', error);
    return res.status(500).json({ error: 'Failed to get users', message: error.message });
  }
};

export const getUserData = async (req: Request, res: Response): Promise<any> => {
  const userId = req.params.id

  const user = await prisma.user.findUnique({ where: { id: userId }})

  if (user) {
    const getGroupName = await prisma.position.findUnique({
      where: {name: user.position},
      select: {group: {select: {name: true}}}
    })
    const getUserUuid = await prisma.userData.findUnique({
      where: { email: user.email },
      select: { uuid: true }
    })

    const groupName = getGroupName?.group?.name
    const userUuid = getUserUuid?.uuid

    // Проверяем, есть ли в текущем токене impersonatedBy
    const token = (req as any).token;
    let impersonatedBy = undefined;
    if (token && token.impersonatedBy) {
      impersonatedBy = token.impersonatedBy;
      console.log('[getUserData] Сохраняем impersonatedBy из текущего токена:', impersonatedBy);
    }

    const payload = { 
      userId: user.id, 
      userUuid, 
      positionName: user.position, 
      groupName, 
      userRole: user.role,
      ...(impersonatedBy ? { impersonatedBy } : {})
    }
    const newToken = jwt.sign(payload, accessPrivateKey, { algorithm: 'RS256', expiresIn: '30m' })
    const refreshToken = jwt.sign(payload, refreshPrivateKey, { algorithm: 'RS256', expiresIn: '90d' })

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',      
      maxAge: 90 * 24 * 60 * 60 * 1000
    })

    res.status(200).json({user, token: newToken})
  } else {
    res.status(400).json({error: 'не удалась найти пользователя'})
  }
}

