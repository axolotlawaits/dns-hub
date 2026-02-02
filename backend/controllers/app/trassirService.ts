// Сервис для работы с Trassir API (двери)
import { prisma } from '../../server.js';

// Отключаем проверку SSL для self-signed сертификатов Trassir
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Конфигурация Trassir сервера из .env
const TRASSIR_CONFIG = {
  address: process.env.TRASSIR_ADDRESS || '',
  username: process.env.TRASSIR_USERNAME || '',
  password: process.env.TRASSIR_PASSWORD || ''
};

let trassirSid: string | null = null;
let loginTime = 0;

// Кэш дверей
const doorsCache: Map<number, string> = new Map();
let lastDoorsUpdate = 0;
const DOORS_CACHE_TTL = 60 * 60 * 1000; // 1 час

// Маппинг ID дверей на русские названия
const DOOR_NAME_MAPPING: Record<number, string> = {
  13: '3 Этаж',
  14: '4 Этаж',
  15: '5 Этаж',
  16: '6 Этаж',
  21: 'Лифт 2 Этаж',
  22: 'Чёрный вход',
  23: 'Задняя лестница 2 этаж',
  25: 'Главный вход',
  26: 'Фойе лифта 1 этаж'
};

// ID дверей для подменю "3-6 Этаж"
const FLOORS_SUBMENU_DOORS = [13, 14, 15, 16];

// ID дверей, которые нужно скрыть
const HIDDEN_DOORS = [17, 18, 19, 20, 24, 27, 28];

// Авторизация на сервере Trassir
const trassirLogin = async (): Promise<boolean> => {
  try {
    if (trassirSid && Date.now() / 1000 - loginTime < 880) {
      return true;
    }

    const url = `https://${TRASSIR_CONFIG.address}/login?username=${TRASSIR_CONFIG.username}&password=${TRASSIR_CONFIG.password}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        trassirSid = data.sid;
        loginTime = Date.now() / 1000;
        return true;
      }
    }
    return false;
  } catch (error) {
    return false;
  }
};

// Запрос к Trassir API
const trassirRequest = async (endpoint: string, params: any = { language: 'en' }): Promise<any> => {
  try {
    if (!await trassirLogin()) {
      throw new Error('Failed to login to Trassir');
    }

    const url = `https://${TRASSIR_CONFIG.address}/s/pacs/${endpoint}?sid=${trassirSid}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10000)
    });

    if (response.ok) {
      loginTime = Date.now() / 1000;
      return await response.json();
    }
    return {};
  } catch (error) {
    console.error('[Trassir] Request error:', error);
    return {};
  }
};

// Загрузка списка дверей
export const loadDoors = async (): Promise<Map<number, string>> => {
  // Используем кэш если он свежий
  if (doorsCache.size > 0 && Date.now() - lastDoorsUpdate < DOORS_CACHE_TTL) {
    return doorsCache;
  }

  try {
    const data = await trassirRequest('devices-and-points-list');
    doorsCache.clear();

    (data.points || []).forEach((point: any) => {
      // Пропускаем скрытые двери
      if (HIDDEN_DOORS.includes(point.id)) {
        return;
      }
      
      if (point.name.startsWith('_')) {
        const florIndex = point.name.indexOf('flor');
        const name = florIndex > 0 
          ? point.name.substring(1, florIndex - 2).trim() 
          : point.name.substring(1);
        // Применяем переименование, если оно есть
        const displayName = DOOR_NAME_MAPPING[point.id] || name;
        doorsCache.set(point.id, displayName);
      }
    });
    
    lastDoorsUpdate = Date.now();
  } catch (error) {
    console.error('[Trassir] Error loading doors:', error);
  }

  return doorsCache;
};

// Получить список дверей
export const getDoors = async (includeAdditional: boolean = false): Promise<Map<number, string>> => {
  if (doorsCache.size === 0) {
    await loadDoors();
  }
  
  // Если нужны дополнительные двери, загружаем их отдельно
  if (includeAdditional) {
    try {
      const data = await trassirRequest('devices-and-points-list');
      const allDoors = new Map<number, string>(doorsCache);
      
      (data.points || []).forEach((point: any) => {
        // Пропускаем скрытые двери
        if (HIDDEN_DOORS.includes(point.id)) {
          return;
        }
        
        if (!point.name.startsWith('_')) {
          // Добавляем дополнительные двери (не начинающиеся с _)
          // Применяем переименование, если оно есть
          const displayName = DOOR_NAME_MAPPING[point.id] || point.name;
          allDoors.set(point.id, displayName);
        }
      });
      
      return allDoors;
    } catch (error) {
      console.error('[Trassir] Error loading additional doors:', error);
      return doorsCache;
    }
  }
  
  return doorsCache;
};

// Открыть дверь
export const openDoor = async (doorId: number, personName?: string, tgId?: number): Promise<boolean> => {
  try {
    const data = await trassirRequest('access-point-open-once', {
      access_point_id: doorId,
      language: 'en'
    });
    
    if (data.opened) {
      // Логируем открытие двери
      try {
        // Используем переименованное название, если оно есть
        const doorName = DOOR_NAME_MAPPING[doorId] || doorsCache.get(doorId) || null;
        await prisma.trassirDoorLog.create({
          data: {
            doorId,
            doorName,
            personName: personName || null,
            tgId: tgId || null
          }
        });
      } catch (err) {
        console.error('[Trassir] Error logging to DB:', err);
      }
    }
    
    return data.opened || false;
  } catch (error) {
    console.error('[Trassir] Error opening door:', error);
    return false;
  }
};

// Найти дверь по имени
export const findDoorByName = async (name: string, includeAdditional: boolean = false): Promise<{ id: number; name: string } | null> => {
  const doors = await getDoors(includeAdditional);
  for (const [id, doorName] of doors) {
    if (doorName === name) {
      return { id, name: doorName };
    }
  }
  return null;
};

// Получить двери для подменю "3-6 Этаж"
export const getFloorsSubmenuDoors = async (includeAdditional: boolean = false): Promise<Map<number, string>> => {
  const allDoors = await getDoors(includeAdditional);
  const submenuDoors = new Map<number, string>();
  
  FLOORS_SUBMENU_DOORS.forEach((doorId) => {
    const doorName = allDoors.get(doorId);
    if (doorName) {
      submenuDoors.set(doorId, doorName);
    }
  });
  
  return submenuDoors;
};

// Проверить, является ли текст названием подменю
export const isSubmenuTrigger = (text: string): boolean => {
  return text === '3-6 Этаж';
};

// Проверить, настроен ли Trassir
export const isTrassirConfigured = (): boolean => {
  return !!(TRASSIR_CONFIG.address && TRASSIR_CONFIG.username && TRASSIR_CONFIG.password);
};

// Получить ВСЕ точки доступа (без фильтрации)
export const getAllAccessPoints = async (): Promise<any[]> => {
  try {
    const data = await trassirRequest('devices-and-points-list');
    return data.points || [];
  } catch (error) {
    console.error('[Trassir] Error getting all access points:', error);
    return [];
  }
};

// Объект-сервис для совместимости с роутами
export const trassirService = {
  getDoorsList: () => {
    const result: { id: number; name: string }[] = [];
    doorsCache.forEach((name, id) => {
      result.push({ id, name });
    });
    return result;
  },
  openDoor,
  loadDoors,
  getAllAccessPoints
};

