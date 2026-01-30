import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../server.js';
import { SocketIOService } from '../../socketio.js';
import axios from 'axios';
import { findUserByResponsibleData, findUsersByResponsiblesBatch } from '../../utils/findUserByResponsible.js';
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

// ВЫСОКИЙ ПРИОРИТЕТ: Функция для проверки, является ли пользователь проверяющим (с кэшированием)
const isChecker = async (userId: string): Promise<boolean> => {
  try {
    // Проверяем кэш
    const cached = checkerCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CHECKER_CACHE_TTL) {
      return cached.result;
    }

    // Очищаем устаревшие записи из кэша периодически
    if (checkerCache.size > 1000) {
      cleanCheckerCache();
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user?.role === 'SUPERVISOR') {
      checkerCache.set(userId, { result: true, timestamp: Date.now() });
      return true;
    }

    const safetyTool = await prisma.tool.findFirst({
      where: { link: 'jurists/safety' }
    });

    if (!safetyTool) {
      checkerCache.set(userId, { result: false, timestamp: Date.now() });
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
      checkerCache.set(userId, { result: true, timestamp: Date.now() });
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
          checkerCache.set(userId, { result: true, timestamp: Date.now() });
          return true;
        }
      }
    }

    checkerCache.set(userId, { result: false, timestamp: Date.now() });
    return false;
  } catch (error) {
    console.error('[SafetyJournalChat] Error checking if user is checker:', error);
    return false;
  }
};

// Кэш для результатов проверки ответственных (TTL: 5 минут)
const responsibleCache = new Map<string, { result: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут в миллисекундах
// После таймаута не дергать API 30 с — чтобы не спамить логами при медленном внешнем API
const TIMEOUT_COOLDOWN_MS = 30 * 1000;
const timeoutCooldown = new Map<string, number>();

// СРЕДНИЙ ПРИОРИТЕТ: Кэш для ответов внешнего API (TTL: 1 минута)
const apiCache = new Map<string, { data: any; timestamp: number }>();
const API_CACHE_TTL = 1 * 60 * 1000; // 1 минута в миллисекундах

// Функция для очистки устаревших записей из кэша API
const cleanApiCache = () => {
  const now = Date.now();
  for (const [key, value] of apiCache.entries()) {
    if (now - value.timestamp > API_CACHE_TTL) {
      apiCache.delete(key);
    }
  }
};

// ВЫСОКИЙ ПРИОРИТЕТ: Кэш для результатов проверки isChecker (TTL: 2 минуты)
const checkerCache = new Map<string, { result: boolean; timestamp: number }>();
const CHECKER_CACHE_TTL = 2 * 60 * 1000; // 2 минуты в миллисекундах

// Функция для очистки устаревших записей из кэша проверяющих
const cleanCheckerCache = () => {
  const now = Date.now();
  for (const [key, value] of checkerCache.entries()) {
    if (now - value.timestamp > CHECKER_CACHE_TTL) {
      checkerCache.delete(key);
    }
  }
};

// Функция для очистки кэша ответственных по филиалу
export const clearResponsibleCacheForBranch = (branchId: string) => {
  const keysToDelete: string[] = [];
  for (const [key] of responsibleCache.entries()) {
    if (key.endsWith(`:${branchId}`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => responsibleCache.delete(key));
  console.log(`[SafetyJournalChat] Cleared cache for branch ${branchId}, removed ${keysToDelete.length} entries`);
};

// Функция для проверки, является ли пользователь ответственным по филиалу
const isResponsibleForBranch = async (userId: string, branchId: string, token: string): Promise<boolean> => {
  const cacheKey = `${userId}:${branchId}`;
  try {
    const now = Date.now();
    const cooldownUntil = timeoutCooldown.get(cacheKey);
    if (cooldownUntil != null && now < cooldownUntil) {
      return false;
    }
    const cached = responsibleCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL) {
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

    // СРЕДНИЙ ПРИОРИТЕТ: Получаем ответственных по филиалу из внешнего API с кэшированием
    const apiCacheKey = `branch_responsibles_${branchId}_${token?.substring(0, 10) || 'default'}`;
    let response: any;
    
    // Проверяем кэш
    const cachedApiData = apiCache.get(apiCacheKey);
    if (cachedApiData && Date.now() - cachedApiData.timestamp < API_CACHE_TTL) {
      response = { data: cachedApiData.data };
      console.log('[SafetyJournalChat] isResponsibleForBranch - using cached API data for branch:', branchId);
    } else {
      // Очищаем устаревшие записи из кэша периодически
      if (apiCache.size > 100) {
        cleanApiCache();
      }
      
      response = await axios.get(`${JOURNALS_API_URL}/branch_responsibles/?branchId=${branchId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000 // 8 с — внешний API может отвечать медленно, не спамить таймаутами
      });
      
      // Сохраняем в кэш
      if (response?.data) {
        apiCache.set(apiCacheKey, { data: response.data, timestamp: Date.now() });
      }
    }

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
  } catch (error: any) {
    const isTimeout = error?.code === 'ECONNABORTED' || error?.message?.includes('timeout');
    if (isTimeout) {
      timeoutCooldown.set(cacheKey, Date.now() + TIMEOUT_COOLDOWN_MS);
      console.warn('[SafetyJournalChat] branch_responsibles timeout for branchId:', branchId, '(cooldown 30s)');
    } else {
      console.error('[SafetyJournalChat] isResponsibleForBranch error:', error?.message || error?.code || String(error));
    }
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
  const startTime = Date.now(); // ВЫСОКИЙ ПРИОРИТЕТ: Мониторинг производительности
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

    // ОПТИМИЗАЦИЯ: Сначала загружаем чаты из БД (быстро), затем внешний API (может быть медленным)
    // ОПТИМИЗАЦИЯ: Упрощаем запрос чатов - загружаем только необходимые данные
    const chats = await prisma.safetyJournalChat.findMany({
      select: {
        id: true,
        branchId: true,
        checkerId: true,
        updatedAt: true,
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // КРИТИЧНО: Оптимизация - загружаем последние сообщения одним запросом с группировкой
    // Используем один запрос для всех чатов вместо N параллельных запросов
    const chatIds = chats.map(chat => chat.id);
    let chatsWithMessages: any[] = [];
    
    if (chatIds.length > 0) {
      // Загружаем последние 5 сообщений для каждого чата одним запросом
      // Затем фильтруем на стороне сервера, чтобы найти последнее не-статусное сообщение
      const allRecentMessages = await prisma.safetyJournalChatMessage.findMany({
        where: {
          chatId: { in: chatIds }
        },
        select: {
          id: true,
          chatId: true,
          message: true,
          createdAt: true,
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
        take: chatIds.length * 5 // Берем по 5 последних сообщений для каждого чата
      });
      
      // Группируем по chatId и берем последнее не-статусное сообщение для каждого чата
      const messagesByChatId = new Map<string, any[]>();
      for (const msg of allRecentMessages) {
        if (!messagesByChatId.has(msg.chatId)) {
          messagesByChatId.set(msg.chatId, []);
        }
        messagesByChatId.get(msg.chatId)!.push(msg);
      }
      
      // Для каждого чата находим последнее не-статусное сообщение
      const isStatusMessage = (message: string | null): boolean => {
        if (!message) return false;
        const lowerMessage = message.toLowerCase();
        return lowerMessage.includes('одобрен') ||
               lowerMessage.includes('отклонен') ||
               lowerMessage.includes('отправлен на проверку') ||
               lowerMessage.includes('ожидает загрузки файлов') ||
               lowerMessage.includes('возвращен на рассмотрение');
      };
      
      for (const [chatId, messages] of messagesByChatId.entries()) {
        // Сообщения уже отсортированы по createdAt desc
        for (const msg of messages) {
          if (!isStatusMessage(msg.message)) {
            chatsWithMessages.push(msg);
            break; // Нашли последнее не-статусное сообщение
          }
        }
        // Если все сообщения статусные, берем последнее
        if (!chatsWithMessages.find(m => m.chatId === chatId) && messages.length > 0) {
          chatsWithMessages.push(messages[0]);
        }
      }
    }

    // СРЕДНИЙ ПРИОРИТЕТ: Загружаем филиалы из внешнего API с кэшированием
    let allBranches: any[] = [];
    const apiCacheKey = `branches_with_journals_${authToken?.substring(0, 10) || 'default'}`;
    
    // Проверяем кэш
    const cachedApiData = apiCache.get(apiCacheKey);
    if (cachedApiData && Date.now() - cachedApiData.timestamp < API_CACHE_TTL) {
      allBranches = cachedApiData.data?.branches || [];
      console.log('[SafetyJournalChat] getBranchesWithChats - using cached API data:', allBranches.length);
    } else {
      // Очищаем устаревшие записи из кэша периодически
      if (apiCache.size > 100) {
        cleanApiCache();
      }
      
      try {
        // КРИТИЧНО: Увеличиваем таймаут до 5 секунд, чтобы API успел вернуть все филиалы
        const branchesResponse = await Promise.race([
          axios.get(`${JOURNALS_API_URL}/me/branches_with_journals`, {
            headers: createAuthHeaders(authToken),
            timeout: 5000 // 5 секунд таймаут для загрузки всех филиалов
          }),
          // Fallback: если API не ответил за 5 секунд, продолжаем без него
          new Promise((resolve) => setTimeout(() => resolve({ data: null }), 5000))
        ]) as any;
        
        if (branchesResponse?.data && branchesResponse.data.branches) {
          allBranches = branchesResponse.data.branches;
          // Сохраняем в кэш
          apiCache.set(apiCacheKey, { data: branchesResponse.data, timestamp: Date.now() });
          console.log('[SafetyJournalChat] getBranchesWithChats - received branches from external API:', allBranches.length);
        } else {
          console.warn('[SafetyJournalChat] getBranchesWithChats - No branches data in API response');
        }
      } catch (apiError: any) {
        console.error('[SafetyJournalChat] getBranchesWithChats - Error fetching branches from external API:', {
          message: apiError?.message,
          code: apiError?.code,
          response: apiError?.response?.data,
          status: apiError?.response?.status
        });
        // Продолжаем работу без данных из внешнего API
      }
    }

    console.log('[SafetyJournalChat] getBranchesWithChats - found chats in DB:', chats.length);
    console.log('[SafetyJournalChat] getBranchesWithChats - branches from API:', allBranches.length);
    console.log('[SafetyJournalChat] getBranchesWithChats - unique branchIds from chats:', Array.from(new Set(chats.map(c => c.branchId))).length);

    // КРИТИЧНО: Создаем мапу последних НЕ-СТАТУСНЫХ сообщений по chatId для превью
    // Функция для проверки, является ли сообщение статусным
    const isStatusMessage = (message: string | null): boolean => {
      if (!message) return false;
      const lowerMessage = message.toLowerCase();
      return lowerMessage.includes('одобрен') ||
             lowerMessage.includes('отклонен') ||
             lowerMessage.includes('отправлен на проверку') ||
             lowerMessage.includes('ожидает загрузки файлов') ||
             lowerMessage.includes('возвращен на рассмотрение');
    };
    
    // КРИТИЧНО: Используем уже загруженные сообщения из chatsWithMessages
    // Они уже отфильтрованы и содержат последнее не-статусное сообщение для каждого чата
    const lastMessagesByChatId = new Map<string, any>();
    for (const msg of chatsWithMessages) {
      // Если для этого чата еще нет сообщения или это более новое сообщение
      if (!lastMessagesByChatId.has(msg.chatId)) {
        lastMessagesByChatId.set(msg.chatId, msg);
      } else {
        const existing = lastMessagesByChatId.get(msg.chatId);
        const existingDate = new Date(existing.createdAt).getTime();
        const msgDate = new Date(msg.createdAt).getTime();
        // Берем более новое сообщение, если оно не статусное
        if (msgDate > existingDate && !isStatusMessage(msg.message)) {
          lastMessagesByChatId.set(msg.chatId, msg);
        } else if (isStatusMessage(existing.message) && !isStatusMessage(msg.message)) {
          // Если существующее статусное, а новое нет - заменяем
          lastMessagesByChatId.set(msg.chatId, msg);
        }
      }
    }

    // Группируем чаты по филиалам
    const chatsByBranch = new Map();
    
    for (const chat of chats) {
      if (!chatsByBranch.has(chat.branchId)) {
        chatsByBranch.set(chat.branchId, []);
      }
      // ОПТИМИЗАЦИЯ: Добавляем последнее сообщение из мапы
      const lastMessage = lastMessagesByChatId.get(chat.id);
      chatsByBranch.get(chat.branchId).push({
        ...chat,
        lastMessage: lastMessage || null,
        branch: null // Будет заполнено позже
      });
    }

    // ОПТИМИЗАЦИЯ: Собираем все уникальные branchId для батч-запроса
    const allBranchIds = new Set<string>();
    // ИСПРАВЛЕНО: Безопасная обработка данных из внешнего API
    if (Array.isArray(allBranches)) {
      allBranches.forEach((b: any) => {
        if (b && typeof b === 'object' && b.branch_id) {
          allBranchIds.add(String(b.branch_id));
        }
      });
    }
    chatsByBranch.forEach((_, branchId) => allBranchIds.add(String(branchId)));

    // ОПТИМИЗАЦИЯ: Загружаем все филиалы одним запросом вместо N запросов
    // ИСПРАВЛЕНО: Проверяем, что есть branchId для запроса
    const localBranches = allBranchIds.size > 0
      ? await prisma.branch.findMany({
          where: {
            uuid: { in: Array.from(allBranchIds) }
          },
          select: {
            uuid: true,
            name: true,
            address: true
          }
        })
      : [];

    // Создаем мапу для быстрого поиска филиалов
    const localBranchesMap = new Map(localBranches.map(b => [b.uuid, b]));

    // КРИТИЧНО: Создаем массив филиалов (сам филиал и есть чат)
    const branchesMap = new Map();
    
    // КРИТИЧНО: Сначала добавляем ВСЕ филиалы из внешнего API (даже без чатов)
    // ИСПРАВЛЕНО: Безопасная обработка данных из внешнего API
    if (Array.isArray(allBranches)) {
      console.log('[SafetyJournalChat] getBranchesWithChats - processing branches from API:', allBranches.length);
      for (const apiBranch of allBranches) {
        if (!apiBranch || typeof apiBranch !== 'object' || !apiBranch.branch_id) {
          continue; // Пропускаем некорректные данные
        }
        const branchId = String(apiBranch.branch_id);
        const localBranch = localBranchesMap.get(branchId);

        // ОПТИМИЗАЦИЯ: Находим последнее сообщение из всех чатов этого филиала для превью
        const branchChats = chatsByBranch.get(branchId) || [];
        let lastMessage = null;
        let unreadCount = 0;
        let latestUpdatedAt: Date | null = null;
        
        if (branchChats.length > 0) {
          // ОПТИМИЗАЦИЯ: Сортируем один раз и используем результат
          const sortedChats = [...branchChats].sort((a: any, b: any) => 
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          const latestChat = sortedChats[0];
          
          // Используем последнее сообщение из чата (уже загружено)
          lastMessage = latestChat.lastMessage || null;
          
          // Подсчитываем непрочитанные сообщения (суммируем из всех чатов филиала)
        unreadCount = branchChats.reduce((sum: number, chat: any) => sum + (chat._count?.messages || 0), 0);
        latestUpdatedAt = latestChat.updatedAt;
      }
      
      // Добавляем информацию о филиале из локальной БД, если есть
      branchesMap.set(branchId, {
        branchId: branchId,
        branchName: localBranch?.name || apiBranch.branch_name || 'Неизвестный филиал',
        branchAddress: localBranch?.address || apiBranch.branch_address || '',
        lastMessage: lastMessage,
        unreadCount: unreadCount,
        updatedAt: latestUpdatedAt
      });
      }
    }

    // КРИТИЧНО: Также добавляем филиалы, у которых есть чаты, но которых нет в списке из внешнего API
    let addedFromDB = 0;
    for (const [branchId, branchChats] of chatsByBranch.entries()) {
      if (!branchesMap.has(branchId)) {
        const localBranch = localBranchesMap.get(branchId);

        if (localBranch) {
          // ОПТИМИЗАЦИЯ: Сортируем один раз и используем результат
          const sortedChats = [...branchChats].sort((a: any, b: any) => 
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          const latestChat = sortedChats[0];
          
          // Используем последнее сообщение из чата (уже загружено)
          const lastMessage = latestChat.lastMessage || null;
          
          // Подсчитываем непрочитанные сообщения (суммируем из всех чатов филиала)
          const unreadCount = branchChats.reduce((sum: number, chat: any) => sum + (chat._count?.messages || 0), 0);
          
          branchesMap.set(branchId, {
            branchId: branchId,
            branchName: localBranch.name,
            branchAddress: localBranch.address,
            lastMessage: lastMessage,
            unreadCount: unreadCount,
            updatedAt: latestChat.updatedAt
          });
          addedFromDB++;
        } else {
          console.warn('[SafetyJournalChat] getBranchesWithChats - Branch not found in local DB:', branchId);
        }
      }
    }
    console.log('[SafetyJournalChat] getBranchesWithChats - added branches from DB (not in API):', addedFromDB);

    // КРИТИЧНО: Преобразуем Map в массив и сортируем по дате обновления (самые свежие сверху)
    const branchesWithChats = Array.from(branchesMap.values()).sort((a: any, b: any) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA; // Сортируем по убыванию (самые свежие сверху)
    });
    
    const duration = Date.now() - startTime; // ВЫСОКИЙ ПРИОРИТЕТ: Мониторинг производительности
    console.log('[SafetyJournalChat] getBranchesWithChats - returning branches:', branchesWithChats.length, `(${duration}ms)`);
    console.log('[SafetyJournalChat] getBranchesWithChats - branch IDs:', branchesWithChats.map((b: any) => b.branchId).slice(0, 20));
    
    // ВЫСОКИЙ ПРИОРИТЕТ: Логирование медленных запросов
    if (duration > 2000) {
      console.warn(`[SafetyJournalChat] SLOW QUERY: getBranchesWithChats took ${duration}ms`);
    }

    res.json(branchesWithChats);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[SafetyJournalChat] Error getting branches with chats:', error);
    console.error('[SafetyJournalChat] Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      code: error?.code,
      duration: `${duration}ms`
    });
    res.status(500).json({ 
      error: 'Failed to get branches with chats',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
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
  } catch (error: any) {
    // СРЕДНИЙ ПРИОРИТЕТ: Улучшенная обработка ошибок
    console.error('[SafetyJournalChat] Error getting checkers:', error);
    console.error('[SafetyJournalChat] Error details:', {
      message: error?.message,
      stack: error?.stack?.substring(0, 200),
      name: error?.name
    });
    res.status(500).json({ 
      error: 'Failed to get checkers',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
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

    // ОПТИМИЗАЦИЯ: Получаем ответственных за филиал из внешнего API ОДИН РАЗ
    // И сохраняем типы ответственности одновременно
    const responsibilityTypesMap = new Map<string, string[]>();
    const externalResponsibles: Array<{
      employee_id?: string;
      employee_email?: string;
      employee_name?: string;
      responsibility_type?: string;
    }> = [];
    
    try {
      const authToken = getAuthToken(req);
      if (authToken) {
        // СРЕДНИЙ ПРИОРИТЕТ: ОДИН запрос к внешнему API вместо двух с кэшированием
        const apiCacheKey = `branch_responsibles_${branchId}_${authToken?.substring(0, 10) || 'default'}`;
        let responsiblesResponse: any;
        
        // Проверяем кэш
        const cachedApiData = apiCache.get(apiCacheKey);
        if (cachedApiData && Date.now() - cachedApiData.timestamp < API_CACHE_TTL) {
          responsiblesResponse = { data: cachedApiData.data };
          console.log('[SafetyJournalChat] getChatParticipants - using cached API data for branch:', branchId);
        } else {
          // Очищаем устаревшие записи из кэша периодически
          if (apiCache.size > 100) {
            cleanApiCache();
          }
          
          responsiblesResponse = await axios.get(
            `${JOURNALS_API_URL}/branch_responsibles/?branchId=${branchId}`,
            {
              headers: createAuthHeaders(authToken),
              timeout: 5000 // 5 секунд таймаут
            }
          );
          
          // Сохраняем в кэш
          if (responsiblesResponse?.data) {
            apiCache.set(apiCacheKey, { data: responsiblesResponse.data, timestamp: Date.now() });
          }
        }

        if (responsiblesResponse.data && Array.isArray(responsiblesResponse.data)) {
          for (const branchData of responsiblesResponse.data) {
            if (branchData.branch_id === branchId && branchData.responsibles && Array.isArray(branchData.responsibles)) {
              const responsibles = branchData.responsibles;
              
              // ОПТИМИЗАЦИЯ: Используем батчинг для поиска всех пользователей сразу
              const userCache = new Map();
              const usersMap = await findUsersByResponsiblesBatch(
                prisma,
                responsibles,
                {
                  select: { id: true, name: true, email: true },
                  cache: userCache
                }
              );
              
              // Обрабатываем ответственных: добавляем в участники и сохраняем типы ответственности
              for (const resp of responsibles) {
                if (resp.employee_id || resp.employee_email || resp.employee_name) {
                  const key = resp.employee_id || resp.employee_email || resp.employee_name || '';
                  const responsibleUser = usersMap.get(key);
                  
                  if (responsibleUser) {
                    participantIds.add(responsibleUser.id);
                    
                    // Сохраняем тип ответственности
                    if (resp.responsibility_type) {
                      const types = responsibilityTypesMap.get(responsibleUser.id) || [];
                      if (!types.includes(resp.responsibility_type)) {
                        types.push(resp.responsibility_type);
                        responsibilityTypesMap.set(responsibleUser.id, types);
                      }
                    }
                  } else {
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
              break; // Нашли нужный филиал, выходим из цикла
            }
          }
        }
      }
    } catch (apiError) {
      console.error('[SafetyJournalChat] Error fetching responsibles from external API:', apiError);
      // Продолжаем работу даже если внешний API недоступен
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
    // СРЕДНИЙ ПРИОРИТЕТ: Улучшенная обработка ошибок
    console.error('[SafetyJournalChat] Error getting or creating chat:', error);
    console.error('[SafetyJournalChat] Error details:', {
      message: error?.message,
      stack: error?.stack?.substring(0, 200),
      name: error?.name,
      code: error?.code
    });
    
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
  const startTime = Date.now(); // ВЫСОКИЙ ПРИОРИТЕТ: Мониторинг производительности
  try {
    const token = (req as any).token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { chatId } = req.params;
    const { page = '1', limit = '20', cursor } = req.query; // КРИТИЧНО: Изменен дефолтный лимит на 20 сообщений

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    
    // КРИТИЧНО: Ограничиваем лимит максимум 20 для первой страницы, чтобы всегда показывать последние 20 сообщений
    const effectiveLimit = pageNum === 1 ? Math.min(limitNum, 20) : limitNum;
    
    // ОПТИМИЗАЦИЯ: Сначала проверяем доступ к чату, затем загружаем сообщения
    const [chat, userIsChecker, user] = await Promise.all([
      prisma.safetyJournalChat.findUnique({
        where: { id: chatId },
        select: { 
          checkerId: true,
          branchId: true
        }
      }),
      isChecker(token.userId),
      prisma.user.findUnique({
        where: { id: token.userId },
        select: { branch: true }
      })
    ]);

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    // Если пользователь проверяющий, сразу разрешаем доступ
    if (!userIsChecker) {
      // Проверяем другие условия доступа параллельно
      const isUserChecker = chat.checkerId === token.userId;
      const isBranchEmployee = user?.branch === chat.branchId;
      
      // Проверяем ответственного только если другие проверки не прошли
      let isResponsible = false;
      if (!isUserChecker && !isBranchEmployee) {
        const authToken = getAuthToken(req);
        if (authToken) {
          isResponsible = await isResponsibleForBranch(token.userId, chat.branchId, authToken);
        }
      }

      // Если пользователь не соответствует ни одному условию доступа
      if (!isUserChecker && !isBranchEmployee && !isResponsible) {
        return res.status(403).json({ error: 'Доступ запрещен' });
      }
    }
    
    // НИЗКИЙ ПРИОРИТЕТ: Cursor-based пагинация (более эффективна для больших наборов данных)
    // Если передан cursor, используем cursor-based пагинацию
    let messages: any[];
    let total: number;
    let hasNextPage = false;
    let nextCursor: string | null = null;
    
    if (cursor && typeof cursor === 'string') {
      // Cursor-based пагинация: загружаем сообщения до указанного cursor (более старые)
      const cursorDate = new Date(cursor);
      
      [messages, total] = await Promise.all([
        prisma.safetyJournalChatMessage.findMany({
          where: {
            chatId,
            createdAt: { lt: cursorDate } // Сообщения старше cursor
          },
          skip: 0,
          take: effectiveLimit + 1, // Загружаем на 1 больше, чтобы проверить наличие следующей страницы
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
          orderBy: { createdAt: 'desc' } // Сортируем по убыванию для получения старых сообщений
        }),
        prisma.safetyJournalChatMessage.count({
          where: { chatId }
        })
      ]);
      
      // Проверяем, есть ли еще сообщения
      if (messages.length > effectiveLimit) {
        hasNextPage = true;
        messages = messages.slice(0, effectiveLimit); // Убираем лишний элемент
        nextCursor = messages[messages.length - 1]?.createdAt?.toISOString() || null;
      } else if (messages.length > 0) {
        nextCursor = messages[messages.length - 1]?.createdAt?.toISOString() || null;
      }
      
      // Переворачиваем порядок для правильного отображения (старые сверху, новые снизу)
      messages = messages.reverse();
    } else {
      // КРИТИЧНО: При первой загрузке (page=1) всегда загружаем последние сообщения по дате (самые новые)
      total = await prisma.safetyJournalChatMessage.count({
        where: { chatId }
      });
      
      if (pageNum === 1) {
        // КРИТИЧНО: При первой загрузке берем последние N сообщений (самые новые по дате)
        // Используем orderBy desc и берем первые N, затем переворачиваем для отображения
        [messages, total] = await Promise.all([
          prisma.safetyJournalChatMessage.findMany({
            where: { chatId },
            take: effectiveLimit, // Берем последние N сообщений
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
            orderBy: { createdAt: 'desc' } // Сортируем по убыванию - получаем самые новые первыми
          }),
          Promise.resolve(total)
        ]);
        
        // КРИТИЧНО: Переворачиваем массив для правильного отображения (старые сверху, новые снизу)
        messages = messages.reverse();
        
        // Вычисляем cursor для следующей страницы (самое старое сообщение в текущей выборке)
        if (messages.length > 0 && messages.length === effectiveLimit && total > effectiveLimit) {
          hasNextPage = true;
          nextCursor = messages[0]?.createdAt?.toISOString() || null; // Cursor первого (самого старого) сообщения
        }
      } else {
        // Последующие страницы: используем cursor-based пагинацию для загрузки более старых сообщений
        // Это должно было быть обработано в блоке выше с cursor, но на случай если cursor не передан
        // используем offset-based пагинацию как fallback
        const skip = Math.max(0, total - (pageNum * effectiveLimit));
        const take = Math.min(effectiveLimit, total - skip);
        
        [messages, total] = await Promise.all([
          prisma.safetyJournalChatMessage.findMany({
            where: { chatId },
            skip,
            take: take > 0 ? take : effectiveLimit,
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
            orderBy: { createdAt: 'asc' } // Для последующих страниц сортируем по возрастанию
          }),
          Promise.resolve(total)
        ]);
        
        // Для последующих страниц вычисляем cursor для следующей страницы
        if (messages.length > 0 && pageNum * effectiveLimit < total) {
          hasNextPage = true;
          nextCursor = messages[messages.length - 1]?.createdAt?.toISOString() || null;
        }
      }
    }

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

    const duration = Date.now() - startTime; // ВЫСОКИЙ ПРИОРИТЕТ: Мониторинг производительности
    console.log('[SafetyJournalChat] getMessages - completed:', {
      chatId,
      messagesCount: messagesWithEditedFlag.length,
      page: pageNum,
      duration: `${duration}ms`
    });
    
    // ВЫСОКИЙ ПРИОРИТЕТ: Логирование медленных запросов
    if (duration > 1000) {
      console.warn(`[SafetyJournalChat] SLOW QUERY: getMessages took ${duration}ms for chatId ${chatId}`);
    }

    res.json({
      messages: messagesWithEditedFlag,
      pagination: {
        page: pageNum,
        limit: effectiveLimit,
        total,
        totalPages: Math.ceil(total / effectiveLimit),
        // НИЗКИЙ ПРИОРИТЕТ: Cursor-based пагинация
        hasNextPage,
        nextCursor, // Cursor для следующей страницы (для загрузки более старых сообщений)
        // Для первой загрузки cursor будет указывать на самое старое сообщение в текущей выборке
        // Для последующих загрузок используем этот cursor для получения более старых сообщений
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[SafetyJournalChat] Error getting messages:', error, `(${duration}ms)`);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

// Отправить сообщение
export const sendMessage = async (req: Request, res: Response) => {
  const startTime = Date.now(); // ВЫСОКИЙ ПРИОРИТЕТ: Мониторинг производительности
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

    // ОПТИМИЗАЦИЯ: Параллельно получаем чат и проверяем доступ
    const chatPromise = prisma.safetyJournalChat.findUnique({
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
    
    const userIsCheckerPromise = isChecker(token.userId);
    
    const [chat, userIsChecker] = await Promise.all([chatPromise, userIsCheckerPromise]);

    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

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

    // КРИТИЧНО: Обновляем updatedAt чата в фоне (не блокируем ответ)
    prisma.safetyJournalChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() }
    }).catch(() => {
      // Игнорируем ошибки обновления
    });
    
    // КРИТИЧНО: Используем уже загруженное сообщение вместо повторного запроса
    // Формируем данные для Socket.IO из уже имеющегося сообщения
    const messageData = {
      type: 'SAFETY_JOURNAL_MESSAGE',
      chatId,
      branchId: chat.branchId,
      message: {
        id: message.id,
        message: message.message,
        sender: message.sender,
        createdAt: message.createdAt,
        attachments: message.attachments || [],
        quotedMessage: (message as any).quotedMessage || null
      }
    };
    
    // Отправляем через Socket.IO СРАЗУ (не блокируем ответ)
    const socketService = SocketIOService.getInstance();
    
    // КРИТИЧНО: Отправляем Socket.IO сообщение сразу основным участникам чата
    // Используем простой список участников из чата (checkerId + отправитель)
    const quickParticipants = new Set<string>();
    quickParticipants.add(token.userId); // Отправитель
    if (chat.checkerId) {
      quickParticipants.add(chat.checkerId); // Проверяющий
    }
    
    // Отправляем Socket.IO сообщения сразу
    for (const participantId of quickParticipants) {
      socketService.sendChatMessage(participantId, messageData);
    }
    
    // КРИТИЧНО: Возвращаем ответ СРАЗУ после Socket.IO
    const duration = Date.now() - startTime;
    console.log('[SafetyJournalChat] sendMessage - quick response:', {
      chatId,
      messageId: message.id,
      duration: `${duration}ms`
    });
    
    res.status(201).json(message);
    
    // ВСЕ ОСТАЛЬНОЕ ДЕЛАЕМ В ФОНЕ (не блокируем ответ)
    // Асинхронно получаем всех участников и отправляем уведомления
    (async () => {
      try {
        // Получаем финальное сообщение с вложениями
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
        
        // Обновляем данные для Socket.IO с полной информацией
        const fullMessageData = {
          ...messageData,
        message: {
          ...messageData.message,
          attachments: finalMessage?.attachments || message.attachments || [],
          quotedMessage: (finalMessage as any)?.quotedMessage || null
        }
        };
        
        // Отправляем полное сообщение через Socket.IO остальным участникам
        const authToken = getAuthToken(req);
        const participantIds = new Set<string>();
        
        // Получаем всех проверяющих
        const safetyTool = await prisma.tool.findFirst({
          where: { link: 'jurists/safety' }
        });
        
        if (safetyTool) {
          const [userAccesses, supervisors] = await Promise.all([
            prisma.userToolAccess.findMany({
              where: {
                toolId: safetyTool.id,
                accessLevel: 'FULL'
              },
              select: { userId: true }
            }),
            prisma.user.findMany({
              where: { role: 'SUPERVISOR' },
              select: { id: true }
            })
          ]);
          
          userAccesses.forEach(access => participantIds.add(access.userId));
          supervisors.forEach(s => participantIds.add(s.id));
        }
        
        if (chat.checkerId) {
          participantIds.add(chat.checkerId);
        }
        
        // Получаем ответственных из внешнего API (с кэшированием)
        if (authToken) {
          try {
            const apiCacheKey = `branch_responsibles_${chat.branchId}_${authToken?.substring(0, 10) || 'default'}`;
            let responsiblesResponse: any;
            
            const cachedApiData = apiCache.get(apiCacheKey);
            if (cachedApiData && Date.now() - cachedApiData.timestamp < API_CACHE_TTL) {
              responsiblesResponse = { data: cachedApiData.data };
            } else {
              if (apiCache.size > 100) {
                cleanApiCache();
              }
              
              responsiblesResponse = await axios.get(
                `${JOURNALS_API_URL}/branch_responsibles/?branchId=${chat.branchId}`,
                {
                  headers: createAuthHeaders(authToken),
                  timeout: 5000
                }
              );
              
              if (responsiblesResponse?.data) {
                apiCache.set(apiCacheKey, { data: responsiblesResponse.data, timestamp: Date.now() });
              }
            }
            
            if (responsiblesResponse?.data && Array.isArray(responsiblesResponse.data)) {
              for (const branchData of responsiblesResponse.data) {
                if (branchData.branch_id === chat.branchId && branchData.responsibles) {
                  const usersMap = await findUsersByResponsiblesBatch(
                    prisma,
                    branchData.responsibles,
                    { select: { id: true }, cache: new Map() }
                  );
                  
                  for (const resp of branchData.responsibles) {
                    const key = resp.employee_id || resp.employee_email || resp.employee_name || '';
                    const responsibleUser = usersMap.get(key);
                    if (responsibleUser) {
                      participantIds.add(responsibleUser.id);
                    }
                  }
                  break;
                }
              }
            }
          } catch (apiError) {
            console.error('[SafetyJournalChat] Error fetching responsibles in background:', apiError);
          }
        }
        
        // Отправляем Socket.IO сообщения всем участникам
        participantIds.add(token.userId);
        for (const participantId of participantIds) {
          if (!quickParticipants.has(participantId)) {
            socketService.sendChatMessage(participantId, fullMessageData);
          }
        }
        
        // Отправляем уведомления в фоне
        const senderName = finalMessage?.sender?.name || message?.sender?.name || 'Пользователь';
        const notificationMessageText = finalMessage?.message || message?.message || '';
        const attachments = finalMessage?.attachments || message?.attachments || [];
        
        let messagePreview = '';
        if (typeof notificationMessageText === 'string' && notificationMessageText.trim()) {
          messagePreview = notificationMessageText.length > 50 ? notificationMessageText.substring(0, 50) + '...' : notificationMessageText;
        } else if (attachments.length > 0) {
          messagePreview = attachments.length === 1 ? '📎 файл' : `📎 ${attachments.length} файлов`;
        } else {
          messagePreview = 'Сообщение';
        }
        
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
        
        // Отправляем уведомления асинхронно
        const notificationPromises: Promise<void>[] = [];
        for (const participantId of participantIds) {
          if (participantId !== token.userId) {
            const isInThisChat = socketService.isUserInActiveChat(participantId, chatId);
            if (!isInThisChat) {
              notificationPromises.push(
                NotificationController.create({
                  type: 'INFO',
                  channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
                  title: senderName,
                  message: messagePreview,
                  senderId: token.userId,
                  receiverId: participantId,
                  priority: 'MEDIUM',
                  action: {
                    type: 'NAVIGATE',
                    url: `/jurists/safety?branchId=${chat.branchId}&chatId=${chatId}&messageId=${message.id}`,
                    chatId: chatId,
                    messageId: message.id,
                    branchName: branchName,
                  },
                }).then(() => {
                  // Преобразуем в void
                }).catch((error) => {
                  console.error(`[SafetyJournalChat] Error sending notification to ${participantId}:`, error);
                }) as Promise<void>
              );
            }
          }
        }
        
        await Promise.allSettled(notificationPromises);
        console.log('[SafetyJournalChat] Background notifications sent');
      } catch (bgError) {
        console.error('[SafetyJournalChat] Error in background processing:', bgError);
      }
    })();
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[SafetyJournalChat] Error sending message:', error, `(${duration}ms)`);
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
  } catch (error: any) {
    // СРЕДНИЙ ПРИОРИТЕТ: Улучшенная обработка ошибок
    console.error('[SafetyJournalChat] Error marking messages as read:', error);
    console.error('[SafetyJournalChat] Error details:', {
      message: error?.message,
      stack: error?.stack?.substring(0, 200),
      name: error?.name
    });
    res.status(500).json({ 
      error: 'Failed to mark messages as read',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
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
  } catch (error: any) {
    // СРЕДНИЙ ПРИОРИТЕТ: Улучшенная обработка ошибок
    console.error('[SafetyJournalChat] Error deleting message:', error);
    console.error('[SafetyJournalChat] Error details:', {
      message: error?.message,
      stack: error?.stack?.substring(0, 200),
      name: error?.name
    });
    res.status(500).json({ 
      error: 'Failed to delete message',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
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
  } catch (error: any) {
    // СРЕДНИЙ ПРИОРИТЕТ: Улучшенная обработка ошибок
    console.error('[SafetyJournalChat] Error updating message:', error);
    console.error('[SafetyJournalChat] Error details:', {
      message: error?.message,
      stack: error?.stack?.substring(0, 200),
      name: error?.name
    });
    res.status(500).json({ 
      error: 'Failed to update message',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
};

