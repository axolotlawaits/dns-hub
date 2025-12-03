// routes/app/navigation.ts
import express from 'express';
import { 
  getRootMenuItems, 
  getAllMenuItems,
  getNonRootMenuItems, 
  getAllNonRootMenuItems,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
} from '../../controllers/app/navigation.js';

const router = express.Router();

// Маршрут для получения корневых элементов меню
router.get('/', getRootMenuItems);

// Маршрут для получения всех пунктов меню (включая скрытые)
router.get('/all', getAllMenuItems);

// Маршрут для получения дочерних элементов меню по parent_id
router.get('/sub', getNonRootMenuItems);

router.get('/all-sub', getAllNonRootMenuItems);

// Маршрут для получения пункта меню по ID
router.get('/:id', getMenuItemById);

// Маршрут для создания пункта меню
router.post('/', createMenuItem);

// Маршрут для обновления пункта меню
router.patch('/:id', updateMenuItem);

// Маршрут для удаления пункта меню
router.delete('/:id', deleteMenuItem);

export default router;
