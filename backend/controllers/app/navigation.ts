// controllers/app/navigation.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';

// Схема валидации для создания пункта меню
const createToolSchema = z.object({
  parent_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  icon: z.string().min(1),
  link: z.string().min(1),
  description: z.string().optional(),
  order: z.number().int().default(1),
  included: z.boolean().default(true),
});

// Схема валидации для обновления пункта меню
const updateToolSchema = z.object({
  parent_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
  link: z.string().min(1).optional(),
  description: z.string().optional(),
  order: z.number().int().optional(),
  included: z.boolean().optional(),
});

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

// Получение всех пунктов меню (включая скрытые)
// ВАЖНО: Для безопасности фильтруем инструменты по доступу пользователя
export const getAllMenuItems = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req as any).token;
    const userId = token?.userId;
    
    // Получаем все инструменты
    let menuList = await prisma.tool.findMany({
      orderBy: [{ parent_id: 'asc' }, { order: 'asc' }],
      include: {
        types: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        }
      }
    });

    // Если пользователь не авторизован, возвращаем пустой список
    if (!userId) {
      res.status(200).json([]);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true }
    });

    // Если пользователь не найден, возвращаем пустой список
    if (!user) {
      res.status(200).json([]);
      return;
    }

    // DEVELOPER и ADMIN видят все инструменты
    if (['DEVELOPER', 'ADMIN'].includes(user.role)) {
      res.status(200).json(menuList);
      return;
    }

    // Для остальных пользователей получаем их доступы
    const userAccess = await prisma.userToolAccess.findMany({
      where: { userId },
      select: { toolId: true }
    });

    // Получаем доступы через должность
    let positionAccess: any[] = [];
    if (user.email) {
        const userData = await prisma.userData.findUnique({
          where: { email: user.email },
          select: {
            position: {
              select: {
                uuid: true,
                group: {
                  select: { uuid: true }
                }
              }
            }
          }
        });

        if (userData?.position?.uuid) {
          const posAccess = await prisma.positionToolAccess.findMany({
            where: { positionId: userData.position.uuid },
            select: { toolId: true }
          });
          positionAccess = posAccess;
        }

        // Получаем доступы через группу
        if (userData?.position?.group?.uuid) {
          const groupAccess = await prisma.groupToolAccess.findMany({
            where: { groupId: userData.position.group.uuid },
            select: { toolId: true }
          });
          positionAccess = [...positionAccess, ...groupAccess];
        }
    }

    // Объединяем все доступы
    const accessibleToolIds = new Set<string>();
    userAccess.forEach(access => accessibleToolIds.add(access.toolId));
    positionAccess.forEach(access => accessibleToolIds.add(access.toolId));

    // Получаем список защищенных инструментов (тех, у которых есть записи в таблицах доступа)
    const [allUserAccess, allGroupAccess, allPositionAccess] = await Promise.all([
      prisma.userToolAccess.findMany({ select: { toolId: true } }),
      prisma.groupToolAccess.findMany({ select: { toolId: true } }),
      prisma.positionToolAccess.findMany({ select: { toolId: true } })
    ]);

    const protectedToolIds = new Set<string>();
    allUserAccess.forEach(a => protectedToolIds.add(a.toolId));
    allGroupAccess.forEach(a => protectedToolIds.add(a.toolId));
    allPositionAccess.forEach(a => protectedToolIds.add(a.toolId));

    // Фильтруем: показываем незащищенные инструменты всем, защищенные - только с доступом
    menuList = menuList.filter(tool => {
      // Если инструмент не защищен - показываем всем
      if (!protectedToolIds.has(tool.id)) {
        return true;
      }
      // Если инструмент защищен - требуем доступ
      return accessibleToolIds.has(tool.id);
    });

    res.status(200).json(menuList);
  } catch (error) {
    console.error('[getAllMenuItems] Error:', error);
    res.status(500).json({ error: 'Failed to fetch menu items', message: error instanceof Error ? error.message : 'Unknown error' });
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
// ВАЖНО: Для безопасности фильтруем инструменты по доступу пользователя
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

    const token = (req as any).token;
    const userId = token?.userId;

    let menuList = await prisma.tool.findMany({
      where: { parent_id: parent_id as string, included: true },
      orderBy: { order: 'asc' },
    });

    // Если пользователь авторизован и не DEVELOPER/ADMIN, фильтруем по доступу
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, email: true }
      });

      // DEVELOPER и ADMIN видят все инструменты
      if (user && ['DEVELOPER', 'ADMIN'].includes(user.role)) {
        res.status(200).json(menuList);
        return;
      }

      // Для остальных пользователей получаем их доступы
      const userAccess = await prisma.userToolAccess.findMany({
        where: { userId },
        select: { toolId: true }
      });

      // Получаем доступы через должность и группу
      let positionAccess: any[] = [];
      if (user?.email) {
        const userData = await prisma.userData.findUnique({
          where: { email: user.email },
          select: {
            position: {
              select: {
                uuid: true,
                group: {
                  select: { uuid: true }
                }
              }
            }
          }
        });

        if (userData?.position?.uuid) {
          const posAccess = await prisma.positionToolAccess.findMany({
            where: { positionId: userData.position.uuid },
            select: { toolId: true }
          });
          positionAccess = posAccess;
        }

        if (userData?.position?.group?.uuid) {
          const groupAccess = await prisma.groupToolAccess.findMany({
            where: { groupId: userData.position.group.uuid },
            select: { toolId: true }
          });
          positionAccess = [...positionAccess, ...groupAccess];
        }
      }

      // Объединяем все доступы
      const accessibleToolIds = new Set<string>();
      userAccess.forEach(access => accessibleToolIds.add(access.toolId));
      positionAccess.forEach(access => accessibleToolIds.add(access.toolId));

      // Получаем список защищенных инструментов
      const [allUserAccess, allGroupAccess, allPositionAccess] = await Promise.all([
        prisma.userToolAccess.findMany({ select: { toolId: true } }),
        prisma.groupToolAccess.findMany({ select: { toolId: true } }),
        prisma.positionToolAccess.findMany({ select: { toolId: true } })
      ]);

      const protectedToolIds = new Set<string>();
      allUserAccess.forEach(a => protectedToolIds.add(a.toolId));
      allGroupAccess.forEach(a => protectedToolIds.add(a.toolId));
      allPositionAccess.forEach(a => protectedToolIds.add(a.toolId));

      // Фильтруем: показываем незащищенные инструменты всем, защищенные - только с доступом
      menuList = menuList.filter(tool => {
        // Если инструмент не защищен - показываем всем
        if (!protectedToolIds.has(tool.id)) {
          return true;
        }
        // Если инструмент защищен - требуем доступ
        return accessibleToolIds.has(tool.id);
      });
    }

    res.status(200).json(menuList);
  } catch (error) {
    next(error);
  }
};

// Получение пункта меню по ID
export const getMenuItemById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const menuItem = await prisma.tool.findUnique({
      where: { id },
      include: {
        types: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        }
      }
    });

    if (!menuItem) {
      res.status(404).json({ error: 'Menu item not found' });
      return;
    }

    res.status(200).json(menuItem);
  } catch (error) {
    next(error);
  }
};

// Создание нового пункта меню
export const createMenuItem = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedData = createToolSchema.parse(req.body);
    
    // Если указан parent_id, проверяем его существование
    if (validatedData.parent_id) {
      const parent = await prisma.tool.findUnique({
        where: { id: validatedData.parent_id }
      });

      if (!parent) {
        res.status(400).json({ error: 'Parent menu item not found' });
        return;
      }
    }

    const menuItem = await prisma.tool.create({
      data: validatedData,
      include: {
        types: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        }
      }
    });

    res.status(201).json(menuItem);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    next(error);
  }
};

// Обновление пункта меню
export const updateMenuItem = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const validatedData = updateToolSchema.parse(req.body);

    // Если обновляется parent_id, проверяем его существование и предотвращаем циклические ссылки
    if (validatedData.parent_id !== undefined) {
      if (validatedData.parent_id === id) {
        res.status(400).json({ error: 'Menu item cannot be its own parent' });
        return;
      }

      if (validatedData.parent_id) {
        const parent = await prisma.tool.findUnique({
          where: { id: validatedData.parent_id }
        });

        if (!parent) {
          res.status(400).json({ error: 'Parent menu item not found' });
          return;
        }
      }
    }

    const menuItem = await prisma.tool.update({
      where: { id },
      data: validatedData,
      include: {
        types: {
          select: {
            id: true,
            name: true,
            chapter: true
          }
        }
      }
    });

    res.status(200).json(menuItem);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.issues });
      return;
    }
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      res.status(404).json({ error: 'Menu item not found' });
      return;
    }
    next(error);
  }
};

// Удаление пункта меню
export const deleteMenuItem = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Проверяем, есть ли дочерние элементы
    const children = await prisma.tool.findMany({
      where: { parent_id: id }
    });

    if (children.length > 0) {
      res.status(400).json({ 
        error: 'Cannot delete menu item with children. Please delete or move children first.' 
      });
      return;
    }

    await prisma.tool.delete({
      where: { id }
    });

    res.status(200).json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      res.status(404).json({ error: 'Menu item not found' });
      return;
    }
    next(error);
  }
};