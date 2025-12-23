/**
 * Простой rate limiter для операций с паролями Exchange и логина
 * Использует in-memory хранилище (Map)
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blockedUntil?: number; // Время блокировки (для логина)
}

// Хранилище для rate limiting: identifier -> RateLimitEntry
const rateLimitStore = new Map<string, RateLimitEntry>();

// Очистка устаревших записей каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Проверка rate limit для операций с паролями
 * @param userId - ID пользователя
 * @param maxRequests - Максимальное количество запросов
 * @param windowMs - Окно времени в миллисекундах
 * @returns true если лимит не превышен, false если превышен
 */
export const checkPasswordRateLimit = (
  userId: string,
  maxRequests: number = 5,
  windowMs: number = 15 * 60 * 1000 // 15 минут
): { allowed: boolean; remaining: number; resetTime: number } => {
  const key = `password-op:${userId}`;
  const now = Date.now();
  
  let entry = rateLimitStore.get(key);
  
  // Если записи нет или время истекло, создаем новую
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + windowMs
    };
    rateLimitStore.set(key, entry);
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: entry.resetTime
    };
  }
  
  // Если лимит превышен
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime
    };
  }
  
  // Увеличиваем счетчик
  entry.count++;
  rateLimitStore.set(key, entry);
  
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetTime: entry.resetTime
  };
};

/**
 * Проверка rate limit для попыток входа
 * @param identifier - IP адрес или логин
 * @param maxAttempts - Максимальное количество попыток
 * @param windowMs - Окно времени в миллисекундах
 * @param blockDurationMs - Длительность блокировки после превышения лимита
 * @returns результат проверки с информацией о блокировке
 */
export const checkLoginRateLimit = (
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000, // 15 минут
  blockDurationMs: number = 30 * 60 * 1000 // 30 минут блокировки
): { 
  allowed: boolean; 
  remaining: number; 
  resetTime: number;
  blockedUntil?: number;
  isBlocked: boolean;
} => {
  const key = `login:${identifier}`;
  const now = Date.now();
  
  let entry = rateLimitStore.get(key);
  
  // Проверяем, не заблокирован ли идентификатор
  if (entry?.blockedUntil && now < entry.blockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      blockedUntil: entry.blockedUntil,
      isBlocked: true
    };
  }
  
  // Если блокировка истекла, сбрасываем счетчик
  if (entry?.blockedUntil && now >= entry.blockedUntil) {
    entry.blockedUntil = undefined;
    entry.count = 0;
  }
  
  // Если записи нет или время истекло, создаем новую
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + windowMs
    };
    rateLimitStore.set(key, entry);
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetTime: entry.resetTime,
      isBlocked: false
    };
  }
  
  // Если лимит превышен, блокируем
  if (entry.count >= maxAttempts) {
    entry.blockedUntil = now + blockDurationMs;
    rateLimitStore.set(key, entry);
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      blockedUntil: entry.blockedUntil,
      isBlocked: true
    };
  }
  
  // Увеличиваем счетчик
  entry.count++;
  rateLimitStore.set(key, entry);
  
  return {
    allowed: true,
    remaining: maxAttempts - entry.count,
    resetTime: entry.resetTime,
    isBlocked: false
  };
};

/**
 * Сброс счетчика неудачных попыток для логина (при успешном входе)
 * @param identifier - IP адрес или логин
 */
export const resetLoginRateLimit = (identifier: string): void => {
  const key = `login:${identifier}`;
  rateLimitStore.delete(key);
};

/**
 * Маскировка логина для безопасного логирования
 * @param login - Логин пользователя
 * @returns Замаскированный логин (первые 3 символа + ***)
 */
export const maskLogin = (login: string): string => {
  if (!login || login.length <= 3) {
    return '***';
  }
  return login.substring(0, 3) + '***';
};

