/**
 * Скрипт для экспорта типов корреспонденции из базы данных
 * 
 * Запуск: node backend/scripts/export-correspondence-types.js
 * 
 * Выводит SQL INSERT запросы для переноса типов в другую базу данных
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function exportTypes() {
  try {
    console.log('📤 Экспорт типов корреспонденции...\n');

    // Находим Tool для корреспонденции
    const tool = await prisma.tool.findFirst({
      where: { link: 'aho/correspondence' },
    });

    if (!tool) {
      console.error('❌ Tool для корреспонденции не найден');
      return;
    }

    console.log(`✅ Найден Tool: ${tool.id}\n`);

    // Получаем все типы отправителей и документов
    const types = await prisma.type.findMany({
      where: {
        model_uuid: tool.id,
        OR: [
          { chapter: 'Отправитель' },
          { chapter: 'Тип документа' }
        ]
      },
      orderBy: [
        { chapter: 'asc' },
        { sortOrder: 'asc' },
        { name: 'asc' }
      ]
    });

    if (types.length === 0) {
      console.log('⚠️  Типы не найдены');
      return;
    }

    console.log(`📋 Найдено типов: ${types.length}\n`);

    // Генерируем SQL
    console.log('-- SQL для переноса типов корреспонденции');
    console.log('-- Сначала убедитесь, что Tool существует в целевой базе данных');
    console.log(`-- Tool ID: ${tool.id}\n`);

    console.log('-- Создание Tool (если не существует)');
    console.log(`INSERT INTO "Tool" (id, name, icon, link, description, "order", included, "createdAt", "updatedAt")`);
    console.log(`VALUES ('${tool.id}', 'Корреспонденция', '📮', 'aho/correspondence', 'Управление входящей и исходящей корреспонденцией', 100, true, NOW(), NOW())`);
    console.log(`ON CONFLICT (id) DO NOTHING;\n`);

    console.log('-- Вставка типов');
    console.log('BEGIN;');
    
    for (const type of types) {
      const parentType = type.parent_type ? `'${type.parent_type}'` : 'NULL';
      const colorHex = type.colorHex ? `'${type.colorHex}'` : 'NULL';
      
      console.log(`INSERT INTO "Type" (id, "model_uuid", chapter, name, "parent_type", "colorHex", "sortOrder", "createdAt", "updatedAt")`);
      console.log(`VALUES ('${type.id}', '${type.model_uuid}', '${type.chapter}', '${type.name.replace(/'/g, "''")}', ${parentType}, ${colorHex}, ${type.sortOrder || 0}, NOW(), NOW())`);
      console.log(`ON CONFLICT (id) DO UPDATE SET`);
      console.log(`  "sortOrder" = EXCLUDED."sortOrder",`);
      console.log(`  "parent_type" = EXCLUDED."parent_type",`);
      console.log(`  "updatedAt" = NOW();`);
      console.log('');
    }

    console.log('COMMIT;');
    console.log('\n✅ Экспорт завершен');

    // Также выводим JSON для альтернативного способа
    console.log('\n--- Альтернативно: JSON формат ---');
    console.log(JSON.stringify({
      toolId: tool.id,
      types: types.map(t => ({
        id: t.id,
        chapter: t.chapter,
        name: t.name,
        parent_type: t.parent_type,
        colorHex: t.colorHex,
        sortOrder: t.sortOrder || 0
      }))
    }, null, 2));

  } catch (error) {
    console.error('❌ Ошибка при экспорте:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

exportTypes()
  .then(() => {
    console.log('\n✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });

