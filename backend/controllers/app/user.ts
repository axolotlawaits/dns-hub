import { prisma } from "../../server.js";
import { Request, Response } from "express";

// Существующая функция login (без изменений)
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
        image: data.thumbnailPhoto
      };

      const newUser = await prisma.user.create({
        data: userData
      });
      
      console.log('New user created:', newUser);
      return res.status(200).json(newUser);
    }
    return res.status(200).json(user);
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
};

// Новая функция для получения данных пользователя
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
        image: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      login: user.login,
      name: user.name,
      image: user.image
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};