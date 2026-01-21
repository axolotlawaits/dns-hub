# Техническое задание: Инструмент учета управляющих и прохождения обучения

## 1. Назначение инструмента

Единый инструмент для сотрудников отдела обучения, обеспечивающий:
- учет всех управляющих магазинами
- отслеживание кадровых изменений (назначения, переводы, понижения, увольнения)
- фиксацию прохождения обучающих программ
- аналитику и фильтрацию данных
- экспорт в Excel

## 2. Использование существующих данных

### 2.1. Источники данных (уже есть в системе)

**User** (таблица пользователей):
- `id` - ID пользователя
- `name` - ФИО
- `email` - Email
- `position` - Текущая должность (строка)
- `branch` - Текущий филиал (строка/UUID)
- `login` - Логин
- `role` - Роль (DEVELOPER, ADMIN, SUPERVISOR, EMPLOYEE)

**UserData** (расширенные данные):
- `uuid` - UUID пользователя
- `fio` - ФИО
- `email` - Email
- `branch_uuid` - UUID филиала (связь с Branch)
- `positionId` - UUID должности (связь с Position)
- `status` - Статус сотрудника
- `start_date` - Дата начала работы
- `end_date` - Дата окончания работы

**Branch** (филиалы):
- `uuid` - UUID филиала
- `name` - Название филиала
- `code` - Код филиала
- `rrs` - РРС
- `city` - Город
- `status` - Статус (1 - активен, 2 - закрыт)
- `type` - Тип/формат филиала
- `totalArea` - Общая площадь
- `tradingArea` - Торговая площадь

**Position** (должности):
- `uuid` - UUID должности
- `name` - Название должности
- `groupUuid` - UUID группы (связь с Group)

**Group** (группы должностей):
- `uuid` - UUID группы
- `name` - Название группы

## 3. Новая структура данных (Prisma Schema)

### 3.1. Модели для обучения (упрощено под учет прохождений)

```prisma
// Статус управляющего
enum ManagerStatus {
  ACTIVE      // Действующий
  DEMOTED     // Понижен
  FIRED       // Уволен
}

// Статус прохождения обучения (на русском)
enum TrainingStatus {
  НЕ_НАЧАЛ        // Не проходил
  В_ПРОЦЕССЕ      // В процессе
  ЗАВЕРШЕНО       // Завершено
}

// Тип обучения
enum TrainingType {
  ОБЯЗАТЕЛЬНЫЙ_МОДУЛЬ     // Обязательный модуль
  ДОП_ПРОГРАММА           // Дополнительная программа (иерархия курсов)
}

// Статус сдачи работы (учет факта, без хранения самих работ)
enum HomeworkStatus {
  НЕ_СДАНО
  СДАНО
  ПРОВЕРЕНО
  ОС_ОТПРАВЛЕНА
}

// Управляющий (расширение User)
model Manager {
  id                    String              @id @default(uuid())
  userId                String               @unique // Связь с User.id
  user                  User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Статус управляющего
  status                ManagerStatus        @default(ACTIVE)
  
  // Дополнительные данные (если нужны)
  branchCount           Int?                // Количество филиалов в управлении
  employeeCount         Int?                // Численность филиала
  
  // История кадровых изменений
  employmentHistory     EmploymentHistory[]
  
  // Обучение
  trainingProgress      TrainingProgress[]
  trainingComments      TrainingComment[]
  homeworkStatuses      HomeworkStatus[]
  
  createdAt             DateTime             @default(now())
  updatedAt             DateTime             @updatedAt
  
  @@index([userId])
  @@index([status])
}

// История кадровых изменений
enum EmploymentChangeType {
  HIRE          // Назначение на должность
  TRANSFER      // Перевод между филиалами
  DEMOTION      // Понижение
  TERMINATION   // Увольнение
}

model EmploymentHistory {
  id            String                @id @default(uuid())
  managerId     String
  manager       Manager               @relation(fields: [managerId], references: [id], onDelete: Cascade)
  
  changeType    EmploymentChangeType
  fromBranchId  String?               // UUID филиала "откуда"
  toBranchId    String?               // UUID филиала "куда"
  fromPosition  String?               // Должность "откуда"
  toPosition    String?               // Должность "куда"
  changeDate    DateTime              // Дата изменения
  
  notes         String?               // Примечания
  
  createdAt     DateTime              @default(now())
  
  @@index([managerId])
  @@index([changeDate])
}

// Курсы (иерархия). Это сами курсы, без хранения контента, только учет статусов.
model TrainingProgram {
  id            String              @id @default(uuid())
  name          String              // Название курса/программы
  type          TrainingType        // ОБЯЗАТЕЛЬНЫЙ_МОДУЛЬ или ДОП_ПРОГРАММА
  parentId      String?             // Родитель для иерархии (для доп. программ)
  parent        TrainingProgram?    @relation("ProgramHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  children      TrainingProgram[]   @relation("ProgramHierarchy")
  order         Int                 @default(0)
  isRequired    Boolean             @default(false) // Флаг обязательного (для быстрых фильтров)
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  progress      TrainingProgress[]

  @@index([parentId])
  @@index([type])
  @@index([isRequired])
}

// Прогресс прохождения обучения (для обязательных и доп. курсов)
model TrainingProgress {
  id                String              @id @default(uuid())
  managerId         String
  manager           Manager             @relation(fields: [managerId], references: [id], onDelete: Cascade)
  trainingProgramId String
  trainingProgram   TrainingProgram    @relation(fields: [trainingProgramId], references: [id], onDelete: Cascade)
  status            TrainingStatus      @default(НЕ_НАЧАЛ)
  completionDate    DateTime?           // Дата прохождения (если завершено)
  
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  
  @@unique([managerId, trainingProgramId])
  @@index([managerId])
  @@index([status])
}

// Комментарии к обучению (опционально, если нужен учет примечаний)
model TrainingComment {
  id                String              @id @default(uuid())
  managerId         String
  manager           Manager             @relation(fields: [managerId], references: [id], onDelete: Cascade)
  trainingProgramId String
  trainingProgram   TrainingProgram     @relation(fields: [trainingProgramId], references: [id], onDelete: Cascade)
  comment           String              @db.Text
  authorId          String              // ID автора комментария
  author            User                @relation(fields: [authorId], references: [id])
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  @@index([managerId])
}

// Статус сдачи домашних заданий (привязка к курсу)
model HomeworkStatus {
  id                String              @id @default(uuid())
  managerId         String
  manager           Manager             @relation(fields: [managerId], references: [id], onDelete: Cascade)
  trainingProgramId String
  trainingProgram   TrainingProgram     @relation(fields: [trainingProgramId], references: [id], onDelete: Cascade)
  status            HomeworkStatus      @default(НЕ_СДАНО)
  checkerId         String?             // Проверяющий
  checker           User?               @relation(fields: [checkerId], references: [id])
  submissionDate    DateTime?
  checkDate         DateTime?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  @@unique([managerId, trainingProgramId])
  @@index([managerId])
  @@index([status])
}
```

## 4. Функциональные требования

### 4.1. Отображение данных управляющих

Для каждого управляющего отображаются данные из существующих таблиц:

**Из User/UserData:**
- ФИО (`User.name` или `UserData.fio`)
- Email (`User.email`)
- Текущая должность (`User.position` или `Position.name`)
- Категория (`Group.name` через Position)
- Текущий филиал (`Branch.name`, `Branch.code`)
- РРС (`Branch.rrs`)
- Локация (`Branch.city`)
- Численность филиала (можно добавить в Branch или считать из UserData)
- Формат филиала (`Branch.type`)
- Количество филиалов в управлении (вычисляется или хранится в Manager)
- Непосредственный руководитель (нужно определить логику)
- Ссылка на карточку сотрудника (используется существующий роутинг)
- Номер телефона (если есть в системе)

**Статус управляющего (используем `UserData.status`, значения на русском):**
- `АКТИВЕН` — действующий
- `ПОНИЖЕН` — понижен
- `УВОЛЕН` — уволен

Рекомендуется маппить `UserData.status` напрямую на `Manager.status` (и хранить значения в русском виде).

### 4.2. История кадровых изменений

**Требования:**
- Сохраняется только для тех, кто проходил хоть одно обучение
- Типы изменений: назначение, перевод, понижение, увольнение
- История доступна для анализа
- Уволенные/пониженные без обучения удаляются из списка (но остаются в UserData)

**Реализация:**
- При создании записи в `TrainingProgress` автоматически создается запись в `Manager` (если её нет)
- При кадровых изменениях создается запись в `EmploymentHistory`
- Фильтр по статусу управляющего

### 4.3. Блок учета обучения

#### 4.3.1. Обязательное обучение (3 модуля)

**Структура:**
- 3 предустановленных модуля в `MandatoryModule`
- Каждый модуль фиксируется отдельно в `TrainingProgress`
- Статусы: NOT_STARTED, IN_PROGRESS, COMPLETED_DISTANCE, COMPLETED_ONSITE
- Дата прохождения в `completionDate`

**UI:**
- Таблица/список модулей с возможностью редактирования статуса
- Выбор даты прохождения
- Визуальное отображение статуса (цвет, иконка)

#### 4.3.2. Дополнительные обучающие программы

**Структура:**
- Иерархическая структура через `parentId` в `TrainingProgram`
- Неограниченная вложенность
- Возможность добавления новых программ без изменения структуры

**UI:**
- Древовидная структура программ
- Возможность добавления/редактирования/удаления программ
- Привязка прогресса к конкретной программе

#### 4.3.3. Комментарии

**Структура:**
- Комментарий привязан к управляющему и конкретному обучению (модуль или программа)
- Автор комментария сохраняется
- Дата создания/обновления

**UI:**
- Поле для ввода комментария под каждым модулем/программой
- История комментариев (если нужно)

#### 4.3.4. Сдача работ

**Структура:**
- Отметки: выполнено, проверено, отправлена ОС
- ФИО проверяющего (связь с User)
- Даты сдачи и проверки (опционально)

**UI:**
- Чекбоксы для статусов
- Выбор проверяющего из списка пользователей
- Календарь для дат

### 4.4. Фильтры и аналитика

#### 4.4.1. Фильтры

**По РРС:**
- Используется `Branch.rrs`
- Множественный выбор

**По филиалу:**
- Используется `Branch.name` или `Branch.code`
- Множественный выбор

**По статусу управляющего:**
- ACTIVE, DEMOTED, FIRED
- Одиночный или множественный выбор

**По прохождению конкретного обучения:**
- Выбор модуля или программы
- Фильтр по статусу прохождения

**По статусу прохождения обучения:**
- NOT_STARTED, IN_PROGRESS, COMPLETED_DISTANCE, COMPLETED_ONSITE
- Множественный выбор

**По сдаче домашних заданий:**
- Фильтр по статусам: выполнено/не выполнено, проверено/не проверено, ОС отправлена/не отправлена

#### 4.4.2. Сортировка

- По РРС
- По филиалу
- По статусу управляющего
- По дате прохождения модуля
- По статусу прохождения обучения
- По дате кадрового изменения

#### 4.4.3. Экспорт в Excel

**Функционал:**
- Экспорт по любому срезу (с учетом всех фильтров)
- Включает все данные: ФИО, филиал, РРС, статус, модули, программы, комментарии, сдача работ
- Формат: .xlsx
- Использование библиотеки (например, `xlsx` или `exceljs`)

#### 4.4.4. Печать

**Функционал:**
- Печать данных в любом срезе
- Форматирование для печати
- Возможность выбора колонок для печати

### 4.5. Ключевые вопросы (быстрые ответы)

**"Кто не прошел обязательное обучение":**
- Фильтр: статус модуля = NOT_STARTED или IN_PROGRESS
- Группировка по модулям

**"Кто не прошел любое другое обучение":**
- Фильтр: статус программы = NOT_STARTED или IN_PROGRESS
- Группировка по программам

## 5. Архитектура решения

### 5.1. Backend структура

```
backend/
  controllers/
    training/
      managers.ts          // CRUD управляющих
      training.ts         // Управление обучением
      modules.ts          // Обязательные модули
      programs.ts         // Дополнительные программы
      comments.ts         // Комментарии
      homework.ts         // Домашние задания
      export.ts           // Экспорт в Excel
      analytics.ts        // Аналитика
  routes/
    training/
      managers.ts
      training.ts
      modules.ts
      programs.ts
      comments.ts
      homework.ts
      export.ts
      analytics.ts
```

### 5.2. Frontend структура

```
frontend/src/features/
  Training/
    Training.tsx              // Главная страница
    components/
      ManagerList.tsx         // Список управляющих
      ManagerCard.tsx         // Карточка управляющего
      TrainingProgress.tsx    // Прогресс обучения
      MandatoryModules.tsx    // Обязательные модули
      AdditionalPrograms.tsx  // Дополнительные программы
      Comments.tsx            // Комментарии
      HomeworkStatus.tsx      // Статус сдачи работ
      Filters.tsx             // Фильтры
      ExportButton.tsx        // Кнопка экспорта
    data/
      TrainingData.tsx        // API запросы
```

### 5.3. API Endpoints

```
GET    /training/managers              // Список управляющих (с фильтрами)
GET    /training/managers/:id          // Детали управляющего
PUT    /training/managers/:id/status   // Изменение статуса

GET    /training/modules               // Список обязательных модулей
POST   /training/modules               // Создание модуля (только для админов)
PUT    /training/modules/:id           // Обновление модуля
DELETE /training/modules/:id           // Удаление модуля

GET    /training/programs               // Список программ (дерево)
POST   /training/programs               // Создание программы
PUT    /training/programs/:id           // Обновление программы
DELETE /training/programs/:id           // Удаление программы

GET    /training/progress/:managerId    // Прогресс обучения управляющего
POST   /training/progress               // Создание/обновление прогресса
PUT    /training/progress/:id           // Обновление прогресса

GET    /training/comments/:managerId    // Комментарии управляющего
POST   /training/comments               // Создание комментария
PUT    /training/comments/:id           // Обновление комментария
DELETE /training/comments/:id           // Удаление комментария

GET    /training/homework/:managerId    // Статусы сдачи работ
POST   /training/homework               // Создание/обновление статуса
PUT    /training/homework/:id           // Обновление статуса

GET    /training/employment-history/:managerId  // История кадровых изменений
POST   /training/employment-history             // Создание записи истории

GET    /training/export                 // Экспорт в Excel (с query параметрами фильтров)
GET    /training/analytics              // Аналитика (статистика)
```

## 6. UI/UX требования

### 6.1. Главная страница

**Структура:**
- Слева: панель фильтров
- Центр: таблица/карточки управляющих
- Справа (опционально): детали выбранного управляющего

**Таблица управляющих:**
- Колонки: ФИО, Филиал, РРС, Статус, Модули (статусы), Программы, Действия
- Сортировка по любой колонке
- Клик по строке открывает детали

### 6.2. Карточка управляющего

**Вкладки:**
1. **Общая информация:**
   - Данные из User/UserData/Branch
   - Статус управляющего
   - История кадровых изменений

2. **Обязательное обучение:**
   - Список 3 модулей
   - Статус каждого модуля
   - Дата прохождения
   - Комментарии
   - Сдача работ

3. **Дополнительные программы:**
   - Древовидная структура программ
   - Статус прохождения
   - Дата прохождения
   - Комментарии
   - Сдача работ

### 6.3. Фильтры

**Панель фильтров:**
- Множественный выбор для РРС, филиалов
- Одиночный/множественный выбор для статусов
- Поиск по ФИО
- Кнопка "Сбросить фильтры"

### 6.4. Экспорт

**Кнопка экспорта:**
- Расположена в шапке таблицы
- При клике открывается модалка с выбором колонок для экспорта
- Прогресс экспорта (для больших объемов)

## 7. Миграции и развертывание

### 7.1. Миграции Prisma

1. Создать enum'ы (ManagerStatus, TrainingStatus, etc.)
2. Создать модели (Manager, EmploymentHistory, MandatoryModule, etc.)
3. Создать связи с существующими моделями (User, Branch, Position)
4. Создать индексы для производительности

### 7.2. Начальные данные

**Обязательные модули:**
- Создать 3 записи в `MandatoryModule` при миграции
- Названия модулей задаются администратором

### 7.3. Доступы

**Роли:**
- DEVELOPER, ADMIN - полный доступ
- SUPERVISOR - просмотр и редактирование обучения
- EMPLOYEE - только просмотр (если нужно)

**Инструмент:**
- Создать Tool в таблице Tool с link = "training/managers"
- Настроить доступы через UserToolAccess/PositionToolAccess/GroupToolAccess

## 8. Производительность

### 8.1. Оптимизация запросов

- Индексы на часто используемые поля (managerId, status, completionDate)
- Пагинация для списка управляющих
- Ленивая загрузка деталей обучения

### 8.2. Кэширование

- Кэширование списка модулей и программ (редко меняются)
- Кэширование фильтров (РРС, филиалы)

## 9. Тестирование

### 9.1. Unit тесты

- Логика фильтрации
- Логика экспорта
- Валидация данных

### 9.2. Integration тесты

- API endpoints
- Связи между моделями
- Экспорт в Excel

## 10. Документация

- API документация (Swagger/OpenAPI)
- Руководство пользователя
- Инструкция по настройке модулей и программ
