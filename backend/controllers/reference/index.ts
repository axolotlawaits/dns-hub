import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';

/**
 * Конфигурация для универсального контроллера справочников
 */
export interface ReferenceConfig {
  modelName: string; // Название модели в Prisma (например, 'branch', 'type', 'position')
  primaryKey?: string; // Поле первичного ключа (по умолчанию 'id')
  searchFields?: string[]; // Поля для поиска (по умолчанию ['name'])
  defaultInclude?: any; // Включаемые связи по умолчанию
  defaultOrderBy?: any; // Сортировка по умолчанию
  filters?: Record<string, any>; // Дополнительные фильтры
}

/**
 * Универсальный контроллер для справочников
 */
export class UniversalReferenceController {
  private config: ReferenceConfig;
  private _prismaModel: any;

  constructor(config: ReferenceConfig) {
    this.config = {
      primaryKey: 'id',
      searchFields: ['name'],
      defaultOrderBy: { name: 'asc' },
      ...config
    };
  }

  // Ленивая инициализация модели Prisma
  private get prismaModel() {
    if (!this._prismaModel) {
      this._prismaModel = (prisma as any)[this.config.modelName];
      if (!this._prismaModel) {
        throw new Error(`Model ${this.config.modelName} not found in Prisma`);
      }
    }
    return this._prismaModel;
  }

  /**
   * Получить список всех записей
   */
  getList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page = 1, limit = 50, search, ...filters } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      // Строим условия поиска
      const where: any = { ...this.config.filters };

      // Добавляем поиск по тексту
      if (search && this.config.searchFields) {
        where.OR = this.config.searchFields.map(field => ({
          [field]: { contains: search as string, mode: 'insensitive' }
        }));
      }

      // Добавляем дополнительные фильтры из query параметров
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== '') {
          where[key] = filters[key];
        }
      });

      const [items, total] = await Promise.all([
        this.prismaModel.findMany({
          where,
          include: this.config.defaultInclude,
          orderBy: this.config.defaultOrderBy,
          skip,
          take: Number(limit)
        }),
        this.prismaModel.count({ where })
      ]);

      res.status(200).json({
        data: items,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получить запись по ID
   */
  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id;
      const where: any = { [this.config.primaryKey!]: id };

      const item = await this.prismaModel.findUnique({
        where,
        include: this.config.defaultInclude
      });

      if (!item) {
        return res.status(404).json({ error: 'Запись не найдена' });
      }

      res.status(200).json(item);
    } catch (error) {
      next(error);
    }
  };

  // Функционал создания, обновления и удаления убран - только чтение справочников

  /**
   * Поиск записей
   */
  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q: query, limit = 10, ...filters } = req.query;

      if (!query) {
        return res.status(400).json({ error: 'Параметр поиска обязателен' });
      }

      const where: any = { ...this.config.filters };

      // Добавляем поиск по тексту
      if (this.config.searchFields) {
        where.OR = this.config.searchFields.map(field => ({
          [field]: { contains: query as string, mode: 'insensitive' }
        }));
      }

      // Добавляем дополнительные фильтры
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== '') {
          where[key] = filters[key];
        }
      });

      const items = await this.prismaModel.findMany({
        where,
        include: this.config.defaultInclude,
        orderBy: this.config.defaultOrderBy,
        take: Number(limit)
      });

      res.status(200).json(items);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Получить уникальные значения поля (для фильтров)
   */
  getDistinctValues = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { field } = req.params;
      
      const values = await this.prismaModel.findMany({
        select: { [field]: true },
        distinct: [field],
        orderBy: { [field]: 'asc' }
      });

      const result = values.map(item => item[field]).filter(value => value !== null && value !== undefined);
      
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Фабрика для создания контроллеров справочников
 */
export const createReferenceController = (config: ReferenceConfig) => {
  return new UniversalReferenceController(config);
};

/**
 * Предустановленные конфигурации для популярных справочников
 */
export const referenceConfigs = {
  branch: {
    modelName: 'branch',
    primaryKey: 'uuid',
    searchFields: ['name', 'city', 'code'],
    defaultInclude: {
      userData: { include: { position: true } },
      images: true
    },
    defaultOrderBy: { name: 'asc' },
    filters: { status: { in: [0, 1] } }
  },

  type: {
    modelName: 'type',
    searchFields: ['name', 'chapter'],
    defaultOrderBy: { name: 'asc' }
  },

  position: {
    modelName: 'position',
    searchFields: ['name'],
    defaultInclude: { positionToolAccesses: true },
    defaultOrderBy: { name: 'asc' }
  },

  group: {
    modelName: 'group',
    searchFields: ['name'],
    defaultInclude: { groupToolAccesses: true },
    defaultOrderBy: { name: 'asc' }
  },

  user: {
    modelName: 'user',
    searchFields: ['name', 'email'],
    defaultInclude: { userToolAccesses: true },
    defaultOrderBy: { name: 'asc' }
  },

  userData: {
    modelName: 'userData',
    primaryKey: 'uuid',
    searchFields: ['fio', 'email'],
    defaultInclude: { 
      branch: true, 
      position: true 
    },
    defaultOrderBy: { fio: 'asc' }
  }
};
