// controllers/app/menu.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';

// Получение списка корневых элементов меню
export const getRootMenuItems = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const menuList = await prisma.tool.findMany({
      where: { parent_id: null, included: true },
      orderBy: { order: 'asc' },
    });

    res.status(200).json(menuList);
  } catch (error) {
    next(error);
  }
};

export const getAllNonRootMenuItems = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const menuList = await prisma.tool.findMany({
      where: { parent_id: { not: null }, included: true },
      orderBy: { order: 'asc' },
    });
    res.status(200).json(menuList);
  } catch (error) {
    next(error);
  }
};

// Получение списка дочерних элементов меню по parent_id
export const getNonRootMenuItems = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { parent_id } = req.query; // Получаем id из параметров запроса
      if (!parent_id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }
  
      const menuList = await prisma.tool.findMany({
        where: { parent_id: parent_id as string, included: true },
        orderBy: { order: 'asc' },
      });
  
      res.status(200).json(menuList);
    } catch (error) {
      next(error);
    }
  };