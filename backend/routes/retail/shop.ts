import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getBranches,
  initCategories,
  getAds,
  getAdById,
  createAd,
  updateAd,
  deleteAd,
  createReserve,
  confirmReserve,
} from '../../controllers/retail/shop.js';
import { prisma } from '../../server.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// Настройка multer для загрузки изображений
const uploadDir = path.join(__dirname, '..', '..', 'public', 'retail', 'shop');
const itemsUploadDir = path.join(__dirname, '..', '..', 'public', 'retail', 'shop', 'items');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(itemsUploadDir)) {
  fs.mkdirSync(itemsUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `ad-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Multer для фотографий товаров
const itemsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, itemsUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `item-${uniqueSuffix}${ext}`);
  },
});

const itemsUpload = multer({
  storage: itemsStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Публичные роуты (чтение)
router.get('/categories', getCategories);
router.get('/branches', getBranches);
router.get('/shops', getAds);
router.get('/', getAds); // Дублируем для упрощения пути
router.get('/shops/:id', getAdById);
router.get('/:id', getAdById); // Дублируем для упрощения пути

// Защищенные роуты
router.use(authenticateToken);

// Категории (только для админов)
router.post('/categories', createCategory);
router.post('/categories/init', initCategories); // Инициализация стандартных категорий
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Объявления
router.post('/shops', createAd);
router.post('/', createAd); // Дублируем для упрощения пути
router.put('/shops/:id', updateAd);
router.put('/:id', updateAd); // Дублируем для упрощения пути
router.delete('/shops/:id', deleteAd);
router.delete('/:id', deleteAd); // Дублируем для упрощения пути

// Избранное удалено

// Загрузка изображений
// Дублируем роут для упрощения пути
router.post('/:id/images', upload.array('images', 10), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const token = req.token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Проверяем права
    const ad = await prisma.shop.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true },
    });

    if (ad.userId !== token.userId && user?.role !== 'ADMIN' && user?.role !== 'DEVELOPER') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Получаем текущие изображения для определения sortOrder
    const existingImages = await (prisma as any).shopAttachment.findMany({
      where: { shopId: id },
      orderBy: { sortOrder: 'desc' },
      take: 1,
    });

    let nextSortOrder = existingImages.length > 0 ? existingImages[0].sortOrder + 1 : 0;
    const isFirstImage = existingImages.length === 0;

    const images = await Promise.all(
      files.map(async (file, index) => {
        return await (prisma as any).shopAttachment.create({
          data: {
            shopId: id,
            source: `retail/shop/${file.filename}`,
            sortOrder: nextSortOrder + index,
            isMain: isFirstImage && index === 0,
          },
        });
      })
    );

    res.json(images);
  } catch (error) {
    console.error('[Ads] Error uploading images:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

// Удалить изображение
router.delete('/shops/:id/images/:imageId', async (req: any, res: any) => {
  try {
    const { id, imageId } = req.params;
    const token = req.token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const ad = await prisma.shop.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true },
    });

    if (ad.userId !== token.userId && user?.role !== 'ADMIN' && user?.role !== 'DEVELOPER') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const image = await (prisma as any).shopAttachment.findUnique({
      where: { id: imageId },
    });

    if (!image || image.shopId !== id) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Удаляем файл
    const filePath = path.join(process.cwd(), 'backend', 'public', image.source);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await (prisma as any).shopAttachment.delete({
      where: { id: imageId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Ads] Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Резервирование
router.post('/shops/:id/reserve', createReserve);
router.post('/:id/reserve', createReserve); // Дублируем для упрощения пути
router.post('/reserves/:reserveId/confirm', confirmReserve);

// Дублируем роут для упрощения пути
router.delete('/:id/images/:imageId', async (req: any, res: any) => {
  try {
    const { id, imageId } = req.params;
    const token = req.token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const ad = await prisma.shop.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true },
    });

    if (ad.userId !== token.userId && user?.role !== 'ADMIN' && user?.role !== 'DEVELOPER') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const image = await (prisma as any).shopAttachment.findUnique({
      where: { id: imageId },
    });

    if (!image || image.shopId !== id) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Удаляем файл
    const filePath = path.join(process.cwd(), 'backend', 'public', image.source);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await (prisma as any).shopAttachment.delete({
      where: { id: imageId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Ads] Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Обновить порядок изображений
router.put('/shops/:id/images/order', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { imageIds } = req.body; // Массив ID в нужном порядке
    const token = req.token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const ad = await prisma.shop.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true },
    });

    if (ad.userId !== token.userId && user?.role !== 'ADMIN' && user?.role !== 'DEVELOPER') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!Array.isArray(imageIds)) {
      return res.status(400).json({ error: 'imageIds must be an array' });
    }

    // Обновляем порядок
    await Promise.all(
      imageIds.map((imageId: string, index: number) =>
        (prisma as any).shopAttachment.update({
          where: { id: imageId },
          data: {
            sortOrder: index,
            isMain: index === 0,
          },
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[Ads] Error updating image order:', error);
    res.status(500).json({ error: 'Failed to update image order' });
  }
});

// ==================== AdRequest Routes ====================
// Удалено: ShopRequest больше не используется, вместо этого используется универсальная система комментариев

// ==================== ShopItem Images Routes ====================
// Удалено - товар теперь = объявление, все фотографии в ShopAttachment

// Загрузить фотографии товара (удалено)
/* router.post('/shops/items/:itemId/images', itemsUpload.array('images', 10), async (req: any, res: any) => {
  try {
    const { itemId } = req.params;
    const token = req.token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Проверяем права - получаем товар и его объявление
    const item = await prisma.shopItem.findUnique({
      where: { id: itemId },
      include: {
        shop: {
          select: { userId: true },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true },
    });

    if (item.shop.userId !== token.userId && user?.role !== 'ADMIN' && user?.role !== 'DEVELOPER') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Получаем текущие изображения для определения sortOrder
    const existingImages = await prisma.shopItemImage.findMany({
      where: { itemId },
      orderBy: { sortOrder: 'desc' },
      take: 1,
    });

    let nextSortOrder = existingImages.length > 0 ? existingImages[0].sortOrder + 1 : 0;
    const isFirstImage = existingImages.length === 0;

    const images = await Promise.all(
      files.map(async (file, index) => {
        return await prisma.shopItemImage.create({
          data: {
            itemId,
            source: `retail/shop/items/${file.filename}`,
            sortOrder: nextSortOrder + index,
            isMain: isFirstImage && index === 0,
          },
        });
      })
    );

    res.json(images);
  } catch (error) {
    console.error('[Ads] Error uploading item images:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

// Удалить фотографию товара
router.delete('/shops/items/:itemId/images/:imageId', async (req: any, res: any) => {
  try {
    const { itemId, imageId } = req.params;
    const token = req.token;
    if (!token?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const item = await prisma.shopItem.findUnique({
      where: { id: itemId },
      include: {
        shop: {
          select: { userId: true },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true },
    });

    if (item.shop.userId !== token.userId && user?.role !== 'ADMIN' && user?.role !== 'DEVELOPER') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const image = await prisma.shopItemImage.findUnique({
      where: { id: imageId },
    });

    if (!image || image.itemId !== itemId) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Удаляем файл
    const filePath = path.join(process.cwd(), 'backend', 'public', image.source);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.shopItemImage.delete({
      where: { id: imageId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Ads] Error deleting item image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
}); */

export default router;

