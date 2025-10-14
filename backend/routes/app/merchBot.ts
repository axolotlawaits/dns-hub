import express from 'express';
import { prisma } from '../../server.js';

const router = express.Router();

// Маршрут для проверки статуса Merch бота
router.get('/bot-status', async (req: any, res: any) => {
  try {
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    const status = merchBotService.status;
    
    res.json({
      bot_status: status,
      environment: {
        hasToken: !!process.env.MERCH_BOT_TOKEN,
        hasBotName: !!process.env.MERCH_BOT_NAME,
        tokenPreview: process.env.MERCH_BOT_TOKEN ? 
          `${process.env.MERCH_BOT_TOKEN.substring(0, 10)}...` : 'Not set',
        botName: process.env.MERCH_BOT_NAME || 'Not set'
      }
    });
  } catch (error) {
    console.error('MerchBot status check error:', error);
    res.status(500).json({ error: 'Failed to check MerchBot status' });
  }
});

// Маршрут для запуска Merch бота
router.post('/bot-start', async (req: any, res: any) => {
  try {
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    const success = await merchBotService.launch();
    
    if (success) {
      res.json({ success: true, message: 'MerchBot started successfully' });
    } else {
      res.status(500).json({ success: false, message: 'MerchBot start failed' });
    }
  } catch (error) {
    console.error('MerchBot start error:', error);
    res.status(500).json({ error: 'Failed to start MerchBot' });
  }
});

// Маршрут для остановки Merch бота
router.post('/bot-stop', async (req: any, res: any) => {
  try {
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    await merchBotService.stop();
    
    res.json({ success: true, message: 'MerchBot stopped successfully' });
  } catch (error) {
    console.error('MerchBot stop error:', error);
    res.status(500).json({ error: 'Failed to stop MerchBot' });
  }
});

// Маршрут для перезапуска Merch бота
router.post('/bot-restart', async (req: any, res: any) => {
  try {
    const { merchBotService } = await import('../../controllers/app/merchBot.js');
    
    const success = await merchBotService.restart();
    
    if (success) {
      res.json({ success: true, message: 'MerchBot restarted successfully' });
    } else {
      res.status(500).json({ success: false, message: 'MerchBot restart failed' });
    }
  } catch (error) {
    console.error('MerchBot restart error:', error);
    res.status(500).json({ error: 'Failed to restart MerchBot' });
  }
});

// Маршрут для получения статистики Merch бота
router.get('/stats', async (req: any, res: any) => {
  try {
    // Здесь можно добавить логику получения статистики
    // Пока возвращаем базовую информацию
    const stats = {
      total_users: 0,
      active_users_today: 0,
      most_popular_buttons: [],
      most_popular_searches: [],
      feedback_requests: 0,
      daily_stats: {}
    };
    
    res.json(stats);
  } catch (error) {
    console.error('MerchBot stats error:', error);
    res.status(500).json({ error: 'Failed to get MerchBot stats' });
  }
});

// Маршрут для получения иерархии кнопок
router.get('/hierarchy', async (req: any, res: any) => {
  try {
    const categories = await prisma.merch.findMany({
      where: { isActive: true },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' }
      ],
      include: {
        attachments: {
          where: { type: 'image' },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });
    
    const hierarchy: Record<string, Array<{id: string, name: string, text: string, hasChildren: boolean}>> = {};
    
    for (const category of categories) {
      const parentId = category.parentId || '0';
      if (!hierarchy[parentId]) {
        hierarchy[parentId] = [];
      }
      
      // Проверяем, есть ли дочерние элементы
      const hasChildren = categories.some(cat => cat.parentId === category.id);
      
      hierarchy[parentId].push({
        id: category.id,
        name: category.name,
        text: category.description || '',
        hasChildren
      });
    }
    
    res.json(hierarchy);
  } catch (error) {
    console.error('MerchBot hierarchy error:', error);
    res.status(500).json({ error: 'Failed to get hierarchy' });
  }
});

// Маршрут для поиска элементов
router.get('/search', async (req: any, res: any) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const items = await prisma.merch.findMany({
      where: {
        isActive: true,
        name: {
          contains: q,
          mode: 'insensitive'
        }
      },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' }
      ],
      include: {
        attachments: {
          where: { type: 'image' },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });
    
    const results = items.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description || '',
      imageUrl: item.imageUrl,
      attachments: item.attachments.map(att => att.source),
      hasChildren: false // Можно добавить проверку
    }));
    
    res.json(results);
  } catch (error) {
    console.error('MerchBot search error:', error);
    res.status(500).json({ error: 'Failed to search items' });
  }
});

// Маршрут для получения детальной информации об элементе
router.get('/item/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    
    const item = await prisma.merch.findUnique({
      where: { id },
      include: {
        attachments: {
          where: { type: 'image' },
          orderBy: { sortOrder: 'asc' }
        },
        children: {
          where: { isActive: true },
          orderBy: [
            { sortOrder: 'asc' },
            { name: 'asc' }
          ]
        }
      }
    });
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const result = {
      id: item.id,
      name: item.name,
      description: item.description || '',
      imageUrl: item.imageUrl,
      attachments: item.attachments.map(att => att.source),
      children: item.children.map(child => ({
        id: child.id,
        name: child.name,
        description: child.description || ''
      }))
    };
    
    res.json(result);
  } catch (error) {
    console.error('MerchBot item error:', error);
    res.status(500).json({ error: 'Failed to get item' });
  }
});

export default router;
