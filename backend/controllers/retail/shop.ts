import { Request, Response } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import {
  getHierarchyItems,
  buildTree,
  HierarchyConfig
} from '../../utils/hierarchy.js';
import { getToolByLink } from '../../utils/toolUtils.js';

// Схемы валидации
const createAdSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  categoryId: z.string().uuid(),
  branchId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  article: z.string().optional().nullable(),
  condition: z.enum(['NEW', 'EXCELLENT', 'GOOD', 'SATISFACTORY', 'POOR']).default('GOOD'),
});

const updateAdSchema = createAdSchema.partial().extend({
  status: z.enum(['ACTIVE', 'SOLD', 'ARCHIVED', 'MODERATION']).optional(),
});

// Функция для проверки доступа к инструменту shop
// Правила:
// 1. DEVELOPER всегда имеет доступ
// 2. ADMIN с полными правами (FULL) на инструмент retail/shop имеет доступ
const checkShopAccess = async (userId: string): Promise<boolean> => {
  try {
    // Получаем пользователя и его роль
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        role: true,
        email: true,
      }
    });

    if (!user) {
      return false;
    }

    // DEVELOPER всегда имеет доступ
    if (user.role === 'DEVELOPER') {
      return true;
    }

    // Ищем инструмент retail/shop
    const shopTool = await prisma.tool.findFirst({
      where: { link: 'retail/shop' }
    });

    if (!shopTool) {
      return false;
    }

    // Проверяем доступ только для ADMIN с полными правами
    if (user.role === 'ADMIN') {
      // Проверяем доступ на уровне пользователя - только FULL доступ
      const userAccess = await prisma.userToolAccess.findFirst({
        where: {
          userId: userId,
          toolId: shopTool.id,
          accessLevel: 'FULL'
        }
      });

      if (userAccess) {
        return true;
      }

      // Получаем UserData для проверки доступа по должности и группе
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

      // Проверяем доступ на уровне должности - только FULL доступ
      const positionId = userData?.position?.uuid;
      if (positionId) {
        const positionAccess = await prisma.positionToolAccess.findFirst({
          where: {
            positionId: positionId,
            toolId: shopTool.id,
            accessLevel: 'FULL'
          }
        });

        if (positionAccess) {
          return true;
        }
      }

      // Проверяем доступ на уровне группы - только FULL доступ
      const groupId = userData?.position?.group?.uuid;
      if (groupId) {
        const groupAccess = await prisma.groupToolAccess.findFirst({
          where: {
            groupId: groupId,
            toolId: shopTool.id,
            accessLevel: 'FULL'
          }
        });

        if (groupAccess) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('[Shop] Error checking shop access:', error);
    return false;
  }
};

// Функция для проверки доступа к редактированию/удалению объявлений
const checkShopEditAccess = async (userId: string, shopUserId: string): Promise<boolean> => {
  try {
    // Автор (любой пользователь с базовыми правами) может редактировать/удалять свои объявления
    if (shopUserId === userId) {
      return true;
    }

    // Получаем пользователя и его роль
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        role: true,
        email: true,
        position: true
      }
    });

    if (!user) {
      return false;
    }

    // DEVELOPER может редактировать/удалять все объявления
    if (user.role === 'DEVELOPER') {
      return true;
    }

    // Ищем инструмент retail/shop
    const shopTool = await prisma.tool.findFirst({
      where: { link: 'retail/shop' }
    });

    if (!shopTool) {
      return false;
    }

    // Проверяем доступ на уровне пользователя - только FULL доступ для ADMIN
    if (user.role === 'ADMIN') {
      const userAccess = await prisma.userToolAccess.findFirst({
        where: {
          userId: userId,
          toolId: shopTool.id,
          accessLevel: 'FULL'
        }
      });

      if (userAccess) {
        return true;
      }

      // Получаем UserData для проверки доступа по должности и группе
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

      // Проверяем доступ на уровне должности - только FULL доступ
      const positionId = userData?.position?.uuid;
      if (positionId) {
        const positionAccess = await prisma.positionToolAccess.findFirst({
          where: {
            positionId: positionId,
            toolId: shopTool.id,
            accessLevel: 'FULL'
          }
        });

        if (positionAccess) {
          return true;
        }
      }

      // Проверяем доступ на уровне группы - только FULL доступ
      const groupId = userData?.position?.group?.uuid;
      if (groupId) {
        const groupAccess = await prisma.groupToolAccess.findFirst({
          where: {
            groupId: groupId,
            toolId: shopTool.id,
            accessLevel: 'FULL'
          }
        });

        if (groupAccess) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('[Shop] Error checking shop edit access:', error);
    return false;
  }
};

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  colorHex: z.string().optional().nullable(),
  parent_type: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

const shopTypeConfig: HierarchyConfig = {
  modelName: 'type',
  parentField: 'parent_type',
  sortField: 'sortOrder',
  nameField: 'name',
  childrenRelation: 'children'
};

// Получить все категории
export const getCategories = async (req: Request, res: Response) => {
  try {
    const tool = await getToolByLink('retail/shop');

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    // Получаем ВСЕ типы для данного chapter и model_uuid (без фильтра по parent_type)
    // чтобы построить полное дерево с иерархией
    const allTypes = await getHierarchyItems(prisma.type, shopTypeConfig, {
      additionalWhere: {
        model_uuid: tool.id,
        chapter: 'Категория'
      },
      select: {
        id: true,
        chapter: true,
        name: true,
        colorHex: true,
        parent_type: true,
        sortOrder: true,
        _count: {
          select: { shops: true } as any
        }
      }
    });

    // Строим дерево из всех типов с правильной сортировкой
    const tree = buildTree(
      allTypes,
      shopTypeConfig.parentField,
      shopTypeConfig.childrenRelation,
      null,
      shopTypeConfig.sortField,
      shopTypeConfig.nameField
    );

    // Фильтруем только корневые категории (parent_type = null)
    const rootCategories = tree.filter(item => !item.parent_type);
    
    res.json(rootCategories);
  } catch (error) {
    console.error('[Ads] Error getting categories:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
};

// Получить список филиалов
export const getBranches = async (req: Request, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { status: { not: 2 } }, // Исключаем закрытые
      select: {
        uuid: true,
        name: true,
        code: true,
        city: true,
        rrs: true,
      },
      orderBy: [{ name: 'asc' }],
    });
    res.json(branches);
  } catch (error) {
    console.error('[Ads] Error getting branches:', error);
    res.status(500).json({ error: 'Failed to get branches' });
  }
};

// Инициализировать стандартные категории
export const initCategories = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Проверяем доступ к инструменту shop
    if (!(await checkShopAccess(token.userId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const tool = await getToolByLink('retail/shop');

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    // Проверяем, есть ли уже категории
    const existingCount = await prisma.type.count({
      where: {
        model_uuid: tool.id,
        chapter: 'Категория',
      },
    });
    if (existingCount > 0) {
      return res.status(400).json({ error: 'Categories already exist. Delete existing categories first.' });
    }

    const defaultCategories = [
      { name: 'Бытовая техника', colorHex: '#FF6B6B', sortOrder: 1 },
      { name: 'Красота и здоровье', colorHex: '#FF8E53', sortOrder: 2 },
      { name: 'Смартфоны и фототехника', colorHex: '#4ECDC4', sortOrder: 3 },
      { name: 'ТВ, консоли и аудио', colorHex: '#45B7D1', sortOrder: 4 },
      { name: 'ПК, ноутбуки, периферия', colorHex: '#96CEB4', sortOrder: 5 },
      { name: 'Комплектующие для ПК', colorHex: '#FFEAA7', sortOrder: 6 },
      { name: 'Офис и мебель', colorHex: '#DDA15E', sortOrder: 7 },
      { name: 'Сетевое оборудование', colorHex: '#A8DADC', sortOrder: 8 },
      { name: 'Отдых и развлечения', colorHex: '#F1C40F', sortOrder: 9 },
      { name: 'Инструмент и стройка', colorHex: '#E67E22', sortOrder: 10 },
      { name: 'Садовая техника', colorHex: '#27AE60', sortOrder: 11 },
      { name: 'Дом, декор и посуда', colorHex: '#E74C3C', sortOrder: 12 },
      { name: 'Умный дом', colorHex: '#9B59B6', sortOrder: 13 },
      { name: 'Автотовары', colorHex: '#34495E', sortOrder: 14 },
      { name: 'Аксессуары и услуги', colorHex: '#95A5A6', sortOrder: 15 },
    ];

    // Создаем категории
    const created = await Promise.all(
      defaultCategories.map(cat =>
        prisma.type.create({
          data: {
            ...cat,
            model_uuid: tool.id,
            chapter: 'Категория',
          },
        })
      )
    );

    res.json({ message: 'Categories initialized', count: created.length, categories: created });
  } catch (error) {
    console.error('[Ads] Error initializing categories:', error);
    res.status(500).json({ error: 'Failed to initialize categories' });
  }
};

// Создать категорию
export const createCategory = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Проверяем доступ к инструменту shop
    if (!(await checkShopAccess(token.userId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const tool = await getToolByLink('retail/shop');

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }
    const data = createCategorySchema.parse(req.body);
    const category = await prisma.type.create({
      data: {
        ...data,
        model_uuid: tool.id,
        chapter: 'Категория',
      },
    });
    res.json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues});
    }
    console.error('[Ads] Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
};

// Обновить категорию
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Проверяем доступ к инструменту shop
    if (!(await checkShopAccess(token.userId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const data = createCategorySchema.partial().parse(req.body);
    const category = await prisma.type.update({
      where: { id },
      data,
    });
    res.json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error('[Ads] Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
};

// Удалить категорию
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Проверяем доступ к инструменту shop
    if (!(await checkShopAccess(token.userId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    // Проверяем, есть ли объявления в этой категории
    const adsCount = await prisma.shop.count({
      where: { categoryId: id },
    });
    if (adsCount > 0) {
      return res.status(400).json({ error: 'Cannot delete category with existing ads' });
    }
    await prisma.type.delete({
      where: { id },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[Ads] Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
};

// Получить объявления с фильтрами
export const getAds = async (req: Request, res: Response) => {
  try {
    const {
      categoryId,
      branchId,
      status,
      search,
      userId,
      page = '1',
      limit = '20',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where: any = {};
    
    if (categoryId) where.categoryId = String(categoryId);
    if (branchId) where.branchId = String(branchId);
    if (status) where.status = String(status);
    if (userId) where.userId = String(userId);
    if (search) {
      where.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } },
        { article: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const pageNum = parseInt(String(page));
    const limitNum = parseInt(String(limit));
    const skip = (pageNum - 1) * limitNum;

    const [ads, total] = await Promise.all([
      prisma.shop.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          [String(sortBy)]: sortOrder === 'asc' ? 'asc' : 'desc',
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              colorHex: true,
              parent_type: true,
            },
          },
          branch: {
            select: {
              uuid: true,
              name: true,
              code: true,
              city: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          attachments: {
            orderBy: { sortOrder: 'asc' },
            take: 1, // Только первое изображение для списка
          },
        },
      }),
      prisma.shop.count({ where }),
    ]);

    // Подтягиваем суммы резервов (PENDING/APPROVED), чтобы показать доступное количество
    const shopIds = ads.map(ad => ad.id);
    const reserves = shopIds.length
      ? await prisma.shopReserve.groupBy({
          by: ['shopId'],
          where: {
            shopId: { in: shopIds },
            status: { in: ['PENDING', 'APPROVED'] },
          },
          _sum: { quantity: true },
        })
      : [];

    const reserveMap = new Map(reserves.map(r => [r.shopId, r._sum.quantity || 0]));

    const enrichedAds = ads.map((ad: any) => {
      const reservedQuantity = reserveMap.get(ad.id) || 0;
      const availableQuantity = Math.max(ad.quantity - reservedQuantity, 0);
      return { ...ad, reservedQuantity, availableQuantity };
    });

    res.json({
      shops: enrichedAds,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[Ads] Error getting ads:', error);
    res.status(500).json({ error: 'Failed to get ads' });
  }
};

// Получить объявление по ID
export const getAdById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = (req as any).token;
    const userId = token?.userId;

    const shop = await prisma.shop.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            colorHex: true,
            parent_type: true,
          },
        },
        branch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            city: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        attachments: {
          orderBy: { sortOrder: 'asc' },
        },
        reserves: {
          include: {
            requester: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Увеличиваем счетчик просмотров
    await prisma.shop.update({
      where: { id },
      data: { views: { increment: 1 } },
    });

    // Суммируем активные резервы (PENDING/APPROVED)
    const reserves = await prisma.shopReserve.groupBy({
      by: ['shopId'],
      where: { shopId: id, status: { in: ['PENDING', 'APPROVED'] } },
      _sum: { quantity: true },
    });

    const reservedQuantity = reserves[0]?._sum.quantity || 0;
    const availableQuantity = Math.max(shop.quantity - reservedQuantity, 0);

    res.json({ ...shop, reservedQuantity, availableQuantity });
  } catch (error) {
    console.error('[Ads] Error getting ad:', error);
    res.status(500).json({ error: 'Failed to get ad' });
  }
};

// Подтвердить резерв и добавить номер документа отгрузки (для автора объявления)
export const confirmReserve = async (req: Request, res: Response) => {
  try {
    const { reserveId } = req.params;
    const { shipmentDocNumber } = req.body;
    const userId = (req as any).token?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!shipmentDocNumber || !shipmentDocNumber.trim()) {
      return res.status(400).json({ error: 'Номер документа обязателен' });
    }

    const reserve = await prisma.shopReserve.findUnique({
      where: { id: reserveId },
      include: {
        shop: {
          select: { id: true, title: true, userId: true },
        },
        requester: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!reserve) {
      return res.status(404).json({ error: 'Резерв не найден' });
    }

    // Только автор объявления
    if (reserve.shop.userId !== userId) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    if (reserve.status !== 'PENDING') {
      return res.status(400).json({ error: 'Резерв уже обработан' });
    }

    const updated = await prisma.shopReserve.update({
      where: { id: reserveId },
      data: {
        status: 'APPROVED',
        shipmentDocNumber: shipmentDocNumber.trim(),
        approvedAt: new Date(),
      },
    });

    // Отправляем уведомление запросившему
    try {
      const { NotificationController } = await import('../app/notification.js');
      await NotificationController.create({
        type: 'SUCCESS',
        channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
        title: 'Резерв подтвержден',
        message: `Ваш резерв по объявлению "${reserve.shop.title}" подтвержден. Документ: ${shipmentDocNumber.trim()}`,
        senderId: userId,
        receiverId: reserve.requester.id,
        priority: 'MEDIUM',
        action: {
          type: 'NAVIGATE',
          url: `/retail/shop?reserveId=${reserveId}`,
        },
      });
    } catch (notifError) {
      console.error('[Shop] Error sending notification:', notifError);
    }

    res.json(updated);
  } catch (error) {
    console.error('[Shop] Error confirming reserve:', error);
    res.status(500).json({ error: 'Failed to confirm reserve' });
  }
};

// Отменить резерв (может отменить как автор объявления, так и тот, кто забронировал)
export const cancelReserve = async (req: Request, res: Response) => {
  try {
    const { reserveId } = req.params;
    const userId = (req as any).token?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const reserve = await prisma.shopReserve.findUnique({
      where: { id: reserveId },
      include: {
        shop: {
          select: { id: true, title: true, userId: true },
        },
        requester: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!reserve) {
      return res.status(404).json({ error: 'Резерв не найден' });
    }

    // Проверяем права: может отменить автор объявления или тот, кто забронировал
    const isOwner = reserve.shop.userId === userId;
    const isRequester = reserve.requester.id === userId;

    if (!isOwner && !isRequester) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    // Нельзя отменить уже завершенный резерв
    if (reserve.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Нельзя отменить завершенный резерв' });
    }

    const updated = await prisma.shopReserve.update({
      where: { id: reserveId },
      data: {
        status: 'CANCELLED',
      },
    });

    // Отправляем уведомление другой стороне
    try {
      const { NotificationController } = await import('../app/notification.js');
      const receiverId = isOwner ? reserve.requester.id : reserve.shop.userId;
      const cancelledBy = isOwner ? 'продавцом' : 'покупателем';
      
      await NotificationController.create({
        type: 'INFO',
        channels: ['IN_APP', 'TELEGRAM'],
        title: 'Резерв отменен',
        message: `Резерв по объявлению "${reserve.shop.title}" отменен ${cancelledBy}`,
        senderId: userId,
        receiverId: receiverId,
        priority: 'MEDIUM',
        action: {
          type: 'NAVIGATE',
          url: `/retail/shop?reserveId=${reserveId}`,
        },
      });
    } catch (notifError) {
      console.error('[Shop] Error sending notification:', notifError);
    }

    res.json(updated);
  } catch (error) {
    console.error('[Shop] Error cancelling reserve:', error);
    res.status(500).json({ error: 'Failed to cancel reserve' });
  }
};

// Создать объявление
export const createAd = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const data = createAdSchema.parse(req.body);
    
    const shop = await prisma.shop.create({
      data: {
        ...data,
        userId: token.userId,
        status: 'ACTIVE',
        publishedAt: new Date(),
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            colorHex: true,
            parent_type: true,
          },
        },
        branch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            city: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        attachments: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    res.json(shop);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error('[Ads] Error creating ad:', error);
    res.status(500).json({ error: 'Failed to create ad' });
  }
};

// Обновить объявление
export const updateAd = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Проверяем, что пользователь владелец или админ
    const shop = await prisma.shop.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Проверяем доступ с помощью функции checkShopEditAccess
    const hasAccess = await checkShopEditAccess(token.userId, shop.userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const data = updateAdSchema.parse(req.body);
    
    const currentAd = await prisma.shop.findUnique({
      where: { id },
      select: { publishedAt: true },
    });

    const updatedAd = await prisma.shop.update({
      where: { id },
      data: {
        ...data,
        publishedAt: data.status === 'ACTIVE' && !currentAd?.publishedAt ? new Date() : undefined,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            colorHex: true,
            parent_type: true,
          },
        },
        branch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            city: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        attachments: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    res.json(updatedAd);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error('[Ads] Error updating ad:', error);
    res.status(500).json({ error: 'Failed to update ad' });
  }
};

// Удалить объявление
export const deleteAd = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const shop = await prisma.shop.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Проверяем доступ с помощью функции checkShopEditAccess
    const hasAccess = await checkShopEditAccess(token.userId, shop.userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.shop.delete({
      where: { id },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[Ads] Error deleting ad:', error);
    res.status(500).json({ error: 'Failed to delete ad' });
  }
};

// Функции избранного удалены

// ==================== AdRequest Functions ====================

// Удалено: функции работы с ShopRequest больше не нужны, так как ShopRequest удален из схемы
// Вместо этого используется универсальная система комментариев (Comment)
/* export const createAdRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).token?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Получаем пользователя для получения его филиала
    const requester = await prisma.user.findUnique({
      where: { id: userId },
      select: { branch: true },
    });

    if (!requester) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Проверяем, что объявление существует и получаем товары
    const shop = await prisma.shop.findUnique({
      where: { id },
      include: { 
        user: true,
        items: true,
      },
    });

    if (!shop) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    // Проверяем, что пользователь не создатель объявления
    if (shop.userId === userId) {
      return res.status(400).json({ error: 'Нельзя запросить в свою карточку' });
    }

    // Проверяем, нет ли уже активного запроса от этого пользователя
    const existingRequest = await prisma.shopRequest.findFirst({
      where: {
        shopId: id,
        requesterId: userId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    if (existingRequest) {
      return res.status(400).json({ error: 'У вас уже есть активный запрос на это объявление' });
    }

    // Создаем запрос с филиалом
    const request = await prisma.shopRequest.create({
      data: {
        shopId: id,
        requesterId: userId,
        requesterBranchId: requester.branch || null,
        status: 'PENDING',
        reserves: {
          create: shop.items.map((item: any) => ({
            itemId: item.id,
            quantity: item.quantity, // Резервируем все количество товара
          })),
        },
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        requesterBranch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            city: true,
          },
        },
        shop: {
          select: {
            id: true,
            title: true,
            userId: true,
          },
        },
        reserves: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                quantity: true,
              },
            },
          },
        },
      },
    });

    // Отправляем уведомление создателю объявления
    try {
      const { NotificationController } = await import('../app/notification.js');
      await NotificationController.create({
        type: 'INFO',
        channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
        title: 'Новый запрос в карточку',
        message: `${request.requester.name}${request.requesterBranch ? ` (${request.requesterBranch.name})` : ''} запросил товар из вашего объявления "${request.shop.title}"`,
        senderId: userId,
        receiverId: request.shop.userId,
        priority: 'MEDIUM',
        action: {
          type: 'NAVIGATE',
          url: `/retail/shop?requestId=${request.id}`,
        },
      });
    } catch (notifError) {
      console.error('[Ads] Error sending notification:', notifError);
      // Не прерываем выполнение, если уведомление не отправилось
    }

    res.json(request);
  } catch (error) {
    console.error('[Ads] Error creating request:', error);
    res.status(500).json({ error: 'Failed to create request' });
  }
};

// Получить запросы для объявления (для создателя)
export const getAdRequests = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).token?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Проверяем, что пользователь - создатель объявления
    const shop = await prisma.shop.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!shop || shop.userId !== userId) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    const requests = await prisma.shopRequest.findMany({
      where: { shopId: id },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        requesterBranch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            city: true,
          },
        },
        reserves: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                quantity: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(requests);
  } catch (error) {
    console.error('[Ads] Error getting requests:', error);
    res.status(500).json({ error: 'Failed to get requests' });
  }
};

// Получить запросы пользователя (для того, кто запрашивает)
export const getUserAdRequests = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).token?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requests = await prisma.shopRequest.findMany({
      where: { requesterId: userId },
      include: {
        requesterBranch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            city: true,
          },
        },
        reserves: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                quantity: true,
              },
            },
          },
        },
        shop: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
              },
            },
            images: {
              where: { isMain: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(requests);
  } catch (error) {
    console.error('[Ads] Error getting user requests:', error);
    res.status(500).json({ error: 'Failed to get user requests' });
  }
};

// Подтвердить запрос
export const approveAdRequest = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const userId = (req as any).token?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const request = await prisma.shopRequest.findUnique({
      where: { id: requestId },
      include: {
        shop: {
          select: {
            id: true,
            title: true,
            userId: true,
          },
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }

    // Проверяем, что пользователь - создатель объявления
    if (request.shop.userId !== userId) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Запрос уже обработан' });
    }

    // Обновляем статус
    const updatedRequest = await prisma.shopRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        requesterBranch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            city: true,
          },
        },
        reserves: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                quantity: true,
              },
            },
          },
        },
      },
    });

    // Отправляем уведомление запросившему
    try {
      const { NotificationController } = await import('../app/notification.js');
      await NotificationController.create({
        type: 'SUCCESS',
        channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
        title: 'Запрос подтвержден',
        message: `Ваш запрос на объявление "${request.shop.title}" подтвержден. Теперь вы можете добавить номер документа отгрузки.`,
        senderId: userId,
        receiverId: request.requesterId,
        priority: 'MEDIUM',
        action: {
          type: 'NAVIGATE',
          url: `/retail/shop?requestId=${requestId}`,
        },
      });
    } catch (notifError) {
      console.error('[Ads] Error sending notification:', notifError);
    }

    res.json(updatedRequest);
  } catch (error) {
    console.error('[Ads] Error approving request:', error);
    res.status(500).json({ error: 'Failed to approve request' });
  }
};

// Отклонить запрос
export const rejectAdRequest = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const userId = (req as any).token?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const request = await prisma.shopRequest.findUnique({
      where: { id: requestId },
      include: {
        shop: {
          select: {
            id: true,
            title: true,
            userId: true,
          },
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }

    // Проверяем, что пользователь - создатель объявления
    if (request.shop.userId !== userId) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Запрос уже обработан' });
    }

    // При отклонении удаляем резервы
    await prisma.shopItemReserve.deleteMany({
      where: { requestId: requestId },
    });

    // Обновляем статус
    const updatedRequest = await prisma.shopRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        requesterBranch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            city: true,
          },
        },
        reserves: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                quantity: true,
              },
            },
          },
        },
      },
    });

    // Отправляем уведомление запросившему
    try {
      const { NotificationController } = await import('../app/notification.js');
      await NotificationController.create({
        type: 'WARNING',
        channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
        title: 'Запрос отклонен',
        message: `Ваш запрос на объявление "${request.shop.title}" был отклонен.`,
        senderId: userId,
        receiverId: request.requesterId,
        priority: 'MEDIUM',
      });
    } catch (notifError) {
      console.error('[Ads] Error sending notification:', notifError);
    }

    res.json(updatedRequest);
  } catch (error) {
    console.error('[Ads] Error rejecting request:', error);
    res.status(500).json({ error: 'Failed to reject request' });
  }
};

// Добавить номер документа отгрузки
export const addShipmentDocNumber = async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { shipmentDocNumber } = req.body;
    const userId = (req as any).token?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!shipmentDocNumber || !shipmentDocNumber.trim()) {
      return res.status(400).json({ error: 'Номер документа обязателен' });
    }

    const request = await prisma.shopRequest.findUnique({
      where: { id: requestId },
      include: {
        shop: {
          select: {
            id: true,
            title: true,
            userId: true,
          },
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ error: 'Запрос не найден' });
    }

    // Проверяем, что пользователь - создатель объявления
    if (request.shop.userId !== userId) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    if (request.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Запрос должен быть подтвержден перед добавлением номера документа' });
    }

    // Обновляем запрос
    const updatedRequest = await prisma.shopRequest.update({
      where: { id: requestId },
      data: {
        shipmentDocNumber: shipmentDocNumber.trim(),
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        requesterBranch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            city: true,
          },
        },
        reserves: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                quantity: true,
              },
            },
          },
        },
      },
    });

    // Отправляем уведомление запросившему
    try {
      const { NotificationController } = await import('../app/notification.js');
      await NotificationController.create({
        type: 'SUCCESS',
        channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
        title: 'Документ отгрузки добавлен',
        message: `Для вашего запроса на объявление "${request.shop.title}" добавлен номер документа отгрузки: ${shipmentDocNumber.trim()}`,
        senderId: userId,
        receiverId: request.requesterId,
        priority: 'MEDIUM',
        action: {
          type: 'NAVIGATE',
          url: `/retail/shop?requestId=${requestId}`,
        },
      });
    } catch (notifError) {
      console.error('[Ads] Error sending notification:', notifError);
    }

    res.json(updatedRequest);
  } catch (error) {
    console.error('[Ads] Error adding shipment doc number:', error);
    res.status(500).json({ error: 'Failed to add shipment doc number' });
  }
}; */

// Создать резерв для объявления
export const createReserve = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { quantity, branchId } = req.body;

    // Валидация
    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Количество должно быть больше 0' });
    }

    // Проверяем существование объявления
    const shop = await prisma.shop.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        quantity: true,
        status: true,
        userId: true,
      },
    });

    if (!shop) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    if (shop.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Можно забронировать только активные объявления' });
    }

    // Проверяем, что пользователь не бронирует свое объявление
    if (shop.userId === token.userId) {
      return res.status(400).json({ error: 'Нельзя забронировать свое объявление' });
    }

    // Проверяем доступное количество
    const existingReserves = await prisma.shopReserve.findMany({
      where: {
        shopId: id,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    const reservedQuantity = existingReserves.reduce((sum, reserve) => sum + reserve.quantity, 0);
    const availableQuantity = shop.quantity - reservedQuantity;

    if (quantity > availableQuantity) {
      return res.status(400).json({ 
        error: `Доступно только ${availableQuantity} шт. (всего: ${shop.quantity}, забронировано: ${reservedQuantity})` 
      });
    }

    // Получаем филиал пользователя, если не указан
    let userBranchId = branchId;
    if (!userBranchId) {
      const user = await prisma.user.findUnique({
        where: { id: token.userId },
        select: { branch: true },
      });
      if (user?.branch) {
        // Пытаемся найти филиал по UUID или имени
        const branch = await prisma.branch.findFirst({
          where: {
            OR: [
              { uuid: user.branch },
              { name: user.branch },
              { code: user.branch },
            ],
          },
        });
        userBranchId = branch?.uuid || null;
      }
    }

    // Создаем резерв
    const reserve = await prisma.shopReserve.create({
      data: {
        shopId: id,
        requesterId: token.userId,
        branchId: userBranchId,
        quantity: quantity,
        status: 'PENDING',
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        branch: {
          select: {
            uuid: true,
            name: true,
            code: true,
            city: true,
          },
        },
        shop: {
          select: {
            id: true,
            title: true,
            userId: true,
          },
        },
      },
    });

    // Отправляем уведомление владельцу объявления
    try {
      const { NotificationController } = await import('../app/notification.js');
      await NotificationController.create({
        type: 'INFO',
        channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
        title: 'Новый запрос на резервирование',
        message: `Пользователь ${reserve.requester.name} запросил резервирование ${quantity} шт. товара "${shop.title}"`,
        senderId: token.userId,
        receiverId: shop.userId,
        priority: 'MEDIUM',
        action: {
          type: 'NAVIGATE',
          url: `/retail/shop?reserveId=${reserve.id}`,
        },
      });
    } catch (notifError) {
      console.error('[Shop] Error sending notification:', notifError);
    }

    res.json(reserve);
  } catch (error) {
    console.error('[Shop] Error creating reserve:', error);
    res.status(500).json({ error: 'Failed to create reserve' });
  }
};

