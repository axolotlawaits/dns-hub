import { Request, Response } from 'express';
import { prisma, accessPrivateKey, refreshPrivateKey } from '../../server.js';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

// Проверка роли DEVELOPER
const checkDeveloperRole = async (req: Request, res: Response): Promise<boolean> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return false;
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true }
    });

    if (!user || user.role !== 'DEVELOPER') {
      res.status(403).json({
        success: false,
        error: 'Доступ запрещен. Требуется роль DEVELOPER'
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error checking developer role:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
    return false;
  }
};

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['EMPLOYEE', 'ADMIN', 'DEVELOPER']),
  position: z.string().optional(),
  group: z.string().optional(),
  isActive: z.boolean().default(true),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['EMPLOYEE', 'ADMIN', 'DEVELOPER']).optional(),
  position: z.string().optional(),
  group: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const getUsers = async (req: Request, res: Response): Promise<any> => {
  if (!(await checkDeveloperRole(req, res))) return;

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Получаем общее количество пользователей
    const total = await prisma.user.count();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        branch: true,
        updatedAt: true,
      },
      orderBy: {
        name: 'asc'
      },
      skip,
      take: limit,
    });

    // Получаем UserData для каждого пользователя по email
    const userEmails = users.map(u => u.email);
    const userDataMap = new Map();
    
    if (userEmails.length > 0) {
      const userDataList = await prisma.userData.findMany({
        where: {
          email: { in: userEmails }
        },
        select: {
          email: true,
          position: {
            select: {
              name: true,
              groupUuid: true,
              group: {
                select: {
                  name: true,
                }
              }
            }
          }
        }
      });

      userDataList.forEach(ud => {
        userDataMap.set(ud.email, {
          position: ud.position?.name || null,
          group: ud.position?.group?.name || null,
        });
      });
    }

    const formattedUsers = users.map(user => {
      const userData = userDataMap.get(user.email);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        position: userData?.position || user.position || null,
        group: userData?.group || null,
        isActive: true, // TODO: Добавить поле isActive в модель User
        createdAt: null, // Поле отсутствует в модели
        updatedAt: user.updatedAt.toISOString(),
      };
    });

    return res.json({
      success: true,
      data: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    console.error('❌ [Users] Error getting users:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const getUserById = async (req: Request, res: Response): Promise<any> => {
  if (!(await checkDeveloperRole(req, res))) return;

  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        branch: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Получаем UserData по email
    const userData = await prisma.userData.findUnique({
      where: { email: user.email },
      select: {
        position: {
          select: {
            name: true,
            group: {
              select: {
                name: true,
              }
            }
          }
        }
      }
    });

    return res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        position: userData?.position?.name || user.position || null,
        group: userData?.position?.group?.name || null,
        isActive: true,
        createdAt: null,
        updatedAt: user.updatedAt.toISOString(),
      }
    });
  } catch (error) {
    console.error('❌ [Users] Error getting user by ID:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const createUser = async (req: Request, res: Response): Promise<any> => {
  if (!(await checkDeveloperRole(req, res))) return;

  try {
    const validatedData = createUserSchema.parse(req.body);
    
    // Проверяем, существует ли пользователь с таким email
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // TODO: Реализовать создание пользователя с паролем
    return res.status(501).json({
      success: false,
      error: 'Not implemented yet'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.issues
      });
    }
    console.error('❌ [Users] Error creating user:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const updateUser = async (req: Request, res: Response): Promise<any> => {
  if (!(await checkDeveloperRole(req, res))) return;

  try {
    const { id } = req.params;
    const validatedData = updateUserSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Обновляем пользователя
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name: validatedData.name,
        email: validatedData.email,
        role: validatedData.role,
      },
    });

    // Обновляем UserData если есть (связь через email)
    if (validatedData.position !== undefined || validatedData.group !== undefined) {
      const userData = await prisma.userData.findUnique({
        where: { email: updatedUser.email }
      });

      if (userData && validatedData.position) {
        // Ищем Position по имени
        const position = await prisma.position.findFirst({
          where: { name: validatedData.position },
          include: { group: true }
        });

        if (position) {
          await prisma.userData.update({
            where: { uuid: userData.uuid },
            data: {
              positionId: position.uuid,
            },
          });
        }
      }
    }

    return res.json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.issues
      });
    }
    console.error('❌ [Users] Error updating user:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<any> => {
  if (!(await checkDeveloperRole(req, res))) return;

  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Нельзя удалить самого себя
    const token = (req as any).token;
    if (token.userId === id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete yourself'
      });
    }

    // TODO: Реализовать мягкое удаление или полное удаление
    return res.status(501).json({
      success: false,
      error: 'Not implemented yet'
    });
  } catch (error) {
    console.error('❌ [Users] Error deleting user:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Войти как пользователь (только для ADMIN и DEVELOPER)
export const loginAsUser = async (req: Request, res: Response): Promise<any> => {
  try {
    // Проверяем роль текущего пользователя
    const hasAccess = await checkDeveloperRole(req, res);
    if (!hasAccess) {
      return; // checkDeveloperRole уже отправил ответ
    }

    // Проверяем, что текущий пользователь ADMIN или DEVELOPER
    const token = (req as any).token;
    const currentUser = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true }
    });

    if (!currentUser || !['ADMIN', 'DEVELOPER'].includes(currentUser.role || '')) {
      return res.status(403).json({
        success: false,
        error: 'Доступ запрещен. Требуется роль ADMIN или DEVELOPER'
      });
    }

    const { userId } = req.params;

    // Получаем пользователя, под которого нужно войти
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        branch: true,
        role: true
      }
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    // Получаем groupName и userUuid для токена
    const getGroupName = await prisma.position.findUnique({
      where: { name: targetUser.position },
      select: { group: { select: { name: true } } }
    });

    const getUserUuid = await prisma.userData.findUnique({
      where: { email: targetUser.email },
      select: { uuid: true }
    });

    const groupName = getGroupName?.group?.name;
    const userUuid = getUserUuid?.uuid;

    // Сохраняем токен администратора в localStorage перед входом под пользователем
    // В реальности нужно сохранить его на клиенте перед заменой токена
    // Генерируем токены для целевого пользователя
    const payload = {
      userId: targetUser.id,
      userUuid,
      positionName: targetUser.position,
      groupName,
      userRole: targetUser.role,
      impersonatedBy: token.userId, // Сохраняем ID администратора, который вошел как пользователь
      originalToken: token.userId // Сохраняем ID администратора для возврата
    };

    const accessToken = jwt.sign(payload, accessPrivateKey, { algorithm: 'RS256', expiresIn: '30m' });
    const refreshToken = jwt.sign(payload, refreshPrivateKey, { algorithm: 'RS256', expiresIn: '90d' });

    // Логируем действие
    try {
      await prisma.auditLog.create({
        data: {
          userId: token.userId,
          action: 'IMPERSONATE_USER',
          entityType: 'User',
          entityId: targetUser.id,
          details: {
            targetUserId: targetUser.id,
            targetUserName: targetUser.name,
            targetUserEmail: targetUser.email
          }
        }
      });
    } catch (auditError) {
      console.error('❌ [Users] Error creating audit log:', auditError);
      // Не прерываем выполнение, если логирование не удалось
    }

    return res.json({
      success: true,
      token: accessToken,
      refreshToken: refreshToken,
      user: targetUser
    });
  } catch (error) {
    console.error('❌ [Users] Error logging in as user:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

