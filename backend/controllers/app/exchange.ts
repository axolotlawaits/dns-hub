// Контроллер для работы с Exchange
import { Request, Response } from 'express';
import { exchangeService } from '../../services/exchange.js';

/**
 * GET /api/exchange/calendar/events
 * Получить события календаря текущего пользователя
 */
export const getMyCalendarEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      console.error('[Exchange Controller] Unauthorized - no token or userId');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Проверяем конфигурацию Exchange
    if (!exchangeService.isConfigured()) {
      console.error('[Exchange Controller] Exchange not configured');
      res.status(503).json({ 
        error: 'Exchange integration is not configured',
        message: 'Please configure Exchange integration in server settings'
      });
      return;
    }

    // Получаем email пользователя (из БД или LDAP)
    const userEmail = await exchangeService.getUserEmail(token.userId);
    if (!userEmail) {
      console.error(`[Exchange Controller] User email not found for userId: ${token.userId}`);
      res.status(400).json({ 
        error: 'User email not found',
        message: 'Please ensure your email is configured in LDAP or database.'
      });
      return;
    }

    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const startDateTime = startDate ? new Date(startDate) : undefined;
    const endDateTime = endDate ? new Date(endDate) : undefined;
    
    try {
      const events = await exchangeService.getCalendarEvents(
        userEmail,
        startDateTime,
        endDateTime,
        token.userId,
        req
      );

      res.json({ events });
    } catch (exchangeError: any) {
      console.error('[Exchange Controller] Exchange service error:', exchangeError);
      console.error('[Exchange Controller] Error stack:', exchangeError.stack);
      console.error('[Exchange Controller] Error details:', {
        message: exchangeError.message,
        code: exchangeError.code,
        isNetworkError: exchangeError.isNetworkError,
        userId: token?.userId,
        userEmail
      });
      
      // Определяем тип ошибки для правильного HTTP статуса
      const errorMessage = exchangeError.message || 'Unknown error occurred while fetching calendar events';
      const isNetworkError = exchangeError.isNetworkError || 
                            errorMessage.includes('ECONNREFUSED') || 
                            errorMessage.includes('ETIMEDOUT') || 
                            errorMessage.includes('ENOTFOUND') ||
                            errorMessage.includes('timeout') ||
                            errorMessage.includes('network') ||
                            errorMessage.includes('unavailable') ||
                            errorMessage.includes('unreachable');
      
      // Проверяем ошибки аутентификации (401)
      const isAuthError = errorMessage.includes('401') || 
                         errorMessage.includes('authentication failed') ||
                         errorMessage.includes('password not configured') ||
                         errorMessage.includes('credentials') ||
                         errorMessage.includes('Unauthorized');
      
      // Проверяем ошибки конфигурации
      const isConfigError = errorMessage.includes('not configured') ||
                           errorMessage.includes('password not configured') ||
                           errorMessage.includes('credentials') ||
                           exchangeError.userPasswordMissing;
      
      // Если Exchange сервер недоступен или не отвечает, возвращаем 503
      if (isNetworkError) {
        res.status(503).json({ 
          error: 'Exchange service unavailable',
          message: 'Сервис календаря временно недоступен. Пожалуйста, попробуйте позже.'
        });
        return;
      }
      
      // Если ошибка аутентификации или конфигурации, возвращаем 401 или 400
      if (isAuthError || isConfigError) {
        res.status(401).json({ 
          error: 'Exchange authentication failed',
          message: 'Не удалось аутентифицироваться в Exchange. Пожалуйста, проверьте настройки пароля Exchange в вашем профиле или обратитесь к администратору.',
          requiresPassword: exchangeError.userPasswordMissing || false
        });
        return;
      }
      
      // Для других ошибок возвращаем 500
      res.status(500).json({ 
        error: 'Failed to get calendar events from Exchange',
        message: errorMessage
      });
    }
  } catch (error: any) {
    console.error('[Exchange Controller] Error getting calendar events:', error);
    console.error('[Exchange Controller] Error stack:', error.stack);
    console.error('[Exchange Controller] Error details:', {
      message: error.message,
      name: error.name,
      userId: (req as any).token?.userId
    });
    res.status(500).json({ 
      error: 'Failed to get calendar events', 
      message: error.message || 'Unknown error occurred'
    });
  }
};
