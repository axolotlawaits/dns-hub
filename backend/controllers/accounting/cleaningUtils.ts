import { prisma } from '../../server.js';

// Получить tool для cleaning
export async function getCleaningTool() {
  try {
    const tool = await prisma.tool.findFirst({
      where: {
        link: {
          contains: 'accounting/cleaning',
        },
      },
    });
    
    if (!tool) {
      // Если tool не найден, можно создать его или вернуть null
      console.warn('[Cleaning] Tool not found for accounting/cleaning');
    }
    
    return tool;
  } catch (error) {
    console.error('[Cleaning] Error getting tool:', error);
    return null;
  }
}
