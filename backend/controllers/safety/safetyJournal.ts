import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../server.js';
import fs from 'fs/promises';
import path from 'path';

// Схемы валидации
const SafetyJournalSchema = z.object({
  userAddId: z.string(),
  userUpdatedId: z.string().optional(),
  journalType: z.enum(['LABOR_SAFETY', 'FIRE_SAFETY', 'ELECTRICAL_SAFETY', 'INDUSTRIAL_SAFETY']),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().min(1),
  responsiblePerson: z.string().min(1),
  period: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED', 'SUSPENDED']).optional(),
  isCompleted: z.boolean().optional(),
  branchId: z.string().optional(),
});

const SafetyJournalEntrySchema = z.object({
  userAddId: z.string(),
  journalId: z.string(),
  entryDate: z.string().datetime(),
  entryType: z.enum(['INSPECTION', 'INSTRUCTION', 'VIOLATION', 'CORRECTIVE_ACTION', 'TRAINING', 'INCIDENT', 'MAINTENANCE']),
  title: z.string().min(1),
  description: z.string().min(1),
  participants: z.string().optional(),
  location: z.string().optional(),
  findings: z.string().optional(),
  actionsTaken: z.string().optional(),
  responsiblePerson: z.string().optional(),
  deadline: z.string().datetime().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE']).optional(),
});

// Получить список журналов
export const getSafetyJournalList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 10, journalType, status, branchId } = req.query;
    
    const where: any = {};
    if (journalType) where.journalType = journalType;
    if (status) where.status = status;
    if (branchId) where.branchId = branchId;

    const [journals, total] = await Promise.all([
      prisma.safetyJournal.findMany({
        where,
        include: {
          userAdd: {
            select: { id: true, name: true, email: true }
          },
          userUpdated: {
            select: { id: true, name: true, email: true }
          },
          branch: {
            select: { uuid: true, name: true, code: true }
          },
          entries: {
            orderBy: { entryDate: 'desc' },
            take: 5
          },
          attachments: {
            take: 3
          },
          _count: {
            select: {
              entries: true,
              attachments: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.safetyJournal.count({ where })
    ]);

    res.json({
      success: true,
      data: journals,
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

// Получить журнал по ID
export const getSafetyJournalById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    
    const journal = await prisma.safetyJournal.findUnique({
      where: { id },
      include: {
        userAdd: {
          select: { id: true, name: true, email: true }
        },
        userUpdated: {
          select: { id: true, name: true, email: true }
        },
        branch: {
          select: { uuid: true, name: true, code: true }
        },
        entries: {
          orderBy: { entryDate: 'desc' },
          include: {
            userAdd: {
              select: { id: true, name: true, email: true }
            },
            attachments: true
          }
        },
        attachments: true
      }
    });

    if (!journal) {
      res.status(404).json({ success: false, message: 'Журнал не найден' });
      return;
    }

    res.json({ success: true, data: journal });
  } catch (error) {
    next(error);
  }
};

// Создать журнал
export const createSafetyJournal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = SafetyJournalSchema.parse(req.body);
    
    const journal = await prisma.safetyJournal.create({
      data: {
        ...validatedData,
        startDate: new Date(validatedData.startDate),
        endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
      },
      include: {
        userAdd: {
          select: { id: true, name: true, email: true }
        },
        branch: {
          select: { uuid: true, name: true, code: true }
        }
      }
    });

    res.status(201).json({ success: true, data: journal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: 'Ошибка валидации', errors: error.errors });
      return;
    }
    next(error);
  }
};

// Обновить журнал
export const updateSafetyJournal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const validatedData = SafetyJournalSchema.partial().parse(req.body);
    
    const journal = await prisma.safetyJournal.update({
      where: { id },
      data: {
        ...validatedData,
        startDate: validatedData.startDate ? new Date(validatedData.startDate) : undefined,
        endDate: validatedData.endDate ? new Date(validatedData.endDate) : undefined,
        updatedAt: new Date()
      },
      include: {
        userAdd: {
          select: { id: true, name: true, email: true }
        },
        userUpdated: {
          select: { id: true, name: true, email: true }
        },
        branch: {
          select: { uuid: true, name: true, code: true }
        }
      }
    });

    res.json({ success: true, data: journal });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: 'Ошибка валидации', errors: error.errors });
      return;
    }
    next(error);
  }
};

// Удалить журнал
export const deleteSafetyJournal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    
    await prisma.safetyJournal.delete({
      where: { id }
    });

    res.json({ success: true, message: 'Журнал удален' });
  } catch (error) {
    next(error);
  }
};

// Получить записи журнала
export const getSafetyJournalEntries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { journalId } = req.params;
    const { page = 1, limit = 10, entryType, status } = req.query;
    
    const where: any = { journalId };
    if (entryType) where.entryType = entryType;
    if (status) where.status = status;

    const [entries, total] = await Promise.all([
      prisma.safetyJournalEntry.findMany({
        where,
        include: {
          userAdd: {
            select: { id: true, name: true, email: true }
          },
          attachments: true
        },
        orderBy: { entryDate: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.safetyJournalEntry.count({ where })
    ]);

    res.json({
      success: true,
      data: entries,
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

// Создать запись в журнале
export const createSafetyJournalEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = SafetyJournalEntrySchema.parse(req.body);
    
    const entry = await prisma.safetyJournalEntry.create({
      data: {
        ...validatedData,
        entryDate: new Date(validatedData.entryDate),
        deadline: validatedData.deadline ? new Date(validatedData.deadline) : null,
      },
      include: {
        userAdd: {
          select: { id: true, name: true, email: true }
        },
        attachments: true
      }
    });

    // Обновляем дату последней записи в журнале
    await prisma.safetyJournal.update({
      where: { id: validatedData.journalId },
      data: { lastEntryDate: new Date(validatedData.entryDate) }
    });

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: 'Ошибка валидации', errors: error.errors });
      return;
    }
    next(error);
  }
};

// Обновить запись в журнале
export const updateSafetyJournalEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const validatedData = SafetyJournalEntrySchema.partial().parse(req.body);
    
    const entry = await prisma.safetyJournalEntry.update({
      where: { id },
      data: {
        ...validatedData,
        entryDate: validatedData.entryDate ? new Date(validatedData.entryDate) : undefined,
        deadline: validatedData.deadline ? new Date(validatedData.deadline) : undefined,
        updatedAt: new Date()
      },
      include: {
        userAdd: {
          select: { id: true, name: true, email: true }
        },
        attachments: true
      }
    });

    res.json({ success: true, data: entry });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: 'Ошибка валидации', errors: error.errors });
      return;
    }
    next(error);
  }
};

// Удалить запись из журнала
export const deleteSafetyJournalEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    
    await prisma.safetyJournalEntry.delete({
      where: { id }
    });

    res.json({ success: true, message: 'Запись удалена' });
  } catch (error) {
    next(error);
  }
};

// Получить статистику по журналам
export const getSafetyJournalStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { branchId, journalType } = req.query;
    
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (journalType) where.journalType = journalType;

    const [totalJournals, activeJournals, completedJournals, totalEntries, overdueEntries] = await Promise.all([
      prisma.safetyJournal.count({ where }),
      prisma.safetyJournal.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.safetyJournal.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.safetyJournalEntry.count({ where: { journal: where } }),
      prisma.safetyJournalEntry.count({ 
        where: { 
          journal: where,
          status: 'OVERDUE'
        } 
      })
    ]);

    res.json({
      success: true,
      data: {
        totalJournals,
        activeJournals,
        completedJournals,
        totalEntries,
        overdueEntries
      }
    });
  } catch (error) {
    next(error);
  }
};
