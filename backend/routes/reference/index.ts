import express from 'express';
import { UniversalReferenceController, createReferenceController, referenceConfigs } from '../../controllers/universal/reference.js';

const router = express.Router();

/**
 * Создает маршруты для справочника на основе конфигурации
 */
export const createReferenceRoutes = (config: any) => {
  const controller = createReferenceController(config);
  
  return {
    // Только операции чтения
    'GET /': controller.getList,
    'GET /search': controller.search,
    'GET /:id': controller.getById,
    
    // Дополнительные операции
    'GET /distinct/:field': controller.getDistinctValues
  };
};

/**
 * Регистрирует маршруты для конкретного справочника
 */
export const registerReferenceRoutes = (router: express.Router, prefix: string, config: any) => {
  const routes = createReferenceRoutes(config);
  
  // Только маршруты чтения
  router.get(`${prefix}`, routes['GET /']);
  router.get(`${prefix}/search`, routes['GET /search']);
  router.get(`${prefix}/:id`, routes['GET /:id']);
  
  // Дополнительные маршруты
  router.get(`${prefix}/distinct/:field`, routes['GET /distinct/:field']);
};

/**
 * Предустановленные маршруты для популярных справочников
 */

// Маршруты для филиалов
registerReferenceRoutes(router, '/branches', referenceConfigs.branch);

// Маршруты для типов
registerReferenceRoutes(router, '/types', referenceConfigs.type);

// Маршруты для должностей
registerReferenceRoutes(router, '/positions', referenceConfigs.position);

// Маршруты для групп
registerReferenceRoutes(router, '/groups', referenceConfigs.group);

// Маршруты для пользователей
registerReferenceRoutes(router, '/users', referenceConfigs.user);

// Маршруты для данных пользователей
registerReferenceRoutes(router, '/user-data', referenceConfigs.userData);

// Функционал создания справочников на лету убран

export default router;
