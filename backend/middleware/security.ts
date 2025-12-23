import { Request, Response, NextFunction } from 'express';

/**
 * Middleware для проверки HTTPS в production окружении
 * Защищает от передачи паролей по незащищенному соединению
 */
export const requireHTTPS = (req: Request, res: Response, next: NextFunction): void => {
  // В development разрешаем HTTP
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  // Проверяем, что запрос идет по HTTPS
  const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';
  
  if (!isSecure) {
    console.warn(`[Security] HTTPS required but request is not secure. IP: ${req.ip}, URL: ${req.originalUrl}`);
    res.status(403).json({ 
      error: 'HTTPS required',
      message: 'This application requires a secure connection. Please use HTTPS.'
    });
    return;
  }

  next();
};

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

