import { Request, Response } from 'express';
import { prisma } from '../../../server.js';

// Получить аналитику по обучению
export const getAnalytics = async (req: Request, res: Response) => {
  try {
    // Общая статистика по управляющим
    const totalManagers = await prisma.manager.count();
    const activeManagers = await prisma.manager.count({
      where: { status: 'ACTIVE' }
    });
    const demotedManagers = await prisma.manager.count({
      where: { status: 'DEMOTED' }
    });
    const firedManagers = await prisma.manager.count({
      where: { status: 'FIRED' }
    });

    // Статистика по обучению
    const totalPrograms = await prisma.trainingProgram.count();
    const mandatoryModules = await prisma.trainingProgram.count({
      where: { type: 'ОБЯЗАТЕЛЬНЫЙ_МОДУЛЬ' }
    });
    const additionalPrograms = await prisma.trainingProgram.count({
      where: { type: 'ДОП_ПРОГРАММА' }
    });

    // Статистика по прогрессу обучения
    const progressStats = await prisma.trainingProgress.groupBy({
      by: ['statusId'],
      _count: true
    });

    // Получаем названия статусов
    const progressStatsWithNames = await Promise.all(
      progressStats.map(async (stat) => {
        const statusType = await prisma.type.findUnique({
          where: { id: stat.statusId }
        });
        return {
          status: statusType?.name || stat.statusId,
          statusId: stat.statusId,
          count: stat._count
        };
      })
    );

    // Статистика по статусам домашних заданий
    const homeworkStats = await prisma.homeworkStatus.groupBy({
      by: ['statusId'],
      _count: true
    });

    // Получаем названия статусов
    const homeworkStatsWithNames = await Promise.all(
      homeworkStats.map(async (stat) => {
        const statusType = await prisma.type.findUnique({
          where: { id: stat.statusId }
        });
        return {
          status: statusType?.name || stat.statusId,
          statusId: stat.statusId,
          count: stat._count
        };
      })
    );

    // Статистика по программам
    const programStats = await prisma.trainingProgress.groupBy({
      by: ['trainingProgramId'],
      _count: true
    });

    const programDetails = await Promise.all(
      programStats.map(async (stat) => {
        const program = await prisma.trainingProgram.findUnique({
          where: { id: stat.trainingProgramId }
        });
        return {
          programId: stat.trainingProgramId,
          programName: program?.name || 'Неизвестно',
          count: stat._count
        };
      })
    );

    // Статистика по кадровым изменениям
    const employmentStats = await prisma.employmentHistory.groupBy({
      by: ['changeTypeId'],
      _count: true
    });

    // Получаем названия типов изменений
    const employmentStatsWithNames = await Promise.all(
      employmentStats.map(async (stat) => {
        const changeType = await prisma.type.findUnique({
          where: { id: stat.changeTypeId }
        });
        return {
          changeType: changeType?.name || stat.changeTypeId,
          changeTypeId: stat.changeTypeId,
          count: stat._count
        };
      })
    );

    return res.json({
      managers: {
        total: totalManagers,
        active: activeManagers,
        demoted: demotedManagers,
        fired: firedManagers
      },
      programs: {
        total: totalPrograms,
        mandatoryModules,
        additionalPrograms
      },
      progress: progressStatsWithNames,
      homework: homeworkStatsWithNames,
      programStats: programDetails,
      employment: employmentStatsWithNames
    });
  } catch (error) {
    console.error('❌ Ошибка при получении аналитики:', error);
    res.status(500).json({
      error: 'Ошибка при получении аналитики',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
