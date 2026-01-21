import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../server.js';
import { SocketIOService } from '../../socketio.js';
import axios from 'axios';
import { findUserByResponsibleData } from '../../utils/findUserByResponsible.js';
import { NotificationController } from '../app/notification.js';

const JOURNALS_API_URL = process.env.JOURNALS_API_URL || '';

// Функция для получения токена из заголовков
const getAuthToken = (req: Request): string | null => {
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    console.error('[SafetyJournalChat] No authorization header found in request');
    return null;
  }
  return authHeader.split(' ')[1] || null;
};

// Функция для создания заголовков с авторизацией
const createAuthHeaders = (token: string | null) => {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

// Функция для проверки, является ли пользователь проверяющим
const isChecker = async (userId: string): Promise<boolean> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user?.role === 'SUPERVISOR') {
      return true;
    }

    const safetyTool = await prisma.tool.findFirst({
      where: { link: 'jurists/safety' }
    });

    if (!safetyTool) {
      return false;
    }

    // Проверяем доступ на уровне пользователя
    const userAccess = await prisma.userToolAccess.findFirst({
      where: {
        userId: userId,
        toolId: safetyTool.id,
        accessLevel: 'FULL'
      }
    });

    if (userAccess) {
      return true;
    }

    // Проверяем доступ на уровне должности
    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });

    if (userData?.email) {
      const userDataRecord = await prisma.userData.findFirst({
        where: { email: userData.email },
        select: { positionId: true }
      });

      if (userDataRecord?.positionId) {
        const positionAccess = await prisma.positionToolAccess.findFirst({
          where: {
            positionId: userDataRecord.positionId,
            toolId: safetyTool.id,
            accessLevel: 'FULL'
          }
        });

        if (positionAccess) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('[SafetyJournalChat] Error checking if user is checker:', error);
    return false;
  }
};

// Кэш для результатов проверки ответственных (TTL: 5 минут)
const responsibleCache = new Map<string, { result: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут в миллисекундах

// Функция для проверки, является ли пользователь ответственным по филиалу
const isResponsibleForBranch = async (userId: string, branchId: string, token: string): Promise<boolean> => {
  try {
    // Проверяем кэш
    const cacheKey = `${userId}:${branchId}`;
    const cached = responsibleCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.result;
    }

    if (!JOURNALS_API_URL) {
      console.error('[SafetyJournalChat] JOURNALS_API_URL is not defined');
      return false;
    }

    // Получаем информацию о пользователе из локальной БД
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true }
    });

    if (!user) {
      console.error('[SafetyJournalChat] isResponsibleForBranch - user not found:', userId);
      return false;
    }

    // Получаем ответственных по филиалу из внешнего API
    const response = await axios.get(`${JOURNALS_API_URL}/branch_responsibles/?branchId=${branchId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Структура ответа: массив объектов [{ branch_id, branch_name, responsibles: [...] }]
    let result = false;
    if (response.data && Array.isArray(response.data)) {
      for (const branchData of response.data) {
        if (branchData.branch_id === branchId && branchData.responsibles && Array.isArray(branchData.responsibles)) {
          const responsibles = branchData.responsibles;
          
          // Загружаем все UserData записи одним запросом для оптимизации
          const employeeIds = responsibles.map((r: any) => r.employee_id).filter(Boolean);
          const employeeEmails = responsibles.map((r: any) => r.employee_email).filter(Boolean);
          
          // Для поиска по имени используем более широкий запрос или делаем отдельные запросы
          const userDataRecords = await prisma.userData.findMany({
            where: {
              OR: [
                ...(employeeIds.length > 0 ? [{ code: { in: employeeIds } }] : []),
                ...(employeeEmails.length > 0 ? [{ email: { in: employeeEmails } }] : [])
              ]
            },
            select: { code: true, email: true, fio: true }
          });
          
          // Создаем мапу для быстрого поиска
          const userDataByCodeMap = new Map<string, any>();
          const userDataByEmailMap = new Map<string, any>();
          userDataRecords.forEach(record => {
            if (record.code) userDataByCodeMap.set(record.code, record);
            if (record.email) userDataByEmailMap.set(record.email.toLowerCase(), record);
          });
          
          // Проверяем несколькими способами
          for (const resp of responsibles) {
            // Способ 1: По employee_id напрямую
            if (resp.employee_id === userId) {
              result = true;
              break;
            }
            
            // Способ 2: По email напрямую
            if (resp.employee_email && user.email && resp.employee_email.toLowerCase() === user.email.toLowerCase()) {
              result = true;
              break;
            }
            
            // Способ 3: По employee_id через UserData.code
            if (resp.employee_id) {
              const userData = userDataByCodeMap.get(resp.employee_id);
              if (userData?.email && userData.email.toLowerCase() === user.email?.toLowerCase()) {
                result = true;
                break;
              }
            }
            
            // Способ 4: По email через UserData
            if (resp.employee_email) {
              const userData = userDataByEmailMap.get(resp.employee_email.toLowerCase());
              if (userData?.email && userData.email.toLowerCase() === user.email?.toLowerCase()) {
                result = true;
                break;
              }
            }
            
            // Способ 5: По имени через UserData.fio (делаем отдельный запрос для каждого имени)
            if (resp.employee_name && !result) {
              const firstName = resp.employee_name.split(' ')[0];
              if (firstName) {
                const userDataByName = await prisma.userData.findFirst({
                  where: { 
                    fio: { contains: firstName, mode: 'insensitive' },
                    email: user.email || ''
                  },
                  select: { email: true }
                });
                if (userDataByName?.email && userDataByName.email.toLowerCase() === user.email?.toLowerCase()) {
                  result = true;
                  break;
                }
              }
            }
          }
          
          if (result) break;
        }
      }
    }

    // Сохраняем результат в кэш
    responsibleCache.set(cacheKey, { result, timestamp: Date.now() });
    
    // Очищаем старые записи из кэша (раз в 10 минут)
    if (responsibleCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of responsibleCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          responsibleCache.delete(key);
        }
      }
    }

    return result;
  } catch (error) {
    console.error('[SafetyJournalChat] Error checking if user is responsible for branch:', error);
    return false;
  }
};

// Схемы валидации
const createMessageSchema = z.object({
  branchId: z.string(),
  message: z.string().optional(), // Сообщение опционально, если есть файлы
  quotedMessageId: z.string().optional(), // ID цитируемого сообщения
}).refine((data) => data.message && data.message.trim().length > 0 || true, {
  message: 'Сообщение или файлы обязательны',
});

const getChatsSchema = z.object({
  branchId: z.string().optional(),
});

// Функция для получения всех пользователей (для выбора собеседника)
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        position: true,
        branch: true
      },
      orderBy: { name: 'asc' }
    });

    res.json(users);
  } catch (error) {
    console.error('[SafetyJournalChat] Error getting all users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};

// Получить все филиалы с чатами (для проверяющего)
export const getBranchesWithChats = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userIsChecker = await isChecker(token.userId);
    if (!userIsChecker) {
      return res.status(403).json({ error: 'Только проверяющие могут видеть все чаты' });
    }

    // Получаем токен из заголовков для запроса к внешнему API
    const authToken = getAuthToken(req);
    if (!authToken) {
      console.error('[SafetyJournalChat] getBranchesWithChats - No authorization token found');
      return res.status(401).json({ error: 'Токен авторизации не найден' });
    }

    // Получаем все филиалы из внешнего API (чтобы показать все филиалы, даже без чатов)
    let allBranches: any[] = [];
    try {
      const branchesResponse = await axios.get(`${JOURNALS_API_URL}/me/branches_with_journals`, {
        headers: createAuthHeaders(authToken)
      });
      
      if (branchesResponse.data && branchesResponse.data.branches) {
        allBranches = branchesResponse.data.branches;
        console.log('[SafetyJournalChat] getBranchesWithChats - received branches from external API:', allBranches.length);
      }
    } catch (apiError) {
      console.error('[SafetyJournalChat] getBranchesWithChats - Error fetching branches from external API:', apiError);
      // Продолжаем работу даже если внешний API недоступен
    }

    // Получаем все чаты из локальной БД
    const chats = await prisma.safetyJournalChat.findMany({
      include: {
        checker: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            position: true,
            branch: true
          }
        },
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 1 // Последнее сообщение для превью
        },
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    console.log('[SafetyJournalChat] getBranchesWithChats - found chats in DB:', chats.length);

    // Группируем чаты по филиалам
    const chatsByBranch = new Map();
    
    for (const chat of chats) {
      if (!chatsByBranch.has(chat.branchId)) {
        chatsByBranch.set(chat.branchId, []);
      }
      chatsByBranch.get(chat.branchId).push({
        ...chat,
        branch: null // Будет заполнено позже
      });
    }

    // Создаем массив филиалов (сам филиал и есть чат)
    const branchesMap = new Map();
    
    // Сначала добавляем филиалы из внешнего API
    for (const apiBranch of allBranches) {
      const branchId = apiBranch.branch_id;
      const localBranch = await prisma.branch.findUnique({
        where: { uuid: branchId },
        select: {
          uuid: true,
          name: true,
          address: true
        }
      });

      // Находим последнее сообщение из всех чатов этого филиала для превью
      const branchChats = chatsByBranch.get(branchId) || [];
      let lastMessage = null;
      let unreadCount = 0;
      
      if (branchChats.length > 0) {
        // Берем последнее сообщение из самого свежего чата
        const sortedChats = branchChats.sort((a: any, b: any) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        const latestChat = sortedChats[0];
        if (latestChat.messages && latestChat.messages.length > 0) {
          lastMessage = latestChat.messages[0];
        }
        // Подсчитываем непрочитанные сообщения (упрощенно - берем из первого чата)
        unreadCount = latestChat._count?.messages || 0;
      }
      
      // Добавляем информацию о филиале из локальной БД, если есть
      branchesMap.set(branchId, {
        branchId: branchId,
        branchName: localBranch?.name || apiBranch.branch_name || 'Неизвестный филиал',
        branchAddress: localBranch?.address || apiBranch.branch_address || '',
        lastMessage: lastMessage,
        unreadCount: unreadCount,
        updatedAt: branchChats.length > 0 
          ? branchChats.sort((a: any, b: any) => 
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            )[0].updatedAt
          : null
      });
    }

    // Также добавляем филиалы, у которых есть чаты, но которых нет в списке из внешнего API
    for (const [branchId, branchChats] of chatsByBranch.entries()) {
      if (!branchesMap.has(branchId)) {
        const localBranch = await prisma.branch.findUnique({
          where: { uuid: branchId },
          select: {
            uuid: true,
            name: true,
            address: true
          }
        });

        if (localBranch) {
          const sortedChats = branchChats.sort((a: any, b: any) => 
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          const latestChat = sortedChats[0];
          const lastMessage = latestChat.messages && latestChat.messages.length > 0 
            ? latestChat.messages[0] 
            : null;
          
          branchesMap.set(branchId, {
            branchId: branchId,
            branchName: localBranch.name,
            branchAddress: localBranch.address,
            lastMessage: lastMessage,
            unreadCount: latestChat._count?.messages || 0,
            updatedAt: latestChat.updatedAt
          });
        }
      }
    }

    const branchesWithChats = Array.from(branchesMap.values());
    
    console.log('[SafetyJournalChat] getBranchesWithChats - returning branches:', branchesWithChats.length);

    res.json(branchesWithChats);
  } catch (error) {
    console.error('[SafetyJournalChat] Error getting branches with chats:', error);
    res.status(500).json({ error: 'Failed to get branches with chats' });
  }
};

// Функция для получения проверяющих для конкретного филиала (для ответственных)
export const getCheckersForBranch = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { branchId } = req.query;
    if (!branchId || typeof branchId !== 'string') {
      return res.status(400).json({ error: 'branchId is required' });
    }

    const authToken = (req as any).headers.authorization?.replace('Bearer ', '') || '';

    // Получаем ответственных из внешнего API
    let responsiblesIds: string[] = [];
    try {
      const responsiblesResponse = await axios.get(
        `${JOURNALS_API_URL}/branch_responsibles/?branchId=${branchId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Структура ответа: массив объектов [{ branch_id, branch_name, responsibles: [...] }]
      if (responsiblesResponse.data && Array.isArray(responsiblesResponse.data)) {
        for (const branchData of responsiblesResponse.data) {
          if (branchData.branch_id === branchId && branchData.responsibles && Array.isArray(branchData.responsibles)) {
            responsiblesIds = branchData.responsibles
              .map((resp: any) => resp.employee_id)
              .filter(Boolean);
            break;
          }
        }
      }
    } catch (error) {
      console.error('[SafetyJournalChat] Error getting responsibles from external API:', error);
    }

    // Получаем проверяющих (пользователей с полным доступом)
    const safetyTool = await prisma.tool.findFirst({
      where: { link: 'jurists/safety' }
    });

    if (!safetyTool) {
      return res.status(404).json({ error: 'Инструмент jurists/safety не найден' });
    }

    const userIds = new Set<string>();

    // SUPERVISOR всегда имеет доступ
    const supervisors = await prisma.user.findMany({
      where: { role: 'SUPERVISOR' },
      select: { id: true }
    });
    supervisors.forEach(u => userIds.add(u.id));

    // Пользователи с FULL доступом на уровне пользователя
    const userAccesses = await prisma.userToolAccess.findMany({
      where: {
        toolId: safetyTool.id,
        accessLevel: 'FULL'
      },
      select: { userId: true }
    });
    userAccesses.forEach(a => userIds.add(a.userId));

    // Пользователи с FULL доступом на уровне должности
    const positionAccesses = await prisma.positionToolAccess.findMany({
      where: {
        toolId: safetyTool.id,
        accessLevel: 'FULL'
      },
      select: { positionId: true }
    });

    const positionIds = positionAccesses.map(a => a.positionId);
    if (positionIds.length > 0) {
      const usersWithPositionAccess = await prisma.userData.findMany({
        where: {
          positionId: { in: positionIds }
        },
        select: { email: true }
      });

      for (const userData of usersWithPositionAccess) {
        if (userData.email) {
          const user = await prisma.user.findUnique({
            where: { email: userData.email },
            select: { id: true }
          });
          if (user) {
            userIds.add(user.id);
          }
        }
      }
    }

    // Пользователи с FULL доступом на уровне группы
    const groupAccesses = await prisma.groupToolAccess.findMany({
      where: {
        toolId: safetyTool.id,
        accessLevel: 'FULL'
      },
      select: { groupId: true }
    });

    const groupIds = groupAccesses.map(a => a.groupId);
    if (groupIds.length > 0) {
      const positionsInGroups = await prisma.position.findMany({
        where: {
          groupUuid: { in: groupIds }
        },
        select: { uuid: true }
      });

      const positionIdsFromGroups = positionsInGroups.map(p => p.uuid);
      if (positionIdsFromGroups.length > 0) {
        const usersWithGroupAccess = await prisma.userData.findMany({
          where: {
            positionId: { in: positionIdsFromGroups }
          },
          select: { email: true }
        });

        for (const userData of usersWithGroupAccess) {
          if (userData.email) {
            const user = await prisma.user.findUnique({
              where: { email: userData.email },
              select: { id: true }
            });
            if (user) {
              userIds.add(user.id);
            }
          }
        }
      }
    }

    // Получаем информацию о проверяющих
    const checkers = await prisma.user.findMany({
      where: {
        id: { in: Array.from(userIds) }
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        position: true,
        branch: true
      },
      orderBy: { name: 'asc' }
    });

    res.json(checkers);
  } catch (error) {
    console.error('[SafetyJournalChat] Error getting checkers for branch:', error);
    res.status(500).json({ error: 'Failed to get checkers' });
  }
};

// Функция для получения всех проверяющих (пользователей с полным доступом к jurists/safety)
export const getCheckers = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const safetyTool = await prisma.tool.findFirst({
      where: { link: 'jurists/safety' }
    });

    if (!safetyTool) {
      return res.status(404).json({ error: 'Инструмент jurists/safety не найден' });
    }

    const userIds = new Set<string>();

    // SUPERVISOR всегда имеет доступ
    const supervisors = await prisma.user.findMany({
      where: { role: 'SUPERVISOR' },
      select: { id: true }
    });
    supervisors.forEach(u => userIds.add(u.id));

    // Пользователи с FULL доступом на уровне пользователя
    const userAccesses = await prisma.userToolAccess.findMany({
      where: {
        toolId: safetyTool.id,
        accessLevel: 'FULL'
      },
      select: { userId: true }
    });
    userAccesses.forEach(a => userIds.add(a.userId));

    // Пользователи с FULL доступом на уровне должности
    const positionAccesses = await prisma.positionToolAccess.findMany({
      where: {
        toolId: safetyTool.id,
        accessLevel: 'FULL'
      },
      select: { positionId: true }
    });

    const positionIds = positionAccesses.map(a => a.positionId);
    if (positionIds.length > 0) {
      const usersWithPositionAccess = await prisma.userData.findMany({
        where: {
          positionId: { in: positionIds }
        },
        select: { email: true }
      });

      for (const userData of usersWithPositionAccess) {
        if (userData.email) {
          const user = await prisma.user.findUnique({
            where: { email: userData.email },
            select: { id: true }
          });
          if (user) {
            userIds.add(user.id);
          }
        }
      }
    }

    // Пользователи с FULL доступом на уровне группы
    const groupAccesses = await prisma.groupToolAccess.findMany({
      where: {
        toolId: safetyTool.id,
        accessLevel: 'FULL'
      },
      select: { groupId: true }
    });

    const groupIds = groupAccesses.map(a => a.groupId);
    if (groupIds.length > 0) {
      const positionsInGroups = await prisma.position.findMany({
        where: {
          groupUuid: { in: groupIds }
        },
        select: { uuid: true }
      });

      const positionIdsFromGroups = positionsInGroups.map(p => p.uuid);
      if (positionIdsFromGroups.length > 0) {
        const usersWithGroupAccess = await prisma.userData.findMany({
          where: {
            positionId: { in: positionIdsFromGroups }
          },
          select: { email: true }
        });

        for (const userData of usersWithGroupAccess) {
          if (userData.email) {
            const user = await prisma.user.findUnique({
              where: { email: userData.email },
              select: { id: true }
            });
            if (user) {
              userIds.add(user.id);
            }
          }
        }
      }
    }

    // Получаем информацию о пользователях
    const checkers = await prisma.user.findMany({
      where: {
        id: { in: Array.from(userIds) }
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        position: true,
        branch: true
      },
      orderBy: { name: 'asc' }
    });

    res.json(checkers);
  } catch (error) {
    console.error('[SafetyJournalChat] Error getting checkers:', error);
    res.status(500).json({ error: 'Failed to get checkers' });
  }
};

// Получить всех участников чата для ответственного (проверяющие + другие ответственные за филиал)
export const getChatParticipants = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { branchId } = req.query;
    if (!branchId || typeof branchId !== 'string') {
      return res.status(400).json({ error: 'branchId is required' });
    }

    const participantIds = new Set<string>();

    // Получаем проверяющих (код из getCheckers)
    const safetyTool = await prisma.tool.findFirst({
      where: { link: 'jurists/safety' }
    });

    if (safetyTool) {
      // SUPERVISOR всегда имеет доступ
      const supervisors = await prisma.user.findMany({
        where: { role: 'SUPERVISOR' },
        select: { id: true }
      });
      supervisors.forEach(u => participantIds.add(u.id));

      // Пользователи с FULL доступом на уровне пользователя
      const userAccesses = await prisma.userToolAccess.findMany({
        where: {
          toolId: safetyTool.id,
          accessLevel: 'FULL'
        },
        select: { userId: true }
      });
      userAccesses.forEach(a => participantIds.add(a.userId));

      // Пользователи с FULL доступом на уровне должности
      const positionAccesses = await prisma.positionToolAccess.findMany({
        where: {
          toolId: safetyTool.id,
          accessLevel: 'FULL'
        },
        select: { positionId: true }
      });

      const positionIds = positionAccesses.map(a => a.positionId);
      if (positionIds.length > 0) {
        const usersWithPositionAccess = await prisma.userData.findMany({
          where: {
            positionId: { in: positionIds }
          },
          select: { email: true }
        });

        for (const userData of usersWithPositionAccess) {
          if (userData.email) {
            const user = await prisma.user.findUnique({
              where: { email: userData.email },
              select: { id: true }
            });
            if (user) {
              participantIds.add(user.id);
            }
          }
        }
      }

      // Пользователи с FULL доступом на уровне группы
      const groupAccesses = await prisma.groupToolAccess.findMany({
        where: {
          toolId: safetyTool.id,
          accessLevel: 'FULL'
        },
        select: { groupId: true }
      });

      const groupIds = groupAccesses.map(a => a.groupId);
      if (groupIds.length > 0) {
        const positionsInGroups = await prisma.position.findMany({
          where: {
            groupUuid: { in: groupIds }
          },
          select: { uuid: true }
        });

        const positionIdsFromGroups = positionsInGroups.map(p => p.uuid);
        if (positionIdsFromGroups.length > 0) {
          const usersWithGroupAccess = await prisma.userData.findMany({
            where: {
              positionId: { in: positionIdsFromGroups }
            },
            select: { email: true }
          });

          for (const userData of usersWithGroupAccess) {
            if (userData.email) {
              const user = await prisma.user.findUnique({
                where: { email: userData.email },
                select: { id: true }
              });
              if (user) {
                participantIds.add(user.id);
              }
            }
          }
        }
      }
    }

    // Получаем ответственных за филиал из внешнего API
    try {
      // Получаем токен из заголовков
      const authToken = getAuthToken(req);

      if (!authToken) {
        console.error('[SafetyJournalChat] No authorization token found');
      } else {
        // Получаем ответственных из внешнего API
        const responsiblesResponse = await axios.get(
          `${JOURNALS_API_URL}/branch_responsibles/?branchId=${branchId}`,
          {
            headers: createAuthHeaders(authToken)
          }
        );

        // Структура ответа: массив объектов [{ branch_id, branch_name, responsibles: [...] }]
        console.log('[SafetyJournalChat] getChatParticipants - responsiblesResponse.data:', JSON.stringify(responsiblesResponse.data, null, 2));
        
        if (responsiblesResponse.data && Array.isArray(responsiblesResponse.data)) {
          for (const branchData of responsiblesResponse.data) {
            console.log('[SafetyJournalChat] getChatParticipants - branchData:', JSON.stringify(branchData, null, 2));
            console.log('[SafetyJournalChat] getChatParticipants - comparing branchData.branch_id:', branchData.branch_id, 'with branchId:', branchId);
            
            if (branchData.branch_id === branchId && branchData.responsibles && Array.isArray(branchData.responsibles)) {
              const responsibles = branchData.responsibles;
              console.log('[SafetyJournalChat] getChatParticipants - found responsibles:', responsibles.length);
              
              // Для каждого ответственного находим пользователя в локальной БД
              for (const resp of responsibles) {
                console.log('[SafetyJournalChat] getChatParticipants - processing responsible:', JSON.stringify(resp, null, 2));
                
                // Используем общую утилиту для поиска пользователя
                const responsibleUser = await findUserByResponsibleData(
                  prisma,
                  {
                    employee_id: resp.employee_id,
                    employee_email: resp.employee_email,
                    employee_name: resp.employee_name
                  },
                  {
                    select: { id: true, name: true, email: true }
                  }
                );
                
                if (process.env.NODE_ENV === 'development') {
                  console.log('[SafetyJournalChat] getChatParticipants - found user:', responsibleUser ? responsibleUser.id : 'NOT FOUND', {
                    employee_id: resp.employee_id,
                    employee_name: resp.employee_name
                  });
                }
                
                if (resp.employee_id || resp.employee_email || resp.employee_name) {

                  if (responsibleUser) {
                    participantIds.add(responsibleUser.id);
                    console.log('[SafetyJournalChat] getChatParticipants - added participant:', responsibleUser.id);
                  } else {
                    console.warn('[SafetyJournalChat] getChatParticipants - user not found for responsible:', {
                      employee_id: resp.employee_id,
                      employee_email: resp.employee_email,
                      employee_name: resp.employee_name
                    });
                  }
                } else {
                  console.warn('[SafetyJournalChat] getChatParticipants - responsible has no identifying fields:', JSON.stringify(resp, null, 2));
                }
              }
              break; // Нашли нужный филиал, выходим из цикла
            } else {
              console.log('[SafetyJournalChat] getChatParticipants - branch_id mismatch or no responsibles');
            }
          }
        } else {
          console.warn('[SafetyJournalChat] getChatParticipants - responsiblesResponse.data is not an array:', typeof responsiblesResponse.data);
        }
      }
    } catch (apiError) {
      console.error('[SafetyJournalChat] Error fetching responsibles from external API:', apiError);
      // Продолжаем работу даже если внешний API недоступен
    }

    // ИЗМЕНЕНО: Сохраняем типы ответственности для каждого участника
    // Мапа: userId -> массив типов ответственности ['ОТ', 'ПБ']
    // Также сохраняем ответственных, которых нет в локальной БД
    const responsibilityTypesMap = new Map<string, string[]>();
    const externalResponsibles: Array<{
      employee_id?: string;
      employee_email?: string;
      employee_name?: string;
      responsibility_type?: string;
    }> = [];
    
    // Получаем типы ответственности из внешнего API
    try {
      const authToken = getAuthToken(req);
      if (authToken) {
        const responsiblesResponse = await axios.get(
          `${JOURNALS_API_URL}/branch_responsibles/?branchId=${branchId}`,
          {
            headers: createAuthHeaders(authToken)
          }
        );
        
        if (responsiblesResponse.data && Array.isArray(responsiblesResponse.data)) {
          for (const branchData of responsiblesResponse.data) {
            if (branchData.branch_id === branchId && branchData.responsibles && Array.isArray(branchData.responsibles)) {
              for (const resp of branchData.responsibles) {
                // Используем общую утилиту для поиска пользователя
                const responsibleUser = await findUserByResponsibleData(
                  prisma,
                  {
                    employee_id: resp.employee_id,
                    employee_email: resp.employee_email,
                    employee_name: resp.employee_name
                  },
                  {
                    select: { id: true }
                  }
                );
                
                // Сохраняем тип ответственности для найденных пользователей
                if (responsibleUser && resp.responsibility_type) {
                  const types = responsibilityTypesMap.get(responsibleUser.id) || [];
                  if (!types.includes(resp.responsibility_type)) {
                    types.push(resp.responsibility_type);
                    responsibilityTypesMap.set(responsibleUser.id, types);
                  }
                } else if (!responsibleUser) {
                  // Сохраняем ответственных, которых нет в локальной БД
                  externalResponsibles.push({
                    employee_id: resp.employee_id,
                    employee_email: resp.employee_email,
                    employee_name: resp.employee_name,
                    responsibility_type: resp.responsibility_type
                  });
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[SafetyJournalChat] Error getting responsibility types:', error);
    }
    
    // Получаем информацию о всех участниках из локальной БД
    console.log('[SafetyJournalChat] getChatParticipants - total participantIds:', participantIds.size, Array.from(participantIds));
    
    const participants = await prisma.user.findMany({
      where: {
        id: { in: Array.from(participantIds) }
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        position: true,
        branch: true
      },
      orderBy: { name: 'asc' }
    });

    // Создаем Set с ID проверяющих для быстрой проверки
    const checkerIdsSet = new Set(Array.from(participantIds));
    
    // Добавляем типы ответственности и флаг isChecker к каждому участнику из локальной БД
    const participantsWithTypes = await Promise.all(participants.map(async (p) => {
      const responsibilityTypes = responsibilityTypesMap.get(p.id) || [];
      // Проверяющий - это участник, который в списке проверяющих (checkerIdsSet) и не имеет типов ответственности
      const isCheckerUser = checkerIdsSet.has(p.id) && responsibilityTypes.length === 0;
      
      return {
        ...p,
        responsibilityTypes,
        isChecker: isCheckerUser
      };
    }));

    // Добавляем ответственных из внешнего API, которых нет в локальной БД
    // Группируем по идентификатору, чтобы собрать все типы ответственности для одного человека
    const externalResponsiblesMap = new Map<string, {
      employee_id?: string;
      employee_email?: string;
      employee_name?: string;
      responsibilityTypes: string[];
    }>();
    
    for (const extResp of externalResponsibles) {
      const key = extResp.employee_id || extResp.employee_email || extResp.employee_name || 'unknown';
      const existing = externalResponsiblesMap.get(key);
      
      if (existing) {
        // Если уже есть, добавляем тип ответственности, если его еще нет
        if (extResp.responsibility_type && !existing.responsibilityTypes.includes(extResp.responsibility_type)) {
          existing.responsibilityTypes.push(extResp.responsibility_type);
        }
      } else {
        // Создаем новую запись
        externalResponsiblesMap.set(key, {
          employee_id: extResp.employee_id,
          employee_email: extResp.employee_email,
          employee_name: extResp.employee_name,
          responsibilityTypes: extResp.responsibility_type ? [extResp.responsibility_type] : []
        });
      }
    }
    
    // Добавляем всех внешних ответственных с собранными типами ответственности
    for (const extResp of externalResponsiblesMap.values()) {
      // Внешние ответственные не являются проверяющими (у них есть типы ответственности)
      participantsWithTypes.push({
        id: extResp.employee_id || extResp.employee_email || `external_${extResp.employee_name}`,
        name: extResp.employee_name || extResp.employee_email || 'Неизвестно',
        email: extResp.employee_email || '',
        image: null,
        position: '',
        branch: '',
        responsibilityTypes: extResp.responsibilityTypes,
        isChecker: false // Внешние ответственные не являются проверяющими
      });
    }

    console.log('[SafetyJournalChat] getChatParticipants - returning participants:', participantsWithTypes.length, {
      fromLocalDB: participants.length,
      fromExternalAPI: externalResponsibles.length
    });
    
    res.json(participantsWithTypes);
  } catch (error) {
    console.error('[SafetyJournalChat] Error getting chat participants:', error);
    res.status(500).json({ error: 'Failed to get chat participants' });
  }
};

// Получить чаты для филиала или все чаты пользователя
export const getChats = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { branchId } = getChatsSchema.parse(req.query);
    const userIsChecker = await isChecker(token.userId);

    const where: any = {};
    if (branchId) {
      where.branchId = branchId;
    } else if (userIsChecker) {
      // Если пользователь проверяющий, возвращаем все чаты
      // (без фильтрации по checkerId)
    } else {
      // Если пользователь не проверяющий, возвращаем только чаты, где он проверяющий
      where.checkerId = token.userId;
    }

    const chats = await prisma.safetyJournalChat.findMany({
      where,
      include: {
        checker: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            position: true,
            branch: true
          }
        },
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            }
          },
          orderBy: { createdAt: 'asc' },
          take: 1 // Последнее сообщение для превью
        },
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Если пользователь проверяющий, добавляем информацию о филиалах
    if (userIsChecker && !branchId) {
      const chatsWithBranches = await Promise.all(
        chats.map(async (chat: any) => {
          const branch = await prisma.branch.findUnique({
            where: { uuid: chat.branchId },
            select: {
              uuid: true,
              name: true,
              address: true
            }
          });

          return {
            ...chat,
            branch: branch || null
          };
        })
      );

      return res.json(chatsWithBranches);
    }

    res.json(chats);
  } catch (error) {
    console.error('[SafetyJournalChat] Error getting chats:', error);
    res.status(500).json({ error: 'Failed to get chats' });
  }
};

// Получить или создать чат
export const getOrCreateChat = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { branchId, checkerId } = req.params;

    // Проверяем доступ: пользователь должен быть проверяющим или ответственным по филиалу
    const userIsChecker = await isChecker(token.userId);
    
    // Если пользователь не проверяющий, проверяем, является ли он ответственным по филиалу
    if (!userIsChecker) {
      const authToken = getAuthToken(req);
      if (!authToken) {
        return res.status(401).json({ error: 'Токен авторизации не найден' });
      }
      
      const isResponsible = await isResponsibleForBranch(token.userId, branchId, authToken);
      
      if (!isResponsible) {
        return res.status(403).json({ error: 'Только проверяющие и ответственные по филиалу могут получать доступ к чату' });
      }
    }

    // ИЗМЕНЕНО: Один филиал = один чат. Ищем чат только по branchId
    let chat = await prisma.safetyJournalChat.findFirst({
      where: {
        branchId
      },
      include: {
        checker: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            position: true,
            branch: true
          }
        },
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    // Если чат не существует, создаем его
    if (!chat) {
      // Определяем checkerId для создания чата:
      // 1. Если пользователь - проверяющий, используем его ID
      // 2. Если передан checkerId в параметрах, используем его
      // 3. Иначе находим первого проверяющего с доступом к jurists/safety
      let targetCheckerId = checkerId;
      
      if (userIsChecker) {
        // Если пользователь сам проверяющий, используем его ID
        targetCheckerId = token.userId;
      } else if (!checkerId) {
        // Если checkerId не передан, находим первого проверяющего
        const safetyTool = await prisma.tool.findFirst({
          where: { link: 'jurists/safety' }
        });
        
        if (safetyTool) {
          // Ищем первого пользователя с FULL доступом
          const userAccess = await prisma.userToolAccess.findFirst({
            where: {
              toolId: safetyTool.id,
              accessLevel: 'FULL'
            },
            select: { userId: true }
          });
          
          if (userAccess) {
            targetCheckerId = userAccess.userId;
          } else {
            // Если нет пользователей с доступом, используем SUPERVISOR
            const supervisor = await prisma.user.findFirst({
              where: { role: 'SUPERVISOR' },
              select: { id: true }
            });
            
            if (supervisor) {
              targetCheckerId = supervisor.id;
            } else {
              return res.status(404).json({ error: 'Не найден проверяющий для создания чата' });
            }
          }
        } else {
          return res.status(404).json({ error: 'Инструмент jurists/safety не найден' });
        }
      }
      
      // Проверяем существование checkerId перед созданием
      const checker = await prisma.user.findUnique({
        where: { id: targetCheckerId },
        select: { id: true }
      });

      if (!checker) {
        return res.status(404).json({ error: 'Проверяющий не найден' });
      }

      chat = await prisma.safetyJournalChat.create({
        data: {
          branchId,
          checkerId: targetCheckerId
        },
        include: {
          checker: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              position: true,
              branch: true
            }
          },
          messages: {
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      });
    }

    res.json(chat);
  } catch (error: any) {
    console.error('[SafetyJournalChat] Error getting or creating chat:', error);
    
    // Более детальная обработка ошибок Prisma
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Ошибка внешнего ключа',
        details: error.meta?.field_name 
          ? `Поле ${error.meta.field_name} ссылается на несуществующую запись`
          : 'Одна из ссылок (checkerId или branchId) не существует'
      });
    }
    
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        error: 'Чат уже существует',
        details: 'Чат с такими параметрами уже создан'
      });
    }
    
    res.status(500).json({ error: 'Failed to get or create chat' });
  }
};

// Получить сообщения чата
export const getMessages = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { chatId } = req.params;
    const { page = '1', limit = '50' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Проверяем доступ к чату
    const chat = await prisma.safetyJournalChat.findUnique({
      where: { id: chatId },
      select: { 
        checkerId: true,
        branchId: true
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    // Проверяем, является ли пользователь проверяющим (любой проверяющий имеет доступ ко всем чатам)
    const userIsChecker = await isChecker(token.userId);
    
    // Если пользователь не проверяющий, проверяем другие условия доступа
    let isUserChecker = false;
    let isBranchEmployee = false;
    let isResponsible = false;
    
    if (!userIsChecker) {
      // Проверяем, является ли пользователь конкретным проверяющим этого чата
      isUserChecker = chat.checkerId === token.userId;
      
      // Проверяем, является ли пользователь сотрудником филиала
    if (!isUserChecker) {
      const user = await prisma.user.findUnique({
        where: { id: token.userId },
        select: { branch: true }
      });
      isBranchEmployee = user?.branch === chat.branchId;
    }

      // Проверяем, является ли пользователь ответственным по филиалу
    if (!isUserChecker && !isBranchEmployee) {
        const authToken = getAuthToken(req);
        if (authToken) {
          isResponsible = await isResponsibleForBranch(token.userId, chat.branchId, authToken);
        }
      }
    }

    // Если пользователь не проверяющий и не соответствует другим условиям доступа
    if (!userIsChecker && !isUserChecker && !isBranchEmployee && !isResponsible) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }

    // ИЗМЕНЕНО: Один филиал = один чат, поэтому загружаем сообщения из этого чата
    // Но на всякий случай проверяем, что чат принадлежит правильному филиалу
    const [messages, total] = await Promise.all([
      prisma.safetyJournalChatMessage.findMany({
        where: { chatId },
        skip,
        take: limitNum,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          attachments: {
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              fileSize: true,
              mimeType: true
            }
          },
          quotedMessage: {
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true
                }
              },
              attachments: {
                select: {
                  id: true,
                  fileName: true,
                  fileUrl: true,
                  fileSize: true,
                  mimeType: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.safetyJournalChatMessage.count({
        where: { chatId }
      })
    ]);

    console.log('[SafetyJournalChat] getMessages - returning messages:', {
      chatId,
      totalMessages: messages.length,
      totalCount: total,
      page: pageNum,
      limit: limitNum,
      allMessages: messages.map(m => ({
        id: m.id,
        message: m.message?.substring(0, 100),
        senderId: m.senderId,
        senderName: m.sender?.name,
        createdAt: m.createdAt,
        isStatusMessage: m.message && (
          m.message.includes('одобрен') ||
          m.message.includes('отклонен') ||
          m.message.includes('отправлен на проверку') ||
          m.message.includes('ожидает загрузки файлов')
        )
      }))
    });

    // Добавляем флаг isEdited для каждого сообщения
    // Используем поле isEdited из базы данных, если оно есть, иначе вычисляем по updatedAt
    const messagesWithEditedFlag = messages.map(msg => ({
      ...msg,
      isEdited: msg.isEdited !== undefined ? msg.isEdited : 
        (msg.updatedAt && msg.createdAt && 
         new Date(msg.updatedAt).getTime() > new Date(msg.createdAt).getTime() + 1000) // Разница больше 1 секунды (учитываем возможные задержки)
    }));

    res.json({
      messages: messagesWithEditedFlag,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[SafetyJournalChat] Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

// Отправить сообщение
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { chatId } = req.params;
    
    // Обрабатываем FormData или JSON
    let messageText = '';
    let files: Express.Multer.File[] = [];
    let quotedMessageId: string | undefined = undefined;
    
    // Проверяем наличие файлов (multer добавляет их в req.files)
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      // Это FormData с файлами
      files = req.files as Express.Multer.File[];
      messageText = (req.body?.message as string) || '';
      quotedMessageId = (req.body?.quotedMessageId as string) || undefined;
    } else if (req.body && typeof req.body === 'object' && 'message' in req.body) {
      // Это JSON
    const data = createMessageSchema.parse(req.body);
      messageText = data.message || '';
      quotedMessageId = data.quotedMessageId;
    } else {
      // Пытаемся обработать как FormData без файлов
      messageText = (req.body?.message as string) || '';
      quotedMessageId = (req.body?.quotedMessageId as string) || undefined;
    }
    
    // Проверяем, что есть либо сообщение, либо файлы
    if (!messageText.trim() && (!files || files.length === 0)) {
      return res.status(400).json({ error: 'Сообщение или файлы обязательны' });
    }

    // Проверяем доступ к чату
    const chat = await prisma.safetyJournalChat.findUnique({
      where: { id: chatId },
      include: {
        checker: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    // Проверяем, является ли пользователь проверяющим
    const userIsChecker = await isChecker(token.userId);

    // Если пользователь не проверяющий, проверяем, является ли он ответственным по филиалу
    if (!userIsChecker) {
      // Получаем токен из заголовков запроса
      const authToken = (req as any).headers.authorization?.replace('Bearer ', '') || '';
      if (!authToken) {
        return res.status(401).json({ error: 'Токен авторизации не найден' });
      }
      
      const isResponsible = await isResponsibleForBranch(token.userId, chat.branchId, authToken);
      
      if (!isResponsible) {
        return res.status(403).json({ error: 'Только ответственные по филиалу могут отправлять сообщения' });
      }
    }

    // Проверяем, существует ли цитируемое сообщение (если указано)
    if (quotedMessageId) {
      const quotedMsg = await prisma.safetyJournalChatMessage.findUnique({
        where: { id: quotedMessageId },
        select: { id: true, chatId: true }
      });
      
      if (!quotedMsg || quotedMsg.chatId !== chatId) {
        return res.status(400).json({ error: 'Цитируемое сообщение не найдено или принадлежит другому чату' });
      }
    }

    // Создаем сообщение
    const message = await prisma.safetyJournalChatMessage.create({
      data: {
        chatId,
        senderId: token.userId,
        message: messageText || ' ', // Если только файлы, оставляем пробел
        quotedMessageId: quotedMessageId || null
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        attachments: true
      }
    });
    
    // Сохраняем вложения, если они есть
    if (files && files.length > 0) {
      try {
        // Импортируем функцию декодирования
        const formatModule = await import('../../utils/format.js');
        const decodeRussianFileName = formatModule.decodeRussianFileName;
        const attachments = files.map(file => {
          try {
            // Декодируем русские символы в оригинальном имени файла
            const decodedFileName = decodeRussianFileName(file.originalname);
            // Используем оригинальное имя файла или имя из multer, если оригинальное пустое
            const fileName = decodedFileName || file.filename || `file_${Date.now()}`;
            
            // Проверяем, что file.filename существует
            if (!file.filename) {
              console.error('[SafetyJournalChat] sendMessage - file.filename is missing:', {
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size
              });
              throw new Error('File filename is missing');
            }
            
            return {
              messageId: message.id,
              fileName: fileName,
              fileUrl: `/jurists/safety/chat/${file.filename}`,
              fileSize: file.size || 0,
              mimeType: file.mimetype || null, // Может быть undefined для некоторых файлов
            };
          } catch (error) {
            console.error('[SafetyJournalChat] sendMessage - error processing file:', error, {
              originalname: file.originalname,
              filename: file.filename,
              mimetype: file.mimetype,
              size: file.size
            });
            // В случае ошибки используем имя из multer или генерируем новое
            const fallbackFileName = file.filename || `file_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            return {
              messageId: message.id,
              fileName: fallbackFileName,
              fileUrl: `/jurists/safety/chat/${fallbackFileName}`,
              fileSize: file.size || 0,
              mimeType: file.mimetype || null,
            };
          }
        });
        
        // Проверяем, что все вложения имеют необходимые поля
        const validAttachments = attachments.filter(att => {
          if (!att.messageId || !att.fileName || !att.fileUrl) {
            console.error('[SafetyJournalChat] sendMessage - invalid attachment:', att);
            return false;
          }
          return true;
        });
        
        if (validAttachments.length === 0) {
          console.error('[SafetyJournalChat] sendMessage - no valid attachments after validation');
          throw new Error('No valid attachments to save');
        }
        
        console.log('[SafetyJournalChat] sendMessage - saving attachments:', validAttachments.length, 'out of', files.length);
        
        await prisma.chatMessageAttachment.createMany({
          data: validAttachments
        });
      } catch (attachmentError) {
        console.error('[SafetyJournalChat] sendMessage - error saving attachments:', attachmentError);
        // Не прерываем выполнение, но логируем ошибку
        // Сообщение уже создано, вложения можно будет добавить позже
      }
      
      // Обновляем сообщение с вложениями
      const messageWithAttachments = await prisma.safetyJournalChatMessage.findUnique({
        where: { id: message.id },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          attachments: true
        }
      });
      
      // Используем сообщение с вложениями для ответа
      if (messageWithAttachments) {
        Object.assign(message, messageWithAttachments);
      }
    }

    // Обновляем updatedAt чата
    await prisma.safetyJournalChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() }
    });

    // Отправляем через Socket.IO
    const socketService = SocketIOService.getInstance();
    
    // Получаем финальное сообщение с вложениями и цитируемым сообщением
    const finalMessage = await prisma.safetyJournalChatMessage.findUnique({
      where: { id: message.id },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        attachments: true,
        quotedMessage: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            },
            attachments: {
              select: {
                id: true,
                fileName: true,
                fileUrl: true,
                fileSize: true,
                mimeType: true
              }
            }
          }
        }
      }
    });
    
    const messageData = {
      type: 'SAFETY_JOURNAL_MESSAGE',
      chatId,
      branchId: chat.branchId,
      message: {
        id: finalMessage?.id || message.id,
        message: finalMessage?.message || message.message,
        sender: finalMessage?.sender || message.sender,
        createdAt: finalMessage?.createdAt || message.createdAt,
        attachments: finalMessage?.attachments || [],
        quotedMessage: finalMessage?.quotedMessage || null
      }
    };
    
    // Собираем ID пользователей, которым уже отправили уведомления (чтобы не дублировать)
    const notifiedUserIds = new Set<string>();
    
    // ЕДИНАЯ ФУНКЦИЯ: Отправка уведомлений для проверяющих и ответственных
    const sendNotificationToUser = async (
      userId: string,
      senderName: string,
      messagePreview: string,
      branchName: string,
      chatId: string,
      messageId: string,
      branchId: string
    ) => {
      // Проверяем, находится ли пользователь в любом активном чате
      const isInAnyActiveChat = socketService.isUserInAnyActiveChat(userId);
      
      console.log('[SafetyJournalChat] sendNotificationToUser:', {
        userId,
        senderName,
        messagePreview,
        branchName,
        chatId,
        messageId,
        isInAnyActiveChat
      });
      
      // Отправляем уведомление только если пользователь НЕ в модалке чата
      if (!isInAnyActiveChat) {
        const notificationBranchName = branchName && branchName !== 'филиала' ? branchName : 'филиал';
        
        console.log('[SafetyJournalChat] Creating notification for user:', userId);
        
        await NotificationController.create({
          type: 'INFO',
          channels: ['IN_APP', 'TELEGRAM'],
          title: senderName,
          message: messagePreview,
          senderId: token.userId,
          receiverId: userId,
          priority: 'MEDIUM',
          action: {
            type: 'NAVIGATE',
            url: `/jurists/safety?branchId=${branchId}&chatId=${chatId}&messageId=${messageId}`,
            chatId: chatId,
            messageId: messageId,
            branchName: notificationBranchName,
          },
        });
        
        console.log('[SafetyJournalChat] Notification created successfully for user:', userId);
      } else {
        console.log('[SafetyJournalChat] User is in active chat, skipping notification:', userId);
      }
    };

    // Получаем данные для уведомления (общие для всех)
    const senderName = finalMessage?.sender?.name || message?.sender?.name || 'Пользователь';
    const notificationMessageText = finalMessage?.message || message?.message || '';
    const attachments = finalMessage?.attachments || message?.attachments || [];
    
    // Формируем превью сообщения
    let messagePreview = '';
    if (typeof notificationMessageText === 'string' && notificationMessageText.trim()) {
      messagePreview = notificationMessageText.length > 50 ? notificationMessageText.substring(0, 50) + '...' : notificationMessageText;
    } else if (attachments.length > 0) {
      const fileCount = attachments.length;
      const fileTypes = attachments.map((a: any) => {
        const mimeType = a.mimeType || '';
        if (mimeType.startsWith('image/')) return 'изображение';
        if (mimeType.startsWith('video/')) return 'видео';
        if (mimeType.includes('pdf')) return 'PDF';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'документ';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'таблица';
        return 'файл';
      });
      messagePreview = fileCount === 1 ? `📎 ${fileTypes[0]}` : `📎 ${fileCount} файлов`;
    } else {
      messagePreview = 'Сообщение';
    }

    // Получаем название филиала
    let branchName = 'филиала';
    try {
      const localBranch = await prisma.branch.findUnique({
        where: { uuid: chat.branchId },
        select: { name: true }
      });
      if (localBranch?.name) {
        branchName = localBranch.name;
      }
    } catch (error) {
      // Игнорируем ошибку
    }

    // Отправляем уведомления ВСЕМ участникам чата через NotificationController
    try {
      const authToken = getAuthToken(req);
      
      // Получаем всех участников чата (используем ту же логику, что и в getChatParticipants)
      const participantIds = new Set<string>();
      
      // Добавляем проверяющего
      if (chat.checkerId) {
        participantIds.add(chat.checkerId);
      }
      
      // Получаем всех проверяющих (пользователей с FULL доступом)
      const safetyTool = await prisma.tool.findFirst({
        where: { link: 'jurists/safety' }
      });
      
      if (safetyTool) {
        // Пользователи с FULL доступом на уровне пользователя
        const userAccesses = await prisma.userToolAccess.findMany({
          where: {
            toolId: safetyTool.id,
            accessLevel: 'FULL'
          },
          select: { userId: true }
        });
        
        userAccesses.forEach(access => {
          participantIds.add(access.userId);
        });
        
        // SUPERVISOR всегда имеет доступ
        const supervisors = await prisma.user.findMany({
          where: { role: 'SUPERVISOR' },
          select: { id: true }
        });
        
        supervisors.forEach(s => {
          participantIds.add(s.id);
        });
      }
      
      // Получаем ответственных по филиалу из внешнего API
      if (authToken) {
        try {
          const responsiblesResponse = await axios.get(
            `${JOURNALS_API_URL}/branch_responsibles/?branchId=${chat.branchId}`,
            {
              headers: createAuthHeaders(authToken)
            }
          );
          
          if (responsiblesResponse.data && Array.isArray(responsiblesResponse.data)) {
            // Обновляем branchName из API, если он есть
            for (const branchData of responsiblesResponse.data) {
              if (branchData.branch_id === chat.branchId && branchData.branch_name) {
                branchName = branchData.branch_name;
                break;
              }
            }
            
            for (const branchData of responsiblesResponse.data) {
              if (branchData.branch_id === chat.branchId) {
                if (branchData.responsibles && Array.isArray(branchData.responsibles)) {
                  for (const resp of branchData.responsibles) {
                    // Используем общую утилиту для поиска пользователя
                    const responsibleUser = await findUserByResponsibleData(
                      prisma,
                      {
                        employee_id: resp.employee_id,
                        employee_email: resp.employee_email,
                        employee_name: resp.employee_name
                      },
                      {
                        select: { id: true }
                      }
                    );
                    
                    if (responsibleUser) {
                      participantIds.add(responsibleUser.id);
                    }
                  }
                }
                break; // Нашли нужный филиал, выходим из цикла
              }
            }
          }
        } catch (apiError) {
          console.error('[SafetyJournalChat] Error fetching responsibles for participants:', apiError);
          // Продолжаем работу даже если не удалось получить ответственных
        }
      }
      
      // Отправляем уведомления всем участникам чата (кроме отправителя)
      console.log('[SafetyJournalChat] Sending notifications to all chat participants:', {
        totalParticipants: participantIds.size,
        chatId: chat.id,
        branchId: chat.branchId
      });
      
      for (const participantId of participantIds) {
        if (participantId !== token.userId && !notifiedUserIds.has(participantId)) {
          // Отправляем сообщение через Socket.IO для отображения в чате
          socketService.sendChatMessage(participantId, messageData);
          
          // Отправляем уведомление через единую функцию
          await sendNotificationToUser(
            participantId,
            senderName,
            messagePreview,
            branchName,
            chat.id,
            finalMessage?.id || message.id,
            chat.branchId
          );
          
          notifiedUserIds.add(participantId);
        }
      }
      
      console.log('[SafetyJournalChat] Notifications sent to participants:', notifiedUserIds.size);
    } catch (notifError) {
      console.error('[SafetyJournalChat] Error sending notification:', notifError);
      // Продолжаем работу даже если не удалось отправить уведомления
    }

    // Возвращаем финальное сообщение с вложениями
    const responseMessage = finalMessage || message;
    res.status(201).json(responseMessage);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    
    // Обрабатываем ошибки Multer
    if (error.name === 'MulterError') {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          error: 'Файл слишком большой',
          message: 'Максимальный размер файла: 50 МБ'
        });
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ 
          error: 'Слишком много файлов',
          message: 'Максимальное количество файлов: 10'
        });
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ 
          error: 'Неожиданное поле файла',
          message: 'Используйте поле "files" для загрузки файлов'
        });
      }
      return res.status(400).json({ 
        error: 'Ошибка загрузки файла',
        message: error.message
      });
    }
    
    console.error('[SafetyJournalChat] Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message', details: error.message });
  }
};

// Отметить сообщения как прочитанные
export const markMessagesAsRead = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { chatId } = req.params;

    // Получаем чат для получения branchId
    const chat = await prisma.safetyJournalChat.findUnique({
      where: { id: chatId },
      select: { branchId: true }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    // Отмечаем все непрочитанные сообщения от других пользователей как прочитанные
    const updatedMessages = await prisma.safetyJournalChatMessage.updateMany({
      where: {
        chatId,
        senderId: { not: token.userId },
        readAt: null
      },
      data: {
        readAt: new Date()
      }
    });

    // Если были обновлены сообщения, отправляем событие через Socket.IO
    if (updatedMessages.count > 0) {
      try {
        // Получаем обновленные сообщения для отправки события
        const messagesToNotify = await prisma.safetyJournalChatMessage.findMany({
          where: {
            chatId,
            senderId: { not: token.userId },
            readAt: { not: null }
          },
          select: {
            id: true,
            readAt: true,
            senderId: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 50 // Ограничиваем количество для производительности
        });

        const socketService = SocketIOService.getInstance();
        
        // Отправляем событие отправителям сообщений об обновлении статуса прочтения
        // Группируем по senderId для оптимизации
        const messagesBySender = new Map<string, typeof messagesToNotify>();
        messagesToNotify.forEach(msg => {
          const senderId = msg.senderId;
          if (!messagesBySender.has(senderId)) {
            messagesBySender.set(senderId, []);
          }
          messagesBySender.get(senderId)!.push(msg);
        });

        // Отправляем события каждому отправителю
        messagesBySender.forEach((msgs, senderId) => {
          const userConnections = socketService.getUserConnections(senderId);
          userConnections.forEach(conn => {
            // Используем внутренний io через рефлексию или создаем метод доступа
            const io = (socketService as any).io;
            if (io) {
              const socket = io.sockets.sockets.get(conn.socketId);
              if (socket) {
                // Отправляем все обновленные сообщения одним событием
                socket.emit('messages_read', {
                  messages: msgs.map(m => ({
                    messageId: m.id,
                    readAt: m.readAt
                  })),
                  chatId,
                  branchId: chat.branchId
                });
              }
            }
          });
        });
      } catch (socketError) {
        console.error('[SafetyJournalChat] Error emitting message_read event:', socketError);
        // Не прерываем выполнение, если не удалось отправить событие
      }
    }

    // Отмечаем соответствующие уведомления как прочитанные
    try {
      const safetyTool = await prisma.tool.findFirst({
        where: { link: 'jurists/safety' }
      });

      if (safetyTool) {
        // Находим все непрочитанные уведомления для этого пользователя, связанные с этим инструментом
        const allNotifications = await prisma.notifications.findMany({
          where: {
            receiverId: token.userId,
            read: false,
            toolId: safetyTool.id
          },
          select: { 
            id: true,
            action: true,
            title: true,
            message: true
          }
        });

        // Фильтруем уведомления, связанные с этим чатом
        // Ищем по branchId в action.url и по типу уведомления (сообщения в чате)
        const chatNotifications = allNotifications.filter(notif => {
          // Проверяем по URL (branchId в параметрах)
          if (notif.action && typeof notif.action === 'object') {
            const action = notif.action as any;
            const url = action.url || action.href || '';
            if (typeof url === 'string' && url.includes(`branchId=${chat.branchId}`)) {
              return true;
            }
          }
          // Также проверяем по типу уведомления - если это уведомление о сообщении в чате
          const title = notif.title || '';
          const message = notif.message || '';
          if (typeof title === 'string' && title.includes('Новое сообщение в чате филиала')) {
            return true;
          }
          if (typeof message === 'string' && message.includes('сообщение в чате')) {
            return true;
          }
          return false;
        });

        // Отмечаем все найденные уведомления как прочитанные
        if (chatNotifications.length > 0) {
          await prisma.notifications.updateMany({
            where: {
              id: { in: chatNotifications.map(n => n.id) },
              receiverId: token.userId
            },
            data: {
              read: true,
              updatedAt: new Date()
            }
          });
        }
      }
    } catch (notifError) {
      console.error('[SafetyJournalChat] Error marking notifications as read:', notifError);
      // Не прерываем выполнение, если не удалось отметить уведомления
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[SafetyJournalChat] Error marking messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

// Удалить сообщение
export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { chatId, messageId } = req.params;

    // Проверяем доступ к чату
    const chat = await prisma.safetyJournalChat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    // Проверяем, существует ли сообщение и принадлежит ли оно пользователю
    const message = await prisma.safetyJournalChatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    // Проверяем, что сообщение принадлежит текущему пользователю
    if (message.senderId !== token.userId) {
      return res.status(403).json({ error: 'Вы можете удалять только свои сообщения' });
    }

    // Удаляем сообщение
    await prisma.safetyJournalChatMessage.delete({
      where: { id: messageId },
    });

    // Обновляем время последнего обновления чата
    await prisma.safetyJournalChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    // Отправляем событие об удалении сообщения через Socket.IO
    try {
      const socketService = SocketIOService.getInstance();
      
      // Формируем данные события удаления
      const deleteMessageData = {
        type: 'SAFETY_JOURNAL_MESSAGE_DELETED',
        chatId,
        branchId: chat.branchId,
        messageId,
      };
      
      // Получаем всех проверяющих по филиалу
      const safetyTool = await prisma.tool.findFirst({
        where: { link: 'jurists/safety' }
      });
      
      if (safetyTool) {
        const checkerAccesses = await prisma.userToolAccess.findMany({
          where: {
            toolId: safetyTool.id,
            accessLevel: 'FULL'
          },
          select: { userId: true }
        });
        
        const checkerIds = checkerAccesses.map(a => a.userId);
        
        const supervisors = await prisma.user.findMany({
          where: { role: 'SUPERVISOR' },
          select: { id: true }
        });
        
        supervisors.forEach(s => {
          if (!checkerIds.includes(s.id)) {
            checkerIds.push(s.id);
          }
        });
        
        // Отправляем событие всем проверяющим
        checkerIds.forEach(checkerId => {
          socketService.sendToUser(checkerId, deleteMessageData);
        });
      }
      
      // Также отправляем ответственным по филиалу
      const authToken = getAuthToken(req);
      if (authToken) {
        try {
          const responsiblesResponse = await axios.get(
            `${JOURNALS_API_URL}/branch_responsibles/?branchId=${chat.branchId}`,
            {
              headers: createAuthHeaders(authToken)
            }
          );
          
          if (responsiblesResponse.data && Array.isArray(responsiblesResponse.data)) {
            for (const branchData of responsiblesResponse.data) {
              if (branchData.branch_id === chat.branchId && branchData.responsibles && Array.isArray(branchData.responsibles)) {
                for (const resp of branchData.responsibles) {
                  const responsibleUser = await findUserByResponsibleData(
                    prisma,
                    {
                      employee_id: resp.employee_id,
                      employee_email: resp.employee_email,
                      employee_name: resp.employee_name
                    }
                  );
                  
                  if (responsibleUser && responsibleUser.id !== token.userId) {
                    socketService.sendToUser(responsibleUser.id, deleteMessageData);
                  }
                }
                break;
              }
            }
          }
        } catch (apiError) {
          console.error('[SafetyJournalChat] Error fetching responsibles for delete notification:', apiError);
        }
      }
    } catch (socketError) {
      console.error('[SafetyJournalChat] Error sending delete notification via Socket.IO:', socketError);
      // Не прерываем выполнение, если не удалось отправить уведомление
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[SafetyJournalChat] Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

// Редактировать сообщение
export const updateMessage = async (req: Request, res: Response) => {
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { chatId, messageId } = req.params;
    const { message: newMessage } = req.body;

    if (!newMessage || typeof newMessage !== 'string' || !newMessage.trim()) {
      return res.status(400).json({ error: 'Текст сообщения обязателен' });
    }

    // Проверяем доступ к чату
    const chat = await prisma.safetyJournalChat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    // Проверяем, существует ли сообщение и принадлежит ли оно пользователю
    const message = await prisma.safetyJournalChatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    // Проверяем, что сообщение принадлежит текущему пользователю
    if (message.senderId !== token.userId) {
      return res.status(403).json({ error: 'Вы можете редактировать только свои сообщения' });
    }

    // Обновляем сообщение (updatedAt обновляется автоматически благодаря @updatedAt в схеме)
    const updatedMessage = await prisma.safetyJournalChatMessage.update({
      where: { id: messageId },
      data: {
        message: newMessage.trim(),
        isEdited: true, // Устанавливаем флаг редактирования
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Обновляем время последнего обновления чата
    await prisma.safetyJournalChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    // Добавляем флаг isEdited для frontend
    res.json({
      ...updatedMessage,
      isEdited: true,
    });
  } catch (error) {
    console.error('[SafetyJournalChat] Error updating message:', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
};

