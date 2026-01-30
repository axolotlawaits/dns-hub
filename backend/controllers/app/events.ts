import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import dayjs from 'dayjs';

type BirthdayUser = {
  uuid: string;
  fio: string;
  birthday: Date;
  email: string;
  image?: string | null; // Allow null here
  branch: { 
    name: string;
    uuid: string;
    type: string;
  };
  daysUntil: number;
  isWeekendBirthday: boolean;
  weekendDayName?: string;
  daysSince?: number;
};

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
            name: true,
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

    // Офис/админ: показываем дни рождения по всем филиалам того же типа (Администрация, АДМИНИСТРАЦИЯ, СП)
    let whereCondition: any;
    if (['Администрация', 'АДМИНИСТРАЦИЯ', 'Структурное подразделение'].includes(userAuth.branch.type)) {
      whereCondition = { branch: { type: userAuth.branch.type } };
    } else {
      whereCondition = { branch: { uuid: userAuth.branch.uuid } };
    }

    // Получаем пользователей с учетом фильтров
    const userDataList = await prisma.userData.findMany({
      where: whereCondition,
      select: {
        uuid: true,
        fio: true,
        birthday: true,
        email: true,
        branch: {
          select: {
            name: true,
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

    // Проверяем дни рождения, которые были в выходные (суббота или воскресенье)
    const pastWeekendBirthdays = userDataList.filter(user => {
      if (!user.birthday) return false;

      const today = dayjs().startOf('day');
      const birthDate = dayjs(user.birthday).startOf('day');
      
      // Берем день рождения в текущем году
      let birthdayThisYear = birthDate.year(today.year());
      
      // Если день рождения в этом году уже прошел, берем предыдущий
      if (birthdayThisYear.isAfter(today, 'day')) {
        birthdayThisYear = birthdayThisYear.subtract(1, 'year');
      }
      
      // Проверяем, был ли день рождения в прошлые выходные (в пределах 7 дней назад)
      const daysSinceBirthday = today.diff(birthdayThisYear, 'day');
      if (daysSinceBirthday >= 0 && daysSinceBirthday <= 6) {
        const dayOfWeek = birthdayThisYear.day(); // 0 - воскресенье, 6 - суббота
        return dayOfWeek === 0 || dayOfWeek === 6;
      }
      return false;
    });

    // Формируем итоговый результат для предстоящих дней рождений
    const upcomingResult = upcomingBirthdays
      .map(user => {
        if (!user.birthday) return null;

        const today = dayjs().startOf('day');
        const birthDate = dayjs(user.birthday).startOf('day');
        let nextBirthday = birthDate.year(today.year());
        
        if (nextBirthday.isBefore(today, 'day')) {
          nextBirthday = nextBirthday.add(1, 'year');
        }
        
        const daysUntil = nextBirthday.diff(today, 'day');
        const isToday = nextBirthday.isSame(today, 'day');
        const isTomorrow = nextBirthday.isSame(today.add(1, 'day'), 'day');
        
        const resultUser: BirthdayUser = {
          ...user,
          ...(user.email ? userDataMap.get(user.email) : {}),
          daysUntil: isToday ? 0 : isTomorrow ? 1 : daysUntil,
          isWeekendBirthday: false
        };
        
        return resultUser;
      })
      .filter((user): user is BirthdayUser => user !== null);

    // Формируем результат для дней рождений в выходные
    const weekendResult = pastWeekendBirthdays
      .map(user => {
        if (!user.birthday) return null;

        const today = dayjs().startOf('day');
        const birthDate = dayjs(user.birthday).startOf('day');
        let birthdayThisYear = birthDate.year(today.year());
        
        if (birthdayThisYear.isAfter(today, 'day')) {
          birthdayThisYear = birthdayThisYear.subtract(1, 'year');
        }
        
        const daysSince = today.diff(birthdayThisYear, 'day');
        const dayOfWeek = birthdayThisYear.day();
        const dayNames = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
        
        const resultUser: BirthdayUser = {
          ...user,
          ...(user.email ? userDataMap.get(user.email) : {}),
          daysUntil: -1,
          isWeekendBirthday: true,
          weekendDayName: dayNames[dayOfWeek],
          daysSince: daysSince
        };
        
        return resultUser;
      })
      .filter((user): user is BirthdayUser => user !== null)
      .filter(user => user.isWeekendBirthday && user.daysSince !== undefined && user.daysSince <= 3);

    // Функция для безопасного получения дней с момента дня рождения
    const getSafeDaysSince = (user: BirthdayUser): number => {
      return user.isWeekendBirthday && user.daysSince !== undefined ? user.daysSince : 0;
    };

    // Объединяем результаты и сортируем
    const result = [...upcomingResult, ...weekendResult].sort((a, b) => {
      if (a.daysUntil >= 0 && b.daysUntil >= 0) {
        return a.daysUntil - b.daysUntil;
      }
      if (a.daysUntil < 0 && b.daysUntil < 0) {
        return getSafeDaysSince(a) - getSafeDaysSince(b);
      }
      return a.daysUntil < 0 ? 1 : -1;
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

