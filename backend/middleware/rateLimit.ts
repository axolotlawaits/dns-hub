import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiting для операций с паролями Exchange
 * Максимум 5 операций в 15 минут на пользователя
 */
export const passwordOperationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // максимум 5 попыток
  message: {
    error: 'Too many password operations',
    message: 'Слишком много операций с паролем. Пожалуйста, попробуйте позже через 15 минут.'
  },
  standardHeaders: true, // Возвращает информацию о rate limit в заголовках `RateLimit-*`
  legacyHeaders: false, // Отключает заголовки `X-RateLimit-*`
  // Используем userId из токена для идентификации пользователя
  keyGenerator: (req: Request): string => {
    const token = (req as any).token;
    if (token && token.userId) {
      return `password-op:${token.userId}`;
    }
    // Если нет токена, используем IP адрес
    return `password-op:${req.ip || 'unknown'}`;
  },
  // Пропускаем успешные запросы (не считаем их в лимите)
  skipSuccessfulRequests: false,
  // Пропускаем неудачные запросы (считаем их в лимите)
  skipFailedRequests: false,
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] Password operation limit exceeded for user: ${(req as any).token?.userId || req.ip}`);
    res.status(429).json({
      error: 'Too many password operations',
      message: 'Слишком много операций с паролем. Пожалуйста, попробуйте позже через 15 минут.',
      retryAfter: Math.ceil(15 * 60) // секунды до следующей попытки
    });
  }
});

/**
 * Rate limiting для операций расшифровки паролей
 * Максимум 10 операций в 1 час на пользователя
 */
export const passwordDecryptRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 10, // максимум 10 попыток
  message: {
    error: 'Too many password decryption attempts',
    message: 'Слишком много попыток расшифровки пароля. Пожалуйста, попробуйте позже через час.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const token = (req as any).token;
    if (token && token.userId) {
      return `password-decrypt:${token.userId}`;
    }
    return `password-decrypt:${req.ip || 'unknown'}`;
  },
  handler: (req: Request, res: Response) => {
    console.warn(`[RateLimit] Password decryption limit exceeded for user: ${(req as any).token?.userId || req.ip}`);
    res.status(429).json({
      error: 'Too many password decryption attempts',
      message: 'Слишком много попыток расшифровки пароля. Пожалуйста, попробуйте позже через час.',
      retryAfter: Math.ceil(60 * 60)
    });
  }
});

