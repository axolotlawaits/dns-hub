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
    console.error('Error updating user settings:', error);
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
    console.error('Error fetching user settings:', error);
    return res.status(500).json({ error: 'Failed to fetch user settings' });
  }
};
export const login = async (req: Request, res: Response): Promise<any> => {
  const { login } = req.body;
  const loginLowerCase = login.toLowerCase();
  const data = res.locals.user;

  if (!data) {
    console.error('No user data in res.locals');
    return res.status(500).json({ error: 'Authentication data missing' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { login: loginLowerCase }
    });

    if (!user) {
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

      const newUser = await prisma.user.create({
        data: userData
      });
      const getGroupName = await prisma.position.findUnique({
        where: {name: newUser.position},
        select: {group: {select: {name: true}}}
      })
      const groupName = getGroupName?.group?.name
      const payload = { userId: newUser.id, positionName: newUser.position, groupName }
      const token = jwt.sign(payload, accessPrivateKey, { algorithm: 'RS256', expiresIn: '1m' })
      const refreshToken = jwt.sign(payload, refreshPrivateKey, { algorithm: 'RS256', expiresIn: '30d' })

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',      
        maxAge: 30 * 24 * 60 * 60 * 1000
      })

      return res.status(200).json({user: newUser, token})
    }

    const getGroupName = await prisma.position.findUnique({
      where: {name: user.position},
      select: {group: {select: {name: true}}}
    })
    const groupName = getGroupName?.group?.name
    const payload = { userId: user.id, positionName: user.position, groupName }
    const token = jwt.sign(payload, accessPrivateKey, { algorithm: 'RS256', expiresIn: '1m' })
    const refreshToken = jwt.sign(payload, refreshPrivateKey, { algorithm: 'RS256', expiresIn: '30d' })

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',      
      maxAge: 30 * 24 * 60 * 60 * 1000
    })
    
    return res.status(200).json({user, token})
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
};

export const getLastUser = async (req: Request, res: Response): Promise<any> => {
  const { login } = req.params;

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
    console.error('Error fetching user data:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};