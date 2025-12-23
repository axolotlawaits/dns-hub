import { Request, Response, NextFunction } from 'express';

/**
 * Middleware для установки HSTS (HTTP Strict Transport Security) headers
 * Защищает от downgrade атак
 */
export const hsts = (req: Request, res: Response, next: NextFunction): void => {
  // Устанавливаем HSTS только для HTTPS соединений
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
};

/**
 * Middleware для очистки чувствительных данных из res.locals после использования
 */
export const clearSensitiveData = (req: Request, res: Response, next: NextFunction): void => {
  // Очищаем пароль из памяти после завершения запроса
  res.on('finish', () => {
    if ((res.locals as any).userPassword) {
      (res.locals as any).userPassword = null;
    }
  });
  next();
};

