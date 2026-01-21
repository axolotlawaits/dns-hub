import { Router } from 'express';
import {
  getMerchHierarchy,
  createMerchCategory,
  updateMerchCategory,
  deleteMerchCategory,
  createMerchCard,
  updateMerchCard,
  deleteMerchCard,
  getAllMerchCards,
  getMerchCardById,
  addCardImages,
  addMerchAttachment,
  deleteMerchAttachment,
  updateAttachmentsOrder,
  updateCardsOrder,
  updateCategoriesOrder,
  updateCategoryParent,
  moveCardToCategory
} from '../../controllers/retail/merch.js';
import { authenticateToken } from '../../middleware/auth.js';
import { merchBotService } from '../../controllers/app/merchBot.js';
import { prisma, API } from '../../server.js';
import fs from 'fs';
import path from 'path';

const router = Router();

// Middleware для логирования всех запросов (для отладки)
router.use((req: any, res: any, next: any) => {
  if (req.path.includes('bot-') || req.path.includes('cache-refresh')) {
    console.log(`🔍 [Routes] Запрос к эндпоинту управления ботом: ${req.method} ${req.path}`);
  }
  next();
});

// GET запросы публичные (для чтения данных)
router.get('/categories', getMerchHierarchy as any);

// Роуты для управления Merch ботом (без аутентификации для удобства администрирования)
// Эти эндпоинты должны обрабатываться ПЕРВЫМИ, до применения authenticateToken
router.get('/bot-status', async (req: any, res: any) => {
  try {
    console.log('🔍 [Routes] Проверяем статус Merch бота через /add/merch/bot-status...');
    // merchBotService уже импортирован статически сверху
    const status = merchBotService.status;
    
    res.json({
      success: true,
      bot_status: status,
      environment: {
        hasToken: !!process.env.MERCH_BOT_TOKEN,
        hasBotName: !!process.env.MERCH_BOT_NAME,
        tokenPreview: process.env.MERCH_BOT_TOKEN ? 
          `${process.env.MERCH_BOT_TOKEN.substring(0, 10)}...` : 'Not set',
        botName: process.env.MERCH_BOT_NAME || 'Not set',
        enableBots: process.env.ENABLE_BOTS !== 'false'
      }
    });
  } catch (error) {
    console.error('MerchBot status check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check MerchBot status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Обработчик для запуска бота (поддерживает и GET, и POST для удобства)
const handleBotStart = async (req: any, res: any) => {
  try {
    console.log(`🚀 [Routes] ${req.method} /retail/merch/bot-start - Запрос получен`);
    console.log('🚀 [Routes] Method:', req.method);
    console.log('🚀 [Routes] Path:', req.path);
    console.log('🚀 [Routes] Original URL:', req.originalUrl);
    
    // merchBotService уже импортирован статически сверху
    // Получаем текущий статус перед запуском
    const statusBefore = merchBotService.status;
    console.log('📊 [Routes] Статус до запуска:', JSON.stringify(statusBefore, null, 2));
    
    // Проверяем наличие необходимых переменных окружения
    const hasToken = !!process.env.MERCH_BOT_TOKEN;
    const hasBotName = !!process.env.MERCH_BOT_NAME;
    const enableBots = process.env.ENABLE_BOTS !== 'false';
    
    if (!enableBots) {
      return res.status(503).json({
        success: false,
        error: 'Bots are disabled',
        message: 'ENABLE_BOTS is set to false',
        environment: {
          enableBots: false,
          hasToken,
          hasBotName
        }
      });
    }
    
    if (!hasToken) {
      return res.status(500).json({
        success: false,
        error: 'MERCH_BOT_TOKEN not found',
        message: 'MERCH_BOT_TOKEN environment variable is not set',
        environment: {
          enableBots: true,
          hasToken: false,
          hasBotName
        }
      });
    }
    
    if (!hasBotName) {
      return res.status(500).json({
        success: false,
        error: 'MERCH_BOT_NAME not found',
        message: 'MERCH_BOT_NAME environment variable is not set',
        environment: {
          enableBots: true,
          hasToken: true,
          hasBotName: false
        }
      });
    }
    
    // Просто вызываем launch() (как в Telegram боте)
    // Метод launch() сам проверит, запущен ли бот, и попытается переинициализировать, если нужно
    console.log('🚀 [Routes] Вызываем merchBotService.launch()...');
    const success = await merchBotService.launch();
    
    console.log('📊 [Routes] Результат запуска:', success);
    const statusAfter = merchBotService.status;
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'MerchBot started successfully',
        status: statusAfter
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'MerchBot start failed',
        status: statusAfter,
        error: 'Check logs for details. Possible reasons: invalid token format, Telegram API error, or network issue',
        environment: {
          enableBots: true,
          hasToken: true,
          hasBotName: true,
          tokenPreview: process.env.MERCH_BOT_TOKEN ? 
            `${process.env.MERCH_BOT_TOKEN.substring(0, 10)}...` : 'Not set',
          botName: process.env.MERCH_BOT_NAME || 'Not set'
        }
      });
    }
  } catch (error) {
    console.error('MerchBot start error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to start MerchBot',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
    });
  }
};

// Поддерживаем и GET, и POST для удобства
router.get('/bot-start', handleBotStart);
router.post('/bot-start', handleBotStart);

router.post('/bot-stop', async (req: any, res: any) => {
  try {
    console.log('🛑 [Routes] Остановка Merch бота через /retail/merch/bot-stop...');
    // merchBotService уже импортирован статически сверху
    await merchBotService.stop();
    
    res.json({ success: true, message: 'MerchBot stopped successfully' });
  } catch (error) {
    console.error('MerchBot stop error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to stop MerchBot',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/bot-restart', async (req: any, res: any) => {
  try {
    console.log('🔄 [Routes] Перезапуск Merch бота через /retail/merch/bot-restart...');
    // merchBotService уже импортирован статически сверху
    const success = await merchBotService.restart();
    
    if (success) {
      const status = merchBotService.status;
      res.json({ 
        success: true, 
        message: 'MerchBot restarted successfully',
        status
      });
    } else {
      const status = merchBotService.status;
      res.status(500).json({ 
        success: false, 
        message: 'MerchBot restart failed',
        status,
        error: 'Check logs for details'
      });
    }
  } catch (error) {
    console.error('MerchBot restart error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to restart MerchBot',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
    });
  }
});

// Все остальные операции требуют аутентификации
// Применяем authenticateToken только к конкретным роутам, НЕ к эндпоинтам управления ботом

// Роуты для категорий (layer = 1) - требуют аутентификации
router.post('/categories', authenticateToken, ...(createMerchCategory as any));
router.put('/categories/:id', authenticateToken, ...(updateMerchCategory as any));
router.get('/categories/:id/children', authenticateToken, async (req: any, res: any, next: any) => {
  try {
    const { id } = req.params;
    
    // Получаем все дочерние элементы (категории и карточки) рекурсивно
    const getChildrenRecursively = async (parentId: string, depth: number = 0): Promise<any[]> => {
      const children = await prisma.merch.findMany({
        where: { parentId },
        include: {
          attachments: {
            select: {
              id: true,
              source: true,
              type: true
            }
          },
          children: {
            select: { id: true }
          }
        },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' }
        ]
      });

      const result: any[] = [];
      
      for (const child of children) {
        const childData: any = {
          id: child.id,
          name: child.name,
          layer: child.layer,
          attachmentsCount: child.attachments?.length || 0,
          hasChildren: child.children && child.children.length > 0,
          depth: depth
        };

        // Рекурсивно получаем детей для категорий
        if (child.layer === 1 && child.children && child.children.length > 0) {
          childData.children = await getChildrenRecursively(child.id, depth + 1);
        }

        result.push(childData);
      }

      return result;
    };

    const children = await getChildrenRecursively(id);
    
    return res.json({
      categoryId: id,
      children: children,
      totalCount: children.length
    });
  } catch (error) {
    console.error('❌ Ошибка при получении дочерних элементов:', error);
    next(error);
  }
});
router.delete('/categories/:id', authenticateToken, deleteMerchCategory as any);

// Роуты для карточек (layer = 0) - требуют аутентификации
router.get('/cards', authenticateToken, getAllMerchCards as any);
router.get('/cards/:id', authenticateToken, getMerchCardById as any);
router.post('/cards', authenticateToken, ...(createMerchCard as any));
router.put('/cards/:id', authenticateToken, ...(updateMerchCard as any));
router.delete('/cards/:id', authenticateToken, deleteMerchCard as any);
router.post('/cards/:id/images', authenticateToken, ...(addCardImages as any));
router.delete('/cards/:id/images', authenticateToken, async (req: any, res: any, next: any) => {
  try {
    const { id } = req.params;
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl обязателен' });
    }

    // Извлекаем имя файла из URL (может быть полный URL или относительный путь)
    let fileName = imageUrl;
    
    console.log(`🔍 [DELETE /cards/:id/images] Получен imageUrl: ${imageUrl}`);
    
    // Если это полный URL (начинается с http:// или https://)
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      // Извлекаем путь после последнего слэша
      const urlPath = new URL(imageUrl).pathname;
      fileName = urlPath.split('/').pop() || imageUrl;
    } else if (imageUrl.includes('/')) {
      // Если это относительный путь, извлекаем имя файла
      fileName = imageUrl.split('/').pop() || imageUrl;
    }
    
    // Убираем query параметры если есть
    fileName = fileName.split('?')[0];
    
    // Убираем путь если есть (например, "retail/merch/filename.jpg" -> "filename.jpg")
    if (fileName.includes('/')) {
      fileName = fileName.split('/').pop() || fileName;
    }
    
    // Декодируем URL-кодированные символы (например, %20 -> пробел)
    try {
      fileName = decodeURIComponent(fileName);
    } catch (e) {
      // Если декодирование не удалось, используем как есть
    }
    
    if (!fileName) {
      return res.status(400).json({ error: 'Неверный формат imageUrl' });
    }
    
    console.log(`🔍 [DELETE /cards/:id/images] Извлеченное имя файла: ${fileName}`);

    console.log(`🔍 [DELETE /cards/:id/images] Ищем attachment для карточки ${id}, fileName: ${fileName}`);

    // Получаем все attachments карточки для поиска (изображения и PDF)
    const allAttachments = await prisma.merchAttachment.findMany({
      where: { 
        recordId: id,
        type: { in: ['image', 'pdf'] }
      }
    });
    
    console.log(`📋 [DELETE /cards/:id/images] Все attachments карточки ${id}:`, allAttachments.map(a => ({ id: a.id, source: a.source })));
    console.log(`🔍 [DELETE /cards/:id/images] Ищем fileName: ${fileName}`);

    // Ищем attachment по точному совпадению или по части имени файла
    let attachment = allAttachments.find(att => att.source === fileName);
    
    if (!attachment) {
      // Пробуем найти по части имени (на случай если в source есть путь)
      attachment = allAttachments.find(att => att.source.includes(fileName) || fileName.includes(att.source));
    }
    
    if (!attachment) {
      console.log(`❌ [DELETE /cards/:id/images] Attachment не найден для fileName: ${fileName}`);
      return res.status(404).json({ 
        error: 'Файл не найден',
        debug: {
          searchedFileName: fileName,
          availableAttachments: allAttachments.map(a => ({ source: a.source, type: a.type }))
        }
      });
    }

    console.log(`✅ [DELETE /cards/:id/images] Найден attachment: ${attachment.id}, source: ${attachment.source}`);

    // Удаляем файл
    const filePath = path.join(process.cwd(), 'public', 'retail', 'merch', attachment.source);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ [DELETE /cards/:id/images] Файл удален: ${filePath}`);
    } else {
      console.log(`⚠️ [DELETE /cards/:id/images] Файл не найден на диске: ${filePath}, но продолжаем удаление из БД`);
    }

    // Удаляем attachment из базы данных
    await prisma.merchAttachment.delete({
      where: { id: attachment.id }
    });
    
    console.log(`✅ [DELETE /cards/:id/images] Attachment удален из БД: ${attachment.id}`);

    // Возвращаем обновленную карточку
    const updatedCard = await prisma.merch.findUnique({
      where: { id },
      include: {
        attachments: {
          where: { type: { in: ['image', 'pdf'] } },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            source: true,
            type: true
          }
        }
      }
    });

    if (!updatedCard) {
      return res.status(404).json({ error: 'Карточка не найдена' });
    }

    const imageUrls = updatedCard.attachments.map(att => `${API}/public/retail/merch/${att.source}`);

    return res.json({
      id: updatedCard.id,
      name: updatedCard.name,
      description: updatedCard.description,
      imageUrls: imageUrls,
      attachments: updatedCard.attachments,
      isActive: updatedCard.isActive,
      categoryId: updatedCard.parentId || '',
      category: {
        id: updatedCard.parentId || '',
        name: 'Категория'
      },
      createdAt: updatedCard.createdAt,
      updatedAt: updatedCard.updatedAt
    });
  } catch (error) {
    console.error('❌ Ошибка при удалении изображения карточки:', error);
    next(error);
  }
});

// Роуты для attachments - требуют аутентификации
router.post('/attachments/:recordId', authenticateToken, ...(addMerchAttachment as any));
router.delete('/attachments/:id', authenticateToken, deleteMerchAttachment as any);
router.patch('/attachments/:recordId/order', authenticateToken, updateAttachmentsOrder as any);

// Роуты для обновления порядка
router.patch('/cards/:categoryId/order', authenticateToken, updateCardsOrder as any);
router.patch('/categories/order', authenticateToken, async (req: any, res: any, next: any) => {
  // Для корневых категорий (parentId = null)
  req.params.parentId = null;
  await updateCategoriesOrder(req, res, next);
});
router.patch('/categories/:parentId/order', authenticateToken, updateCategoriesOrder as any);
router.patch('/categories/:categoryId/parent', authenticateToken, updateCategoryParent as any);
router.patch('/cards/:cardId/move', authenticateToken, moveCardToCategory as any);

// Роут для удаления изображения категории (для обратной совместимости)
router.delete('/categories/:id/image', authenticateToken, async (req: any, res: any, next: any) => {
  try {
    const { id } = req.params;
    
    // Находим все image attachments для этой категории
    const attachments = await prisma.merchAttachment.findMany({
      where: {
        recordId: id,
        type: 'image'
      },
      include: {
        merch: {
          select: {
            id: true,
            layer: true
          }
        }
      }
    });

    if (attachments.length === 0) {
      return res.status(404).json({ error: 'Изображения не найдены' });
    }

    // Удаляем все image attachments
    for (const attachment of attachments) {
      const filePath = path.join(process.cwd(), 'public', 'retail', 'merch', attachment.source);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      await prisma.merchAttachment.delete({
        where: { id: attachment.id }
      });
    }

    // Возвращаем обновленную категорию
    const updatedCategory = await prisma.merch.findUnique({
      where: { id },
      include: {
        children: {
          select: { id: true }
        },
        attachments: {
          select: {
            id: true,
            source: true,
            type: true
          },
          orderBy: {
            sortOrder: 'asc'
          }
        }
      }
    });

    if (!updatedCategory) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    const imageAttachment = updatedCategory.attachments.find(att => att.type === 'image');
    const imageUrl = imageAttachment ? `${API}/public/retail/merch/${imageAttachment.source}` : null;

    return res.json({
      id: updatedCategory.id,
      name: updatedCategory.name,
      description: updatedCategory.description,
      child: updatedCategory.children.map(child => child.id),
      layer: updatedCategory.layer,
      isActive: updatedCategory.isActive,
      attachmentsCount: updatedCategory.attachments.length,
      hasChildren: updatedCategory.children.length > 0,
      imageUrl: imageUrl
    });
  } catch (error) {
    console.error('❌ Ошибка при удалении изображения категории:', error);
    next(error);
  }
});

export default router;
