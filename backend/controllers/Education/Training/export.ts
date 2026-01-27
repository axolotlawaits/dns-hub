import { Request, Response } from 'express';
import { prisma } from '../../../server.js';
import * as XLSX from 'xlsx';

// Экспорт данных в Excel
export const exportToExcel = async (req: Request, res: Response) => {
  try {
    const {
      status,
      rrs,
      branchId,
      search,
      trainingStatus,
      trainingProgramId,
      homeworkStatus
    } = req.query;

    // Используем ту же логику фильтрации, что и в getManagers
    const where: any = {};

    if (status) {
      const statusIds = Array.isArray(status) ? status : [status];
      where.statusId = { in: statusIds };
    }

    // Получаем управляющих с данными пользователя
    const managers = await prisma.manager.findMany({
      where,
      include: {
        user: true,
        status: true,
        trainingProgress: {
          include: {
            trainingProgram: {
              include: {
                type: true
              }
            },
            status: true
          }
        },
        homeworkStatuses: {
          include: {
            trainingProgram: {
              include: {
                type: true
              }
            },
            status: true,
            checker: true
          }
        },
        employmentHistory: {
          include: {
            changeType: true
          },
          orderBy: {
            changeDate: 'desc'
          },
          take: 10 // Последние 10 изменений
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Фильтрация по статусу обучения
    let filteredManagers = managers;
    if (trainingStatus || trainingProgramId) {
      filteredManagers = managers.filter(manager => {
        if (trainingProgramId) {
          const progress = manager.trainingProgress.find(
            tp => tp.trainingProgramId === trainingProgramId
          );
          if (!progress) return false;
          if (trainingStatus) {
            const statusIds = Array.isArray(trainingStatus) ? trainingStatus : [trainingStatus];
            return statusIds.includes(progress.statusId);
          }
          return true;
        }
        if (trainingStatus) {
          const statusIds = Array.isArray(trainingStatus) ? trainingStatus : [trainingStatus];
          return manager.trainingProgress.some(tp => statusIds.includes(tp.statusId));
        }
        return true;
      });
    }

    // Фильтрация по статусу домашних заданий
    if (homeworkStatus) {
      const statusIds = Array.isArray(homeworkStatus) ? homeworkStatus : [homeworkStatus];
      filteredManagers = filteredManagers.filter(manager =>
        manager.homeworkStatuses.some(hw => statusIds.includes(hw.statusId))
      );
    }

    // Получаем UserData для всех управляющих и применяем дополнительные фильтры
    const managersWithData = await Promise.all(
      filteredManagers.map(async (manager) => {
        const userData = await prisma.userData.findFirst({
          where: { email: manager.user.email },
          include: {
            branch: true,
            position: {
              include: {
                group: true
              }
            }
          }
        });

        return {
          manager,
          userData
        };
      })
    );

    // Применяем фильтры по РРС, филиалу и поиску
    let finalManagers = managersWithData;
    
    if (rrs) {
      const rrses = Array.isArray(rrs) ? rrs : [rrs];
      finalManagers = finalManagers.filter(m => 
        rrses.includes(m.userData?.branch?.rrs || '')
      );
    }

    if (branchId) {
      const branchIds = Array.isArray(branchId) ? branchId : [branchId];
      finalManagers = finalManagers.filter(m => 
        branchIds.includes(m.userData?.branch_uuid || '')
      );
    }

    if (search) {
      const searchLower = (search as string).toLowerCase();
      finalManagers = finalManagers.filter(m => {
        const fio = m.userData?.fio || m.manager.user.name || '';
        const email = m.manager.user.email || '';
        return fio.toLowerCase().includes(searchLower) || email.toLowerCase().includes(searchLower);
      });
    }

    // Форматируем данные для Excel
    const excelData = finalManagers.map(({ manager, userData }) => {
      // Формируем строку с обязательными модулями
      const mandatoryModules = manager.trainingProgress
        .filter(tp => tp.trainingProgram.isRequired)
        .map(tp => `${tp.trainingProgram.name}: ${tp.status.name}`)
        .join('; ');

      // Формируем строку с дополнительными программами
      const additionalPrograms = manager.trainingProgress
        .filter(tp => !tp.trainingProgram.isRequired)
        .map(tp => `${tp.trainingProgram.name}: ${tp.status.name}`)
        .join('; ');

      // Формируем строку с домашними заданиями
      const homeworkInfo = manager.homeworkStatuses
        .map(hw => {
          const checkerName = hw.checker ? hw.checker.name : 'Не указан';
          const submissionDate = hw.submissionDate 
            ? new Date(hw.submissionDate).toLocaleDateString('ru-RU')
            : '';
          const checkDate = hw.checkDate 
            ? new Date(hw.checkDate).toLocaleDateString('ru-RU')
            : '';
          return `${hw.trainingProgram.name}: ${hw.status.name} (Проверяющий: ${checkerName}${submissionDate ? `, Сдано: ${submissionDate}` : ''}${checkDate ? `, Проверено: ${checkDate}` : ''})`;
        })
        .join('; ');

      // Формируем строку с историей кадровых изменений
      const historyInfo = manager.employmentHistory
        .map(eh => {
          const changeDate = new Date(eh.changeDate).toLocaleDateString('ru-RU');
          return `${eh.changeType.name} (${changeDate})`;
        })
        .join('; ');

      return {
          ФИО: userData?.fio || manager.user.name,
          Email: manager.user.email,
          Должность: userData?.position?.name || manager.user.position || '',
          Категория: userData?.position?.group?.name || '',
          Филиал: userData?.branch?.name || manager.user.branch || '',
          'Код филиала': userData?.branch?.code || '',
          РРС: userData?.branch?.rrs || '',
          Город: userData?.branch?.city || '',
          'Формат филиала': userData?.branch?.typeOfDist || userData?.branch?.type || '',
          Статус: manager.status.name,
          'Кол-во филиалов в управлении': manager.branchCount || '',
          'Численность филиала': manager.employeeCount || '',
          'Обязательные модули': mandatoryModules || '',
          'Дополнительные программы': additionalPrograms || '',
          'Домашние задания': homeworkInfo || '',
          'История кадровых изменений': historyInfo || '',
          'Последнее изменение': manager.employmentHistory[0]
            ? new Date(manager.employmentHistory[0].changeDate).toLocaleDateString('ru-RU')
            : ''
        };
    });

    // Создаем Excel файл
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Управляющие');
    
    // Настраиваем ширину колонок
    const columnWidths = [
      { wch: 25 }, // ФИО
      { wch: 30 }, // Email
      { wch: 20 }, // Должность
      { wch: 15 }, // Категория
      { wch: 30 }, // Филиал
      { wch: 12 }, // Код филиала
      { wch: 10 }, // РРС
      { wch: 15 }, // Город
      { wch: 15 }, // Формат филиала
      { wch: 12 }, // Статус
      { wch: 10 }, // Кол-во филиалов
      { wch: 10 }, // Численность
      { wch: 50 }, // Обязательные модули
      { wch: 50 }, // Дополнительные программы
      { wch: 60 }, // Домашние задания
      { wch: 60 }, // История кадровых изменений
      { wch: 15 }  // Последнее изменение
    ];
    worksheet['!cols'] = columnWidths;

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    const fileName = `training_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('❌ Ошибка при экспорте в Excel:', error);
    res.status(500).json({
      error: 'Ошибка при экспорте в Excel',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
