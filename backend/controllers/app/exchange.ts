// Контроллер для работы с Exchange
import { Request, Response } from 'express';
import { z } from 'zod';
import { exchangeService, ExchangeCalendarEvent } from '../../services/exchange.js';
import { prisma } from '../../server.js';
import { authenticateToken } from '../../middleware/auth.js';
import { SocketIOService } from '../../socketio.js';

// Схемы валидации
const createEventSchema = z.object({
  subject: z.string().min(1),
  body: z.string().optional(),
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
  timeZone: z.string().default('UTC'),
  location: z.string().optional(),
  attendees: z.array(z.string().email()).optional(),
  isAllDay: z.boolean().optional().default(false),
  reminderMinutesBeforeStart: z.number().optional().default(15)
});

const updateEventSchema = createEventSchema.partial();

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

/**
 * POST /api/exchange/calendar/events
 * Создать событие в календаре
 */
export const createCalendarEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Получаем email пользователя (из БД или LDAP)
    const userEmail = await exchangeService.getUserEmail(token.userId);
    if (!userEmail) {
      res.status(400).json({ error: 'User email not found. Please ensure your email is configured in LDAP or database.' });
      return;
    }

    const data = createEventSchema.parse(req.body);

    const event: ExchangeCalendarEvent = {
      subject: data.subject,
      body: data.body ? {
        contentType: 'html',
        content: data.body
      } : undefined,
      start: {
        dateTime: data.startDateTime,
        timeZone: data.timeZone
      },
      end: {
        dateTime: data.endDateTime,
        timeZone: data.timeZone
      },
      location: data.location ? {
        displayName: data.location
      } : undefined,
      attendees: data.attendees?.map(email => ({
        emailAddress: {
          address: email
        },
        type: 'required' as const
      })),
      isAllDay: data.isAllDay,
      reminderMinutesBeforeStart: data.reminderMinutesBeforeStart
    };

    const createdEvent = await exchangeService.createCalendarEvent(userEmail, event);

    if (createdEvent) {
      // Отправляем уведомление о создании события
      const socketService = SocketIOService.getInstance();
      socketService.sendToUser(token.userId, {
        type: 'SUCCESS',
        title: 'Событие создано',
        message: `Событие "${createdEvent.subject}" создано в календаре\nВремя: ${new Date(createdEvent.start.dateTime).toLocaleString('ru-RU')}`,
        action: {
          type: 'navigate',
          path: '/exchange',
          tab: 'calendar'
        }
      });

      res.status(201).json({ event: createdEvent });
    } else {
      res.status(500).json({ error: 'Failed to create calendar event' });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.issues });
      return;
    }
    console.error('[Exchange Controller] Error creating calendar event:', error);
    res.status(500).json({ error: 'Failed to create calendar event', message: error.message });
  }
};

/**
 * PATCH /api/exchange/calendar/events/:eventId
 * Обновить событие в календаре
 */
export const updateCalendarEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Получаем email пользователя (из БД или LDAP)
    const userEmail = await exchangeService.getUserEmail(token.userId);
    if (!userEmail) {
      res.status(400).json({ error: 'User email not found. Please ensure your email is configured in LDAP or database.' });
      return;
    }

    const eventId = req.params.eventId;
    const data = updateEventSchema.parse(req.body);

    const updateData: Partial<ExchangeCalendarEvent> = {};

    if (data.subject) updateData.subject = data.subject;
    if (data.body) {
      updateData.body = {
        contentType: 'html',
        content: data.body
      };
    }
    if (data.startDateTime) {
      updateData.start = {
        dateTime: data.startDateTime,
        timeZone: data.timeZone || 'UTC'
      };
    }
    if (data.endDateTime) {
      updateData.end = {
        dateTime: data.endDateTime,
        timeZone: data.timeZone || 'UTC'
      };
    }
    if (data.location !== undefined) {
      updateData.location = data.location ? {
        displayName: data.location
      } : undefined;
    }
    if (data.attendees) {
      updateData.attendees = data.attendees.map(email => ({
        emailAddress: {
          address: email
        },
        type: 'required' as const
      }));
    }
    if (data.isAllDay !== undefined) updateData.isAllDay = data.isAllDay;
    if (data.reminderMinutesBeforeStart !== undefined) {
      updateData.reminderMinutesBeforeStart = data.reminderMinutesBeforeStart;
    }

    const updatedEvent = await exchangeService.updateCalendarEvent(userEmail, eventId, updateData);

    if (updatedEvent) {
      // Отправляем уведомление об изменении события
      const socketService = SocketIOService.getInstance();
      socketService.sendToUser(token.userId, {
        type: 'INFO',
        title: 'Событие изменено',
        message: `Событие "${updatedEvent.subject}" было изменено\nВремя: ${new Date(updatedEvent.start.dateTime).toLocaleString('ru-RU')}`,
        action: {
          type: 'navigate',
          path: '/exchange',
          tab: 'calendar'
        }
      });

      res.json({ event: updatedEvent });
    } else {
      res.status(500).json({ error: 'Failed to update calendar event' });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.issues });
      return;
    }
    console.error('[Exchange Controller] Error updating calendar event:', error);
    res.status(500).json({ error: 'Failed to update calendar event', message: error.message });
  }
};

/**
 * DELETE /api/exchange/calendar/events/:eventId
 * Удалить событие из календаря
 */
export const deleteCalendarEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Получаем email пользователя (из БД или LDAP)
    const userEmail = await exchangeService.getUserEmail(token.userId);
    if (!userEmail) {
      res.status(400).json({ error: 'User email not found. Please ensure your email is configured in LDAP or database.' });
      return;
    }

    const eventId = req.params.eventId;
    const success = await exchangeService.deleteCalendarEvent(userEmail, eventId);

    if (success) {
      // Отправляем уведомление об удалении события
      const socketService = SocketIOService.getInstance();
      socketService.sendToUser(token.userId, {
        type: 'WARNING',
        title: 'Событие удалено',
        message: 'Событие было удалено из календаря',
        action: {
          type: 'navigate',
          path: '/exchange',
          tab: 'calendar'
        }
      });

      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to delete calendar event' });
    }
  } catch (error: any) {
    console.error('[Exchange Controller] Error deleting calendar event:', error);
    res.status(500).json({ error: 'Failed to delete calendar event', message: error.message });
  }
};

// УДАЛЕНО: getContacts, getTasks, getUserExchangeInfo - не используются
// Оставлен только календарь и проверка новых писем

/**
 * GET /api/exchange/status
 * Проверить статус интеграции Exchange
 */
export const getExchangeStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const isConfigured = exchangeService.isConfigured();
    res.json({
      configured: isConfigured,
      message: isConfigured
        ? 'Exchange integration is configured'
        : 'Exchange integration is not configured. Please set EXCHANGE_TENANT_ID, EXCHANGE_CLIENT_ID, and EXCHANGE_CLIENT_SECRET environment variables.'
    });
  } catch (error: any) {
    console.error('[Exchange Controller] Error getting status:', error);
    res.status(500).json({ error: 'Failed to get status', message: error.message });
  }
};

/**
 * GET /api/exchange/rooms
 * Получить список помещений (комнат) из Exchange
 */
export const getRooms = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Проверяем конфигурацию Exchange
    if (!exchangeService.isConfigured()) {
      res.status(503).json({ 
        error: 'Exchange integration is not configured',
        message: 'Please configure Exchange integration in server settings'
      });
      return;
    }

    // Получаем email пользователя
    const userEmail = await exchangeService.getUserEmail(token.userId);
    if (!userEmail) {
      res.status(400).json({ 
        error: 'User email not found',
        message: 'Please ensure your email is configured in LDAP or database.'
      });
      return;
    }

    // Получаем список помещений через EWS
    // В Exchange помещения обычно находятся в адресной книге как ресурсы
    // Используем GetRoomLists и GetRooms для получения списка помещений
    const rooms = await exchangeService.getRooms(userEmail, token.userId, req);

    res.json({ rooms });
  } catch (error: any) {
    console.error('[Exchange Controller] Error getting rooms:', error);
    res.status(500).json({ 
      error: 'Failed to get rooms from Exchange',
      message: error.message || 'Unknown error occurred while fetching rooms'
    });
  }
};

