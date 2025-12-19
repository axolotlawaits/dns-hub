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
  createAdRequest,
  getAdRequests,
  getUserAdRequests,
  approveAdRequest,
  rejectAdRequest,
  addShipmentDocNumber,
} from '../../controllers/retail/shop.js';
import { prisma } from '../../server.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Настройка multer для загрузки изображений
const uploadDir = path.join(process.cwd(), 'backend', 'public', 'retail', 'shop');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
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

// Публичные роуты (чтение)
router.get('/categories', getCategories);
router.get('/branches', getBranches);
router.get('/shops', getAds);
router.get('/shops/:id', getAdById);

// Защищенные роуты
router.use(authenticateToken);

// Категории (только для админов)
router.post('/categories', createCategory);
router.post('/categories/init', initCategories); // Инициализация стандартных категорий
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Объявления
router.post('/shops', createAd);
router.put('/shops/:id', updateAd);
router.delete('/shops/:id', deleteAd);

// Избранное удалено

// Загрузка изображений
router.post('/shops/:id/images', upload.array('images', 10), async (req: any, res: any) => {
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
    const existingImages = await prisma.shopImage.findMany({
      where: { shopId: id },
      orderBy: { sortOrder: 'desc' },
      take: 1,
    });

    let nextSortOrder = existingImages.length > 0 ? existingImages[0].sortOrder + 1 : 0;
    const isFirstImage = existingImages.length === 0;

    const images = await Promise.all(
      files.map(async (file, index) => {
        return await prisma.shopImage.create({
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

    const image = await prisma.shopImage.findUnique({
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

    await prisma.shopImage.delete({
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
        prisma.shopImage.update({
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

// Создать запрос в карточку
router.post('/shops/:id/request', authenticateToken, createAdRequest);

// Получить запросы для объявления (для создателя)
router.get('/shops/:id/requests', authenticateToken, getAdRequests);

// Получить запросы пользователя (для того, кто запрашивает)
router.get('/shops/requests/my', authenticateToken, getUserAdRequests);

// Подтвердить запрос
router.post('/shops/requests/:requestId/approve', authenticateToken, approveAdRequest);

// Отклонить запрос
router.post('/shops/requests/:requestId/reject', authenticateToken, rejectAdRequest);

// Добавить номер документа отгрузки
router.post('/shops/requests/:requestId/shipment-doc', authenticateToken, addShipmentDocNumber);

export default router;

