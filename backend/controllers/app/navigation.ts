// controllers/app/menu.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server';

const ROOT_PARENT_ID = '00000000-0000-0000-0000-000000000000';

// Получение списка корневых элементов меню
export const getRootMenuItems = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const menuList = await prisma.tool.findMany({
      where: {
        parent_id: ROOT_PARENT_ID
      },
      select: {
        id: true,
        parent_id: true,
        name: true,
        icon: true,
        link: true,
        types: true,
        order: true
      },
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
        console.log(parent_id)
        res.status(400).json({ error: 'id is required' });
        return;
      }
  
      const menuList = await prisma.tool.findMany({
        where: {
          parent_id: parent_id as string // Используем id для фильтрации
        },
        select: {
          id: true,
          parent_id: true,
          name: true,
          icon: true,
          link: true,
          description:true,
          types: true,
          order: true
        },
        orderBy: { order: 'asc' },
      });
  
      res.status(200).json(menuList);
    } catch (error) {
      next(error);
    }
  };