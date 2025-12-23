// Контроллер для работы с Exchange
import { Request, Response } from 'express';
import { exchangeService } from '../../services/exchange.js';

/**
 * GET /api/exchange/calendar/events
 * Получить события календаря текущего пользователя
 */
export const getMyCalendarEvents = async (req: Request, res: Response): Promise<void> => {
  console.log(`[Exchange Controller] 📅 GET /exchange/calendar/events - Request received`);
  console.log(`[Exchange Controller] Query params:`, req.query);
  console.log(`[Exchange Controller] Headers:`, req.headers.authorization ? 'Authorization: present' : 'Authorization: missing');
  
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      console.error('[Exchange Controller] ❌ Unauthorized - no token or userId');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log(`[Exchange Controller] ✅ Token validated, userId: ${token.userId}`);

    // Проверяем конфигурацию Exchange
    if (!exchangeService.isConfigured()) {
      console.error('[Exchange Controller] ❌ Exchange not configured');
      res.status(503).json({ 
        error: 'Exchange integration is not configured',
        message: 'Please configure Exchange integration in server settings'
      });
      return;
    }

    // Получаем email пользователя (из БД или LDAP)
    const userEmail = await exchangeService.getUserEmail(token.userId);
    if (!userEmail) {
      console.error(`[Exchange Controller] ❌ User email not found for userId: ${token.userId}`);
      res.status(400).json({ 
        error: 'User email not found',
        message: 'Please ensure your email is configured in LDAP or database.'
      });
      return;
    }

    console.log(`[Exchange Controller] ✅ User email found: ${userEmail}`);

    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const startDateTime = startDate ? new Date(startDate) : undefined;
    const endDateTime = endDate ? new Date(endDate) : undefined;

    console.log(`[Exchange Controller] 📅 Getting calendar events for ${userEmail}, start: ${startDateTime}, end: ${endDateTime}`);
    
    try {
      const events = await exchangeService.getCalendarEvents(
        userEmail,
        startDateTime,
        endDateTime,
        token.userId,
        req
      );

      console.log(`[Exchange Controller] ✅ Returning ${events.length} calendar events`);
      res.json({ events });
    } catch (exchangeError: any) {
      console.error('[Exchange Controller] ❌ Exchange service error:', exchangeError);
      console.error('[Exchange Controller] Error stack:', exchangeError.stack);
      res.status(500).json({ 
        error: 'Failed to get calendar events from Exchange',
        message: exchangeError.message || 'Unknown error occurred while fetching calendar events'
      });
    }
  } catch (error: any) {
    console.error('[Exchange Controller] ❌ Error getting calendar events:', error);
    console.error('[Exchange Controller] Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to get calendar events', message: error.message });
  }
};
