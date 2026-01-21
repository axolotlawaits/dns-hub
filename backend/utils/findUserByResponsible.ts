import { PrismaClient } from '@prisma/client';

interface ResponsibleData {
  employee_id?: string;
  employee_email?: string;
  employee_name?: string;
}

interface FindUserOptions {
  select?: {
    id?: boolean;
    name?: boolean;
    email?: boolean;
  };
  cache?: Map<string, any>;
}

/**
 * Находит пользователя по данным ответственного из внешнего API
 * Использует несколько стратегий поиска для максимальной надежности
 * 
 * @param prisma - Экземпляр PrismaClient
 * @param resp - Данные ответственного из внешнего API
 * @param options - Опции поиска (select, cache)
 * @returns Найденный пользователь или null
 */
export async function findUserByResponsibleData(
  prisma: PrismaClient,
  resp: ResponsibleData,
  options: FindUserOptions = {}
): Promise<{ id: string; name?: string; email?: string } | null> {
  const { select = { id: true }, cache } = options;
  
  // Проверяем кеш, если он есть
  const cacheKey = `${resp.employee_id || ''}_${resp.employee_email || ''}_${resp.employee_name || ''}`;
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey) as { id: string; name?: string; email?: string } | null;
  }

  let responsibleUser: { id: string; name?: string; email?: string } | null = null;
  
  // Способ 1: По employee_id напрямую (если employee_id = user.id)
  if (!responsibleUser && resp.employee_id) {
    const found = await prisma.user.findUnique({
      where: { id: resp.employee_id },
      select: select as any
    }) as any;
    if (found && found.id) {
      responsibleUser = { id: found.id, name: found.name, email: found.email };
    }
  }
  
  // Способ 2: По email, если есть в ответе
  if (!responsibleUser && resp.employee_email) {
    const found = await prisma.user.findUnique({
      where: { email: resp.employee_email },
      select: select as any
    }) as any;
    if (found && found.id) {
      responsibleUser = { id: found.id, name: found.name, email: found.email };
    }
  }
  
  // Способ 3: Через UserData по email
  if (!responsibleUser && resp.employee_email) {
    const userData = await prisma.userData.findFirst({
      where: { email: resp.employee_email },
      select: { email: true }
    });
    
    if (userData?.email) {
      const found = await prisma.user.findUnique({
        where: { email: userData.email },
        select: select as any
      }) as any;
      if (found && found.id) {
        responsibleUser = { id: found.id, name: found.name, email: found.email };
      }
    }
  }
  
  // Способ 4: По employee_id через UserData.code (если employee_id это код сотрудника)
  if (!responsibleUser && resp.employee_id) {
    const userData = await prisma.userData.findFirst({
      where: { code: resp.employee_id },
      select: { email: true }
    });
    
    if (userData?.email) {
      const found = await prisma.user.findUnique({
        where: { email: userData.email },
        select: select as any
      }) as any;
      if (found && found.id) {
        responsibleUser = { id: found.id, name: found.name, email: found.email };
      }
    }
  }
  
  // Способ 5: По имени через UserData.fio (менее надежно, но может помочь)
  if (!responsibleUser && resp.employee_name) {
    const firstName = resp.employee_name.split(' ')[0];
    if (firstName) {
      const userData = await prisma.userData.findFirst({
        where: { 
          fio: { contains: firstName, mode: 'insensitive' }
        },
        select: { email: true }
      });
      
      if (userData?.email) {
        const found = await prisma.user.findUnique({
          where: { email: userData.email },
          select: select as any
        }) as any;
        if (found && found.id) {
          responsibleUser = { id: found.id, name: found.name, email: found.email };
        }
      }
    }
  }

  // Сохраняем в кеш, если он есть
  if (cache) {
    cache.set(cacheKey, responsibleUser);
  }

  return responsibleUser;
}

/**
 * Находит пользователей для массива ответственных с оптимизацией (батчинг и кеширование)
 * 
 * @param prisma - Экземпляр PrismaClient
 * @param responsibles - Массив данных ответственных
 * @param options - Опции поиска
 * @returns Map с ключом employee_id и значением найденного пользователя
 */
export async function findUsersByResponsiblesBatch(
  prisma: PrismaClient,
  responsibles: ResponsibleData[],
  options: FindUserOptions = {}
): Promise<Map<string, { id: string; name?: string; email?: string } | null>> {
  const { select = { id: true }, cache = new Map() } = options;
  const result = new Map<string, { id: string; name?: string; email?: string } | null>();
  
  // Собираем все уникальные идентификаторы для батч-запросов
  const employeeIds = new Set<string>();
  const emails = new Set<string>();
  const firstNames = new Set<string>();
  
  for (const resp of responsibles) {
    if (resp.employee_id) employeeIds.add(resp.employee_id);
    if (resp.employee_email) emails.add(resp.employee_email);
    if (resp.employee_name) {
      const firstName = resp.employee_name.split(' ')[0];
      if (firstName) firstNames.add(firstName);
    }
  }
  
  // Батч-запросы для оптимизации
  const [usersById, usersByEmail, userDataByEmail, userDataByCode, userDataByFio] = await Promise.all([
    // Способ 1: По employee_id
    employeeIds.size > 0 
      ? prisma.user.findMany({
          where: { id: { in: Array.from(employeeIds) } },
          select: select as any
        })
      : Promise.resolve([]),
    
    // Способ 2: По email
    emails.size > 0
      ? prisma.user.findMany({
          where: { email: { in: Array.from(emails) } },
          select: select as any
        })
      : Promise.resolve([]),
    
    // Способ 3: UserData по email
    emails.size > 0
      ? prisma.userData.findMany({
          where: { email: { in: Array.from(emails) } },
          select: { email: true }
        })
      : Promise.resolve([]),
    
    // Способ 4: UserData по code
    employeeIds.size > 0
      ? prisma.userData.findMany({
          where: { code: { in: Array.from(employeeIds) } },
          select: { email: true }
        })
      : Promise.resolve([]),
    
    // Способ 5: UserData по fio - делаем запросы для каждого имени отдельно
    // (Prisma не поддерживает OR с contains в одном запросе)
    firstNames.size > 0
      ? Promise.all(
          Array.from(firstNames).map(firstName =>
            prisma.userData.findMany({
              where: {
                fio: {
                  contains: firstName,
                  mode: 'insensitive'
                }
              },
              select: { email: true, fio: true }
            })
          )
        ).then(results => results.flat())
      : Promise.resolve([])
  ]);
  
  // Создаем индексы для быстрого поиска
  const usersByIdMap = new Map<string, any>(usersById.map((u: any) => [u.id, u]));
  const usersByEmailMap = new Map<string, any>(usersByEmail.map((u: any) => [u.email, u]));
  const userDataByEmailMap = new Map<string, { email: string }>(userDataByEmail.map((ud: any) => [ud.email, ud]));
  const userDataByCodeMap = new Map<string, { email: string }>(userDataByCode.map((ud: any) => [ud.email, ud]));
  // Для fio создаем мапу по email, но также сохраняем fio для поиска
  const userDataByFioMap = new Map<string, { email: string; fio?: string }>();
  for (const ud of userDataByFio) {
    userDataByFioMap.set(ud.email, ud);
  }
  
  // Для каждого ответственного ищем пользователя
  for (const resp of responsibles) {
    const key = resp.employee_id || resp.employee_email || resp.employee_name || '';
    
    // Проверяем кеш
    if (cache.has(key)) {
      result.set(key, cache.get(key));
      continue;
    }
    
    let user: { id: string; name?: string; email?: string } | null = null;
    
    // Способ 1: По employee_id
    if (!user && resp.employee_id) {
      const found = usersByIdMap.get(resp.employee_id);
      if (found && typeof found === 'object' && 'id' in found) {
        const foundAny = found as any;
        user = { id: foundAny.id, name: foundAny.name, email: foundAny.email };
      }
    }
    
    // Способ 2: По email
    if (!user && resp.employee_email) {
      const found = usersByEmailMap.get(resp.employee_email);
      if (found && typeof found === 'object' && 'id' in found) {
        const foundAny = found as any;
        user = { id: foundAny.id, name: foundAny.name, email: foundAny.email };
      }
    }
    
    // Способ 3: UserData по email
    if (!user && resp.employee_email) {
      const userData = userDataByEmailMap.get(resp.employee_email);
      if (userData?.email) {
        const found = usersByEmailMap.get(userData.email);
        if (found && typeof found === 'object' && 'id' in found) {
          const foundAny = found as any;
          user = { id: foundAny.id, name: foundAny.name, email: foundAny.email };
        } else {
          // Если не нашли в кеше, делаем запрос
          const foundDb = await prisma.user.findUnique({
            where: { email: userData.email },
            select: select as any
          }) as any;
          if (foundDb && foundDb.id) {
            user = { id: foundDb.id, name: foundDb.name, email: foundDb.email };
          }
        }
      }
    }
    
    // Способ 4: UserData по code
    if (!user && resp.employee_id) {
      const userData = userDataByCodeMap.get(resp.employee_id);
      if (userData?.email) {
        const found = usersByEmailMap.get(userData.email);
        if (found && typeof found === 'object' && 'id' in found) {
          const foundAny = found as any;
          user = { id: foundAny.id, name: foundAny.name, email: foundAny.email };
        } else {
          const foundDb = await prisma.user.findUnique({
            where: { email: userData.email },
            select: select as any
          }) as any;
          if (foundDb && foundDb.id) {
            user = { id: foundDb.id, name: foundDb.name, email: foundDb.email };
          }
        }
      }
    }
    
    // Способ 5: UserData по fio
    if (!user && resp.employee_name) {
      const firstName = resp.employee_name.split(' ')[0];
      if (firstName) {
        // Ищем в результатах батч-запроса по первому имени
        for (const [email, userData] of userDataByFioMap.entries()) {
          if (userData.fio?.toLowerCase().includes(firstName.toLowerCase())) {
            const found = usersByEmailMap.get(email);
            if (found && typeof found === 'object' && 'id' in found) {
              const foundAny = found as any;
              user = { id: foundAny.id, name: foundAny.name, email: foundAny.email };
            } else {
              const foundDb = await prisma.user.findUnique({
                where: { email },
                select: select as any
              }) as any;
              if (foundDb && foundDb.id) {
                user = { id: foundDb.id, name: foundDb.name, email: foundDb.email };
              }
            }
            if (user) break; // Нашли, выходим
          }
        }
      }
    }
    
    result.set(key, user);
    if (cache) {
      cache.set(key, user);
    }
  }
  
  return result;
}

