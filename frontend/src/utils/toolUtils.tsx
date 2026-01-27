import { API } from '../config/constants';
import { fetchWithAuth } from './fetchWithAuth';

export interface Tool {
  id: string;
  name: string;
  link: string;
  icon?: string;
  description?: string;
  order?: number;
}

/**
 * Получить tool по его link
 * @param link - ссылка на tool (например, 'education/training', 'retail/shop')
 * @returns Promise с tool или null если не найден
 */
export const getToolByLink = async (link: string): Promise<Tool | null> => {
  try {
    const response = await fetchWithAuth(`${API}/navigation/all`);
    if (!response.ok) {
      return null;
    }
    const tools = await response.json();
    return tools.find((t: Tool) => t.link === link) || null;
  } catch (error) {
    console.error(`❌ Ошибка при получении tool по link "${link}":`, error);
    return null;
  }
};

/**
 * Получить все tools
 * @returns Promise с массивом всех tools
 */
export const getAllTools = async (): Promise<Tool[]> => {
  try {
    const response = await fetchWithAuth(`${API}/navigation/all`);
    if (!response.ok) {
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error('❌ Ошибка при получении tools:', error);
    return [];
  }
};
