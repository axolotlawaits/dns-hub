import { prisma, refreshPrivateKey } from "../../server.js";
import { Request, Response } from "express";
import jwt from 'jsonwebtoken';
import { accessPrivateKey } from "../../server.js";
import crypto from 'crypto';

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

export const generateTelegramLink = async (req: Request, res: Response): Promise<any> => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const token = crypto.randomBytes(32).toString('hex');
    const user = await prisma.user.update({
      where: { id: userId },
      data: { telegramLinkToken: token }
    });
    
    const telegramLink = `https://t.me/${process.env.TELEGRAM_BOT_NAME}?start=${token}`;
    
    return res.status(200).json({ telegramLink });
  } catch (error) {
    console.error('Error generating Telegram link:', error);
    return res.status(500).json({ error: 'Failed to generate Telegram link' });
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