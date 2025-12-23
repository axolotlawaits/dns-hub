import { Request, Response, NextFunction } from 'express';
import { prisma } from '../server.js';

/**
 * Middleware для логирования действий пользователей в AuditLog
 */
export const auditLog = async (
  action: string,
  entityType?: string,
  getEntityId?: (req: Request, res: Response) => string | null | undefined,
  getDetails?: (req: Request, res: Response) => any
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Сохраняем оригинальный метод res.json
    const originalJson = res.json.bind(res);
    
    // Переопределяем res.json для перехвата ответа
    res.json = function(body: any) {
      // После успешного ответа логируем действие
      if (res.statusCode >= 200 && res.statusCode < 300) {
        logAction(req, res, action, entityType, getEntityId, getDetails).catch(err => {
          console.error('Ошибка при логировании действия:', err);
        });
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * Функция для логирования действия
 */
async function logAction(
  req: Request,
  res: Response,
  action: string,
  entityType?: string,
  getEntityId?: (req: Request, res: Response) => string | null | undefined,
  getDetails?: (req: Request, res: Response) => any
): Promise<void> {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      return; // Не логируем если нет пользователя
    }

    const userId = token.userId;
    const userEmail = token.userEmail || null;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const entityId = getEntityId ? getEntityId(req, res) : req.params.id || null;
    const details = getDetails ? getDetails(req, res) : null;

    await prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action,
        entityType: entityType || null,
        entityId: entityId || null,
        details: details ? JSON.parse(JSON.stringify(details)) : null,
        ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
        userAgent
      }
    });
  } catch (error) {
    console.error('Ошибка при создании записи аудита:', error);
    // Не прерываем выполнение запроса при ошибке логирования
  }
}

// Системный UUID для неудачных попыток входа (когда userId неизвестен)
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Вспомогательная функция для логирования действий вручную
 * userId может быть null для неудачных попыток входа (будет использован системный UUID)
 */
export const logUserAction = async (
  userId: string | null,
  userEmail: string | null,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: any,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  try {
    // Для неудачных попыток входа используем системный UUID
    const finalUserId = userId || SYSTEM_USER_ID;
    
    await prisma.auditLog.create({
      data: {
        userId: finalUserId,
        userEmail,
        action,
        entityType: entityType || null,
        entityId: entityId || null,
        details: details ? JSON.parse(JSON.stringify(details)) : null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null
      }
    });
  } catch (error) {
    console.error('Ошибка при создании записи аудита:', error);
  }
};

