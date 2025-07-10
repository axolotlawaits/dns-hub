import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';

// Получение данных пользователя и связанных данных филиала по email
export const getUserDataByEmail = async (
  req: Request<{}, {}, { email: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Найти данные пользователя по email
    const userData = await prisma.userData.findUnique({
      where: { email },
      include: {
        branch: true, // Включаем данные филиала
        position: true
      }
    });

    if (!userData) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json(userData);
  } catch (error) {
    next(error);
  }
};
