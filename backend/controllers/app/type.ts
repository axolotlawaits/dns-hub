// controllers/app/type.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server';

// Получение списка всех типов
export const getTypes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const types = await prisma.type.findMany({
      select: {
        id: true,
        model_uuid: true,
        chapter: true,
        name: true,
        Tool: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { name: 'asc' },
    });

    res.status(200).json(types);
  } catch (error) {
    next(error);
  }
};

// Получение типов по model_uuid
export const getTypesByModelUuid = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { model_uuid, chapter } = req.query;
    
    if (!model_uuid && !chapter) {
      res.status(400).json({ error: 'model_uuid is required' });
      return;
    }

    const types = await prisma.type.findMany({
      where: {
        model_uuid: model_uuid as string,
        chapter: chapter as string
      },
      select: {
        id: true,
        chapter: true,
        name: true,
        Tool: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { name: 'asc' },
    });

    res.status(200).json(types);
  } catch (error) {
    next(error);
  }
};