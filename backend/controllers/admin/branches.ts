import { Request, Response } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';

// Проверка роли DEVELOPER
const checkDeveloperRole = async (req: Request, res: Response): Promise<boolean> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return false;
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true }
    });

    if (!user || user.role !== 'DEVELOPER') {
      res.status(403).json({
        success: false,
        error: 'Доступ запрещен. Требуется роль DEVELOPER'
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error checking developer role:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
    return false;
  }
};

const createBranchSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

const updateBranchSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});

export const getBranches = async (req: Request, res: Response): Promise<any> => {
  if (!(await checkDeveloperRole(req, res))) return;

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Получаем общее количество филиалов
    const total = await prisma.branch.count();

    const branches = await prisma.branch.findMany({
      select: {
        uuid: true,
        name: true,
        address: true,
        city: true,
        code: true,
        division: true,
        status: true,
        type: true,
        last_update: true,
      },
      orderBy: {
        name: 'asc'
      },
      skip,
      take: limit,
    });

    const formattedBranches = branches.map(branch => ({
      id: branch.uuid,
      name: branch.name,
      address: `${branch.city}, ${branch.address}`,
      phone: null, // Нет в модели
      email: null, // Нет в модели
      isActive: branch.status === 1, // Предполагаем, что status 1 = активен
      createdAt: branch.last_update.toISOString(),
      updatedAt: branch.last_update.toISOString(),
      // Дополнительные поля
      code: branch.code,
      division: branch.division,
      city: branch.city,
      type: branch.type,
    }));

    return res.json({
      success: true,
      data: formattedBranches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    console.error('❌ [Branches] Error getting branches:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const getBranchById = async (req: Request, res: Response): Promise<any> => {
  if (!(await checkDeveloperRole(req, res))) return;

  try {
    const { id } = req.params;
    // TODO: Реализовать получение филиала по ID
    return res.status(404).json({
      success: false,
      error: 'Branch not found'
    });
  } catch (error) {
    console.error('❌ [Branches] Error getting branch by ID:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const createBranch = async (req: Request, res: Response): Promise<any> => {
  if (!(await checkDeveloperRole(req, res))) return;

  try {
    const validatedData = createBranchSchema.parse(req.body);
    // TODO: Реализовать создание филиала
    return res.status(501).json({
      success: false,
      error: 'Not implemented yet'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }
    console.error('❌ [Branches] Error creating branch:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const updateBranch = async (req: Request, res: Response): Promise<any> => {
  if (!(await checkDeveloperRole(req, res))) return;

  try {
    const { id } = req.params;
    const validatedData = updateBranchSchema.parse(req.body);
    // TODO: Реализовать обновление филиала
    return res.status(501).json({
      success: false,
      error: 'Not implemented yet'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }
    console.error('❌ [Branches] Error updating branch:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const deleteBranch = async (req: Request, res: Response): Promise<any> => {
  if (!(await checkDeveloperRole(req, res))) return;

  try {
    const { id } = req.params;
    // TODO: Реализовать удаление филиала
    return res.status(501).json({
      success: false,
      error: 'Not implemented yet'
    });
  } catch (error) {
    console.error('❌ [Branches] Error deleting branch:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

