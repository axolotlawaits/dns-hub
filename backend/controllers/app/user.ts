import { prisma, refreshPrivateKey } from "../../server.js";
import { Request, Response } from "express";
import jwt from 'jsonwebtoken';
import { accessPrivateKey } from "../../server.js";

export const updateUserSettings = async (req: Request, res: Response):Promise<any> => {
  const { userId, parameter, value } = req.body;

  if (!userId || !parameter) {
    return res.status(400).json({ error: 'User ID and parameter are required' });
  }

  try {
    const setting = await prisma.userSettings.upsert({
      where: {
        userId_parameter: {
          userId: userId,
          parameter: parameter,
        },
      },
      update: {
        value: value,
      },
      create: {
        userId: userId,
        parameter: parameter,
        value: value,
        type: typeof value,
      },
    });

    return res.status(200).json(setting);
  } catch (error) {
    console.error('[User] Error updating user settings:', error);
    return res.status(500).json({ error: 'Failed to update user settings' });
  }
};

export const getUserSettings = async (req: Request, res: Response):Promise<any> => {
  const { userId, parameter } = req.params;

  if (!userId || !parameter) {
    return res.status(400).json({ error: 'User ID and parameter are required' });
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

  console.log(`[Login] Starting login process for user: ${loginLowerCase}`);

  if (!data) {
    console.error(`[Login] No user data in res.locals for user: ${loginLowerCase}`);
    return res.status(500).json({ error: 'Authentication data missing' });
  }

  console.log(`[Login] LDAP data received for user: ${loginLowerCase}`, {
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

      console.log(`[Login] Login successful for new user: ${loginLowerCase}`);
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
    
    console.log(`[Login] Login successful for existing user: ${loginLowerCase}`);
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

    const payload = { userId: user.id, userUuid, positionName: user.position, groupName, userRole: user.role }
    const token = jwt.sign(payload, accessPrivateKey, { algorithm: 'RS256', expiresIn: '30m' })
    const refreshToken = jwt.sign(payload, refreshPrivateKey, { algorithm: 'RS256', expiresIn: '90d' })

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',      
      maxAge: 90 * 24 * 60 * 60 * 1000
    })

    res.status(200).json({user, token})
  } else {
    res.status(400).json({error: 'не удалась найти пользователя'})
  }
}

