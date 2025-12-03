import * as XLSX from 'xlsx';
import { MerchStatsResponse } from '../../../data/MerchStatsData';
import dayjs from 'dayjs';

// Функция для получения названия действия
function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'start': 'Запуск бота',
    'button_click': 'Нажатие кнопки',
    'search': 'Поиск',
    'card_view': 'Просмотр карточки',
    'message_reaction': 'Реакция на сообщение',
    'feedback': 'Обратная связь',
    'back': 'Назад',
    'next': 'Далее',
    'category_select': 'Выбор категории',
    'card_select': 'Выбор карточки',
    'help': 'Помощь',
    'menu': 'Меню',
  };
  return labels[action] || action;
}

export function exportStatsToExcel(stats: MerchStatsResponse, period: number) {
  const workbook = XLSX.utils.book_new();
  
  // Лист 1: Сводная статистика
  const summaryData = [
    ['📊 СТАТИСТИКА МЕРЧ БОТА', ''],
    ['Период анализа', `${period} дней`],
    ['Дата экспорта', dayjs().format('DD.MM.YYYY HH:mm')],
    ['', ''],
    ['👥 ПОЛЬЗОВАТЕЛИ', ''],
    ['Всего пользователей', stats.summary.totalUsers],
    ['Активных за период', stats.summary.activeUsers],
    ['Активных сегодня', stats.summary.activeUsersToday],
    ['Активных за неделю', stats.summary.activeUsersWeek],
    ['Активных за месяц', stats.summary.activeUsersMonth],
    ['Новых пользователей', stats.summary.newUsers],
    ['Вернувшихся пользователей', stats.returningUsers || 0],
    ['', ''],
    ['📈 АКТИВНОСТЬ', ''],
    ['Всего действий', stats.summary.totalActions],
    ['Среднее действий на пользователя', (stats.avgActionsPerUser || 0).toFixed(2)],
    ['Всего сессий', stats.totalSessions || 0],
    ['Средняя длительность сессии (мин)', (stats.avgSessionDuration || 0).toFixed(2)],
    ['Среднее действий в сессии', (stats.avgActionsPerSession || 0).toFixed(2)],
    ['', ''],
    ['💬 ОБРАТНАЯ СВЯЗЬ', ''],
    ['Запросов обратной связи', stats.summary.feedbackRequests],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  
  // Устанавливаем ширину колонок для сводки
  summarySheet['!cols'] = [
    { wch: 35 },
    { wch: 20 }
  ];
  
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводка');

  // Лист 2: Действия (детальная статистика)
  const actionsData = [
    ['Действие', 'Название', 'Количество', 'Процент от общего'],
    ...stats.actions.map(a => {
      const total = stats.summary.totalActions;
      const percentage = total > 0 ? ((a.count / total) * 100).toFixed(2) : '0.00';
      return [a.action, getActionLabel(a.action), a.count, `${percentage}%`];
    })
  ];
  const actionsSheet = XLSX.utils.aoa_to_sheet(actionsData);
  actionsSheet['!cols'] = [
    { wch: 20 },
    { wch: 25 },
    { wch: 15 },
    { wch: 18 }
  ];
  XLSX.utils.book_append_sheet(workbook, actionsSheet, 'Действия');

  // Лист 3: Популярные кнопки
  const totalButtonClicks = stats.popularButtons.reduce((sum, b) => sum + b.count, 0);
  const buttonsData = [
    ['#', 'Кнопка', 'Нажатий', 'Процент'],
    ...stats.popularButtons.map((b, idx) => {
      const percentage = totalButtonClicks > 0 ? ((b.count / totalButtonClicks) * 100).toFixed(2) : '0.00';
      return [idx + 1, b.name, b.count, `${percentage}%`];
    })
  ];
  const buttonsSheet = XLSX.utils.aoa_to_sheet(buttonsData);
  buttonsSheet['!cols'] = [
    { wch: 5 },
    { wch: 30 },
    { wch: 15 },
    { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(workbook, buttonsSheet, 'Кнопки');

  // Лист 4: Поисковые запросы
  const totalSearches = stats.popularSearches.reduce((sum, s) => sum + s.count, 0);
  const searchesData = [
    ['#', 'Запрос', 'Количество', 'Процент', 'Длина запроса'],
    ...stats.popularSearches.map((s, idx) => {
      const percentage = totalSearches > 0 ? ((s.count / totalSearches) * 100).toFixed(2) : '0.00';
      return [idx + 1, s.query, s.count, `${percentage}%`, s.query.length];
    })
  ];
  const searchesSheet = XLSX.utils.aoa_to_sheet(searchesData);
  searchesSheet['!cols'] = [
    { wch: 5 },
    { wch: 40 },
    { wch: 15 },
    { wch: 12 },
    { wch: 15 }
  ];
  XLSX.utils.book_append_sheet(workbook, searchesSheet, 'Поиск');

  // Лист 5: Топ пользователей
  const usersData = [
    ['#', 'Пользователь', 'Username', 'Действий', 'Дата регистрации', 'Дней с регистрации'],
    ...stats.topUsers.map((u, idx) => {
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'N/A';
      const daysSinceReg = u.registeredAt 
        ? Math.floor(dayjs().diff(dayjs(u.registeredAt), 'day'))
        : 'N/A';
      return [
        idx + 1,
        fullName,
        u.username ? `@${u.username}` : 'N/A',
        u.actionsCount,
        u.registeredAt ? dayjs(u.registeredAt).format('DD.MM.YYYY') : 'N/A',
        daysSinceReg
      ];
    })
  ];
  const usersSheet = XLSX.utils.aoa_to_sheet(usersData);
  usersSheet['!cols'] = [
    { wch: 5 },
    { wch: 25 },
    { wch: 20 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(workbook, usersSheet, 'Пользователи');

  // Лист 6: Статистика по дням (детальная)
  if (stats.dailyStats && stats.dailyStats.length > 0) {
    const dailyData = [
      ['Дата', 'День недели', 'Действий', 'Уникальных пользователей', 'Среднее действий на пользователя'],
      ...stats.dailyStats.map(d => {
        const dayName = dayjs(d.date).format('dddd');
        const avgActions = d.uniqueUsers > 0 ? (d.totalActions / d.uniqueUsers).toFixed(2) : '0';
        return [
          dayjs(d.date).format('DD.MM.YYYY'),
          dayName,
          d.totalActions,
          d.uniqueUsers,
          avgActions
        ];
      })
    ];
    const dailySheet = XLSX.utils.aoa_to_sheet(dailyData);
    dailySheet['!cols'] = [
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 25 },
      { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(workbook, dailySheet, 'По дням');
    
    // Лист 6.1: Детализация действий по дням
    if (stats.dailyStats.some(d => d.actions && Object.keys(d.actions).length > 0)) {
      const dailyActionsData: any[] = [['Дата', 'Действие', 'Количество']];
      stats.dailyStats.forEach(d => {
        if (d.actions) {
          Object.entries(d.actions).forEach(([action, count]) => {
            dailyActionsData.push([
              dayjs(d.date).format('DD.MM.YYYY'),
              getActionLabel(action),
              count
            ]);
          });
        }
      });
      const dailyActionsSheet = XLSX.utils.aoa_to_sheet(dailyActionsData);
      dailyActionsSheet['!cols'] = [
        { wch: 15 },
        { wch: 25 },
        { wch: 15 }
      ];
      XLSX.utils.book_append_sheet(workbook, dailyActionsSheet, 'Действия по дням');
    }
  }

  // Лист 7: Статистика по часам
  if (stats.hourlyStats && stats.hourlyStats.length > 0) {
    const totalHourly = stats.hourlyStats.reduce((sum, h) => sum + h.count, 0);
    const hourlyData = [
      ['Час', 'Время', 'Действий', 'Процент', 'Пик активности'],
      ...stats.hourlyStats.map(h => {
        const percentage = totalHourly > 0 ? ((h.count / totalHourly) * 100).toFixed(2) : '0.00';
        const timeLabel = `${h.hour}:00 - ${h.hour + 1}:00`;
        const isPeak = h.count === Math.max(...stats.hourlyStats.map(h2 => h2.count));
        return [
          h.hour,
          timeLabel,
          h.count,
          `${percentage}%`,
          isPeak ? '🔝 Пик' : ''
        ];
      })
    ];
    const hourlySheet = XLSX.utils.aoa_to_sheet(hourlyData);
    hourlySheet['!cols'] = [
      { wch: 8 },
      { wch: 18 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(workbook, hourlySheet, 'По часам');
  }

  // Лист 8: Реакции
  if (stats.reactionStats) {
    const totalReactions = stats.reactionStats.topReactions.reduce((sum, r) => sum + r.count, 0);
    const reactionsData = [
      ['#', 'Эмодзи', 'Количество', 'Процент'],
      ...stats.reactionStats.topReactions.map((r, idx) => {
        const percentage = totalReactions > 0 ? ((r.count / totalReactions) * 100).toFixed(2) : '0.00';
        return [idx + 1, r.emoji, r.count, `${percentage}%`];
      })
    ];
    const reactionsSheet = XLSX.utils.aoa_to_sheet(reactionsData);
    reactionsSheet['!cols'] = [
      { wch: 5 },
      { wch: 10 },
      { wch: 15 },
      { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(workbook, reactionsSheet, 'Реакции');
  }

  // Лист 9: Популярные карточки
  if (stats.popularCards && stats.popularCards.length > 0) {
    const totalViews = stats.popularCards.reduce((sum, c) => sum + c.count, 0);
    const cardsData = [
      ['#', 'Карточка', 'Просмотров', 'Процент'],
      ...stats.popularCards.map((c, idx) => {
        const percentage = totalViews > 0 ? ((c.count / totalViews) * 100).toFixed(2) : '0.00';
        return [idx + 1, c.name, c.count, `${percentage}%`];
      })
    ];
    const cardsSheet = XLSX.utils.aoa_to_sheet(cardsData);
    cardsSheet['!cols'] = [
      { wch: 5 },
      { wch: 40 },
      { wch: 15 },
      { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(workbook, cardsSheet, 'Карточки');
  }

  // Лист 10: Воронка конверсии
  if (stats.funnelStats) {
    const funnelData = [
      ['Этап', 'Количество', 'Процент от старта', 'Конверсия от предыдущего'],
      ['Запустили бота', stats.funnelStats.started, '100.00%', '-'],
      ['Нажали кнопку', stats.funnelStats.clickedButton, 
        stats.funnelStats.started > 0 
          ? `${((stats.funnelStats.clickedButton / stats.funnelStats.started) * 100).toFixed(2)}%`
          : '0.00%',
        '100.00%'],
      ['Использовали поиск', stats.funnelStats.searched,
        stats.funnelStats.started > 0
          ? `${((stats.funnelStats.searched / stats.funnelStats.started) * 100).toFixed(2)}%`
          : '0.00%',
        stats.funnelStats.clickedButton > 0
          ? `${((stats.funnelStats.searched / stats.funnelStats.clickedButton) * 100).toFixed(2)}%`
          : '0.00%'],
      ['Оставили обратную связь', stats.funnelStats.gaveFeedback,
        stats.funnelStats.started > 0
          ? `${((stats.funnelStats.gaveFeedback / stats.funnelStats.started) * 100).toFixed(2)}%`
          : '0.00%',
        stats.funnelStats.searched > 0
          ? `${((stats.funnelStats.gaveFeedback / stats.funnelStats.searched) * 100).toFixed(2)}%`
          : '0.00%'],
    ];
    const funnelSheet = XLSX.utils.aoa_to_sheet(funnelData);
    funnelSheet['!cols'] = [
      { wch: 25 },
      { wch: 15 },
      { wch: 20 },
      { wch: 25 }
    ];
    XLSX.utils.book_append_sheet(workbook, funnelSheet, 'Воронка');
  }

  // Лист 11: Retention (удержание пользователей)
  if (stats.retentionStats) {
    const totalActive = stats.summary.activeUsers;
    const retentionData = [
      ['Период', 'Количество вернувшихся', 'Процент от активных'],
      ['Вернулись через 1 день', stats.retentionStats.day1,
        totalActive > 0 ? `${((stats.retentionStats.day1 / totalActive) * 100).toFixed(2)}%` : '0.00%'],
      ['Вернулись через 7 дней', stats.retentionStats.day7,
        totalActive > 0 ? `${((stats.retentionStats.day7 / totalActive) * 100).toFixed(2)}%` : '0.00%'],
      ['Вернулись через 30 дней', stats.retentionStats.day30,
        totalActive > 0 ? `${((stats.retentionStats.day30 / totalActive) * 100).toFixed(2)}%` : '0.00%'],
    ];
    const retentionSheet = XLSX.utils.aoa_to_sheet(retentionData);
    retentionSheet['!cols'] = [
      { wch: 25 },
      { wch: 25 },
      { wch: 22 }
    ];
    XLSX.utils.book_append_sheet(workbook, retentionSheet, 'Retention');
  }

  // Лист 12: Сегментация пользователей
  if (stats.userSegments) {
    const totalSegments = stats.userSegments.high + stats.userSegments.medium + 
                          stats.userSegments.low + stats.userSegments.inactive;
    const segmentsData = [
      ['Сегмент', 'Количество', 'Процент'],
      ['Высокая активность', stats.userSegments.high,
        totalSegments > 0 ? `${((stats.userSegments.high / totalSegments) * 100).toFixed(2)}%` : '0.00%'],
      ['Средняя активность', stats.userSegments.medium,
        totalSegments > 0 ? `${((stats.userSegments.medium / totalSegments) * 100).toFixed(2)}%` : '0.00%'],
      ['Низкая активность', stats.userSegments.low,
        totalSegments > 0 ? `${((stats.userSegments.low / totalSegments) * 100).toFixed(2)}%` : '0.00%'],
      ['Неактивные', stats.userSegments.inactive,
        totalSegments > 0 ? `${((stats.userSegments.inactive / totalSegments) * 100).toFixed(2)}%` : '0.00%'],
      ['', '', ''],
      ['Всего', totalSegments, '100.00%'],
    ];
    const segmentsSheet = XLSX.utils.aoa_to_sheet(segmentsData);
    segmentsSheet['!cols'] = [
      { wch: 25 },
      { wch: 15 },
      { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(workbook, segmentsSheet, 'Сегментация');
  }

  // Лист 13: Когортный анализ
  if (stats.cohortAnalysis && stats.cohortAnalysis.length > 0) {
    const cohortData = [
      ['Когорта', 'Пользователей', 'Retention день 1', 'Retention день 7', 'Retention день 30', 'Средний retention'],
      ...stats.cohortAnalysis.map(c => {
        // retention - это числа (проценты)
        const day1 = c.retention.day1;
        const day7 = c.retention.day7;
        const day30 = c.retention.day30;
        const avgRetention = (day1 + day7 + day30) / 3;
        return [
          c.cohort,
          c.users,
          `${day1.toFixed(2)}%`,
          `${day7.toFixed(2)}%`,
          `${day30.toFixed(2)}%`,
          `${avgRetention.toFixed(2)}%`
        ];
      })
    ];
    const cohortSheet = XLSX.utils.aoa_to_sheet(cohortData);
    cohortSheet['!cols'] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
      { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, cohortSheet, 'Когорты');
  }

  // Лист 14: Аналитика контента
  if (stats.contentAnalytics) {
    const contentData = [
      ['#', 'Карточка', 'Просмотров', 'Реакций', 'Конверсия %', 'Среднее реакций на просмотр'],
      ...stats.contentAnalytics.conversionRate.map((c, idx) => {
        const avgReactions = c.views > 0 ? (c.reactions / c.views).toFixed(2) : '0.00';
        return [
          idx + 1,
          c.cardName,
          c.views,
          c.reactions,
          `${c.conversionRate.toFixed(2)}%`,
          avgReactions
        ];
      })
    ];
    const contentSheet = XLSX.utils.aoa_to_sheet(contentData);
    contentSheet['!cols'] = [
      { wch: 5 },
      { wch: 35 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 25 }
    ];
    XLSX.utils.book_append_sheet(workbook, contentSheet, 'Контент');
    
    // Лист 14.1: Непопулярные карточки
    if (stats.contentAnalytics.unpopularCards && stats.contentAnalytics.unpopularCards.length > 0) {
      const unpopularData = [
        ['#', 'Карточка', 'Просмотров', 'Статус'],
        ...stats.contentAnalytics.unpopularCards.map((c, idx) => [
          idx + 1,
          c.cardName,
          c.views,
          c.views === 0 ? 'Нет просмотров' : 'Низкая популярность'
        ])
      ];
      const unpopularSheet = XLSX.utils.aoa_to_sheet(unpopularData);
      unpopularSheet['!cols'] = [
        { wch: 5 },
        { wch: 35 },
        { wch: 15 },
        { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(workbook, unpopularSheet, 'Непопулярные карточки');
    }
  }
  
  // Лист 15: Поведенческая аналитика
  if (stats.behaviorAnalytics) {
    const behaviorData = [
      ['Метрика', 'Значение'],
      ['Средняя глубина просмотра', stats.behaviorAnalytics.avgViewDepth.toFixed(2)],
      ['Процент отказов', `${stats.behaviorAnalytics.bounceRate.toFixed(2)}%`],
      ['Процент вовлеченности', `${(100 - stats.behaviorAnalytics.bounceRate).toFixed(2)}%`],
    ];
    const behaviorSheet = XLSX.utils.aoa_to_sheet(behaviorData);
    behaviorSheet['!cols'] = [
      { wch: 30 },
      { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, behaviorSheet, 'Поведение');
  }
  
  // Лист 16: Статистика по дням недели
  if (stats.weekdayStats && Array.isArray(stats.weekdayStats) && stats.weekdayStats.length > 0) {
    const totalWeekday = stats.weekdayStats.reduce((sum, w) => sum + w.count, 0);
    const weekdayData = [
      ['День недели', 'Действий', 'Процент'],
      ...stats.weekdayStats.map(w => {
        const percentage = totalWeekday > 0 ? ((w.count / totalWeekday) * 100).toFixed(2) : '0.00';
        return [w.dayName, w.count, `${percentage}%`];
      })
    ];
    const weekdaySheet = XLSX.utils.aoa_to_sheet(weekdayData);
    weekdaySheet['!cols'] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(workbook, weekdaySheet, 'Дни недели');
  }
  
  // Лист 17: Длина поисковых запросов
  if (stats.searchLengthStats) {
    const totalLength = (stats.searchLengthStats.short || 0) + 
                        (stats.searchLengthStats.medium || 0) + 
                        (stats.searchLengthStats.long || 0);
    const searchLengthData = [
      ['Длина запроса', 'Количество запросов', 'Процент'],
      ['Короткие (до 10 символов)', stats.searchLengthStats.short || 0,
        totalLength > 0 ? `${(((stats.searchLengthStats.short || 0) / totalLength) * 100).toFixed(2)}%` : '0.00%'],
      ['Средние (11-30 символов)', stats.searchLengthStats.medium || 0,
        totalLength > 0 ? `${(((stats.searchLengthStats.medium || 0) / totalLength) * 100).toFixed(2)}%` : '0.00%'],
      ['Длинные (более 30 символов)', stats.searchLengthStats.long || 0,
        totalLength > 0 ? `${(((stats.searchLengthStats.long || 0) / totalLength) * 100).toFixed(2)}%` : '0.00%'],
      ['', '', ''],
      ['Всего запросов', totalLength, '100.00%'],
    ];
    const searchLengthSheet = XLSX.utils.aoa_to_sheet(searchLengthData);
    searchLengthSheet['!cols'] = [
      { wch: 30 },
      { wch: 25 },
      { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(workbook, searchLengthSheet, 'Длина запросов');
  }

  // Сохраняем файл
  const fileName = `merch_stats_${dayjs().format('YYYY-MM-DD_HH-mm')}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

export function exportStatsToCSV(stats: MerchStatsResponse, period: number) {
  // Простой CSV экспорт основных данных
  let csv = 'Метрика,Значение\n';
  csv += `Период (дней),${period}\n`;
  csv += `Всего пользователей,${stats.summary.totalUsers}\n`;
  csv += `Активных за период,${stats.summary.activeUsers}\n`;
  csv += `Всего действий,${stats.summary.totalActions}\n`;
  
  csv += '\nДействие,Количество\n';
  stats.actions.forEach(a => {
    csv += `${a.action},${a.count}\n`;
  });

  csv += '\nКнопка,Нажатий\n';
  stats.popularButtons.forEach(b => {
    csv += `${b.name.replace(/,/g, ';')},${b.count}\n`;
  });

  csv += '\nЗапрос,Количество\n';
  stats.popularSearches.forEach(s => {
    csv += `${s.query.replace(/,/g, ';')},${s.count}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `merch_stats_${dayjs().format('YYYY-MM-DD_HH-mm')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

