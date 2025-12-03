// controllers/app/type.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';

// Схема валидации для создания типа
const createTypeSchema = z.object({
  model_uuid: z.string().uuid(),
  chapter: z.string().min(1),
  name: z.string().min(1),
  colorHex: z.string().optional(),
});

// Схема валидации для обновления типа
const updateTypeSchema = z.object({
  model_uuid: z.string().uuid().optional(),
  chapter: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  colorHex: z.string().optional(),
});

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
        colorHex: true,
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

// Получение типа по ID
export const getTypeById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const type = await prisma.type.findUnique({
      where: { id },
      include: {
        Tool: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!type) {
      res.status(404).json({ error: 'Type not found' });
      return;
    }

    res.status(200).json(type);
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

// Создание нового типа
export const createType = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedData = createTypeSchema.parse(req.body);
    
    // Проверяем существование Tool
    const tool = await prisma.tool.findUnique({
      where: { id: validatedData.model_uuid }
    });

    if (!tool) {
      res.status(400).json({ error: 'Tool not found' });
      return;
    }

    const type = await prisma.type.create({
      data: validatedData,
      include: {
        Tool: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.status(201).json(type);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
      return;
    }
    next(error);
  }
};

// Обновление типа
export const updateType = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const validatedData = updateTypeSchema.parse(req.body);

    // Если обновляется model_uuid, проверяем существование Tool
    if (validatedData.model_uuid) {
      const tool = await prisma.tool.findUnique({
        where: { id: validatedData.model_uuid }
      });

      if (!tool) {
        res.status(400).json({ error: 'Tool not found' });
        return;
      }
    }

    const type = await prisma.type.update({
      where: { id },
      data: validatedData,
      include: {
        Tool: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.status(200).json(type);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
      return;
    }
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      res.status(404).json({ error: 'Type not found' });
      return;
    }
    next(error);
  }
};

// Удаление типа
export const deleteType = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.type.delete({
      where: { id }
    });

    res.status(200).json({ message: 'Type deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      res.status(404).json({ error: 'Type not found' });
      return;
    }
    next(error);
  }
};