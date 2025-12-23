/**
 * Скрипт для загрузки типов отправителей и документов в таблицу Type
 * для модуля Correspondence
 * 
 * Запуск: node backend/scripts/load-correspondence-types.js
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Структура типов отправителей
const senderTypesStructure = [
  {
    name: 'Суд',
    children: [
      {
        name: 'Федеральные суды',
        children: [
          { name: 'Суды общей юрисдикции' },
          { name: 'Арбитражный суд' },
          { name: 'Специализированные суды' },
        ],
      },
      { name: 'Мировые судьи' },
    ],
  },
  { name: 'ФССП' },
  { name: 'МВД' },
  { name: 'ФНС' },
  { name: 'СК' },
  { name: 'Прокуратура' },
  { name: 'ФСБ' },
  { name: 'Роспотребнадзор' },
  { name: 'Роскомнадзор' },
  { name: 'Физическое лицо' },
  { name: 'Юридическое лицо' },
  { name: 'Иное' },
];

// Типы документов
const documentTypes = [
  'Исковое заявление',
  'Повестка',
  'Решение',
  'Определение',
  'Постановление',
  'Запрос',
  'Представление',
  'Заявление',
  'Претензия',
  'Жалоба',
  'Исполнительный лист',
  'Иное',
];

/**
 * Получить или создать Tool для корреспонденции
 */
async function getCorrespondenceTool() {
  let tool = await prisma.tool.findFirst({
    where: { link: 'aho/correspondence' },
  });

  if (!tool) {
    tool = await prisma.tool.create({
      data: {
        name: 'Корреспонденция',
        icon: '📮',
        link: 'aho/correspondence',
        description: 'Управление входящей и исходящей корреспонденцией',
        order: 100,
        included: true,
      },
    });
    console.log('✅ Создан Tool для корреспонденции:', tool.id);
  } else {
    console.log('✅ Найден существующий Tool для корреспонденции:', tool.id);
  }

  return tool;
}

/**
 * Создать или обновить тип
 */
async function createOrUpdateType(toolId, chapter, name, parentId = null, sortOrder = 0) {
  // Ищем существующий тип
  const existingType = await prisma.type.findFirst({
    where: {
      model_uuid: toolId,
      chapter: chapter,
      name: name,
      parent_type: parentId,
    },
  });

  if (existingType) {
    // Обновляем sortOrder если изменился
    if (existingType.sortOrder !== sortOrder) {
      await prisma.type.update({
        where: { id: existingType.id },
        data: { sortOrder },
      });
      console.log(`  ↻ Обновлен тип: ${name} (sortOrder: ${sortOrder})`);
    } else {
      console.log(`  ✓ Тип уже существует: ${name}`);
    }
    return existingType;
  }

  // Создаем новый тип
  const newType = await prisma.type.create({
    data: {
      model_uuid: toolId,
      chapter: chapter,
      name: name,
      parent_type: parentId,
      sortOrder: sortOrder,
    },
  });
  console.log(`  + Создан тип: ${name}`);
  return newType;
}

/**
 * Рекурсивно создать типы отправителей
 */
async function createSenderTypes(toolId, items, parentId = null, sortOrder = 0) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const currentSortOrder = sortOrder + i;

    // Создаем родительский тип
    const type = await createOrUpdateType(
      toolId,
      'Отправитель',
      item.name,
      parentId,
      currentSortOrder
    );

    // Если есть подтипы, создаем их рекурсивно
    if (item.children && item.children.length > 0) {
      await createSenderTypes(toolId, item.children, type.id, 0);
    }
  }
}

/**
 * Создать типы документов
 */
async function createDocumentTypes(toolId) {
  for (let i = 0; i < documentTypes.length; i++) {
    await createOrUpdateType(
      toolId,
      'Тип документа',
      documentTypes[i],
      null,
      i
    );
  }
}

/**
 * Очистить существующие типы (опционально)
 */
async function clearExistingTypes(toolId) {
  const deletedSenderTypes = await prisma.type.deleteMany({
    where: {
      model_uuid: toolId,
      chapter: 'Отправитель',
    },
  });

  const deletedDocumentTypes = await prisma.type.deleteMany({
    where: {
      model_uuid: toolId,
      chapter: 'Тип документа',
    },
  });

  console.log(`🗑️  Удалено типов отправителей: ${deletedSenderTypes.count}`);
  console.log(`🗑️  Удалено типов документов: ${deletedDocumentTypes.count}`);
}

/**
 * Главная функция
 */
async function main() {
  try {
    console.log('🚀 Начало загрузки типов для модуля Correspondence...\n');

    // Получаем или создаем Tool
    const tool = await getCorrespondenceTool();
    console.log('');

    // Опционально: очистить существующие типы
    // Раскомментируйте следующую строку, если хотите пересоздать все типы
    // await clearExistingTypes(tool.id);
    // console.log('');

    // Создаем типы отправителей
    console.log('📋 Создание типов отправителей...');
    await createSenderTypes(tool.id, senderTypesStructure);
    console.log('✅ Типы отправителей созданы\n');

    // Создаем типы документов
    console.log('📄 Создание типов документов...');
    await createDocumentTypes(tool.id);
    console.log('✅ Типы документов созданы\n');

    console.log('✨ Загрузка завершена успешно!');
  } catch (error) {
    console.error('❌ Ошибка при загрузке типов:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск скрипта
main()
  .then(() => {
    console.log('\n✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });

