import { prisma } from '../server.js';

/**
 * Универсальная функция для получения Tool по его link
 * @param link - ссылка на tool (например, 'education/training', 'retail/shop')
 * @returns Promise с tool или null если не найден
 */
export const getToolByLink = async (link: string) => {
  const tool = await prisma.tool.findFirst({
    where: { link },
  });

  if (!tool) {
    return null;
  }

  return tool;
};

/**
 * Универсальная функция для получения Tool по его link с выбрасыванием ошибки если не найден
 * @param link - ссылка на tool
 * @param errorMessage - сообщение об ошибке (опционально)
 * @returns Promise с tool
 * @throws Error если tool не найден
 */
export const getToolByLinkOrThrow = async (link: string, errorMessage?: string) => {
  const tool = await getToolByLink(link);
  
  if (!tool) {
    throw new Error(errorMessage || `Tool с link "${link}" не найден в базе данных`);
  }
  
  return tool;
};
