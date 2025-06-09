import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server';
import dayjs from 'dayjs';

// GET endpoint для получения совмещенных данных
export const getUpcomingBirthdays = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    const userEmail = req.params.id;

    // Получаем пользователя
    const userAuth = await prisma.userData.findUnique({
      where: { email: userEmail },
      select: {
        branch: {
          select: {
            uuid: true,
            type: true,
          },
        },
      },
    });

    if (!userAuth || !userAuth.branch) {
      res.status(404).json({ message: 'User or branch not found' });
      return;
    }

    let whereCondition: any;
    if (['Администрация', 'Структурное подразделение'].includes(userAuth.branch.type)) {
      whereCondition = { branch: { type: userAuth.branch.type } };
    } else {
      whereCondition = { branch: { uuid: userAuth.branch.uuid } };
    }

    // Получаем пользователей с учетом фильтров
    const userDataList = await prisma.userData.findMany({
      where: whereCondition,
      select: {
        fio: true,
        birthday: true,
        email: true,
        branch: {
          select: {
            uuid: true,
            type: true
          },
        },
      },
    });

    // Получаем дополнительные данные из таблицы User
    const emails = userDataList.map(user => user.email).filter((email): email is string => !!email);
    const usersFromUserTable = await prisma.user.findMany({
      where: {
        email: {
          in: emails
        }
      },
      select: {
        email: true,
        image: true
      }
    });

    // Создаем маппинг email -> user data
    const userDataMap = new Map(
      usersFromUserTable.map(user => [user.email, user])
    );

    // Фильтруем по датам рождения
    const upcomingBirthdays = userDataList.filter(user => {
      if (!user.birthday) return false;
      
      const userBirthday = user.birthday;
      const userMonth = userBirthday.getMonth() + 1;
      const userDay = userBirthday.getDate();

      // Проверка дней рождения в текущем месяце
      if (userMonth === currentMonth) {
        return userDay >= currentDay && userDay <= currentDay + 7;
      }
      // Проверка дней рождения в следующем месяце
      else if (
        (userMonth === currentMonth + 1 ||
          (currentMonth === 12 && userMonth === 1)) &&
        currentDay + 7 > new Date(today.getFullYear(), currentMonth, 0).getDate()
      ) {
        const daysInMonth = new Date(today.getFullYear(), currentMonth, 0).getDate();
        return userDay <= (currentDay + 7 - daysInMonth);
      }
      return false;
    });

// Формируем итоговый результат
const result = upcomingBirthdays
  .map(user => {
    if (!user.birthday) return null;

    const today = dayjs().startOf('day'); // Устанавливаем время на начало дня
    const birthDate = dayjs(user.birthday).startOf('day'); // Устанавливаем время на начало дня
    
    // Берем день рождения в текущем году
    let nextBirthday = birthDate.year(today.year());
    
    // Если день рождения в этом году уже прошел, берем следующий год
    if (nextBirthday.isBefore(today, 'day')) {
      nextBirthday = nextBirthday.add(1, 'year');
    }
    
    const daysUntil = nextBirthday.diff(today, 'day');
    
    // Проверяем, чтобы учитывать частичные дни
    const isToday = nextBirthday.isSame(today, 'day');
    const isTomorrow = nextBirthday.isSame(today.add(1, 'day'), 'day');
    
    return {
      ...user,
      ...(user.email ? userDataMap.get(user.email) : {}),
      daysUntil: isToday ? 0 : isTomorrow ? 1 : daysUntil
    };
  })
  .filter(user => user !== null)
  .sort((a, b) => a.daysUntil - b.daysUntil);

// Функция для форматирования текста
function formatDaysUntil(daysUntil: number) {
  if (daysUntil === 0) return 'сегодня';
  if (daysUntil === 1) return 'завтра';
  return `через ${daysUntil} дня`;
}
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};