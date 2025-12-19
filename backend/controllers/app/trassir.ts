import { Request, Response } from "express";
import { prisma } from '../../server.js';

// Отключаем проверку SSL для self-signed сертификатов Trassir (как verify=False в Python)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Конфигурация Trassir сервера из .env
const TRASSIR_CONFIG = {
  address: process.env.TRASSIR_ADDRESS || '',
  username: process.env.TRASSIR_USERNAME || '',
  password: process.env.TRASSIR_PASSWORD || '',
  botToken: process.env.TRASSIR_BOT_TOKEN || '',
  botName: process.env.TRASSIR_BOT_NAME || ''
};

let trassirSid: string | null = null;
let loginTime = 0;

// Авторизация на сервере Trassir
const trassirLogin = async (): Promise<boolean> => {
  try {
    if (trassirSid && Date.now() / 1000 - loginTime < 880) {
      return true;
    }

    const url = `https://${TRASSIR_CONFIG.address}/login?username=${TRASSIR_CONFIG.username}&password=${TRASSIR_CONFIG.password}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
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
    console.error('Trassir login error:', error);
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
      body: JSON.stringify(params)
    });

    if (response.ok) {
      loginTime = Date.now() / 1000;
      return await response.json();
    }
    return {};
  } catch (error) {
    console.error('Trassir request error:', error);
    return {};
  }
};

// Получить список пользователей
export const getPersons = async (req: Request, res: Response) => {
  try {
    const data = await trassirRequest('persons-folders-list-all');
    const persons = data.persons || [];
    
    // Получаем дополнительные атрибуты
    const guids = persons.map((p: any) => p.guid);
    if (guids.length > 0) {
      const details = await trassirRequest('persons-info', { person_guids: guids });
      const detailsMap = new Map();
      
      (details.persons || []).forEach((p: any) => {
        detailsMap.set(p.guid, {
          tg_id: p.pacs?.attributes?.tg_id || 0,
          blocked: p.pacs?.blocked || false
        });
      });

      const enrichedPersons = persons.map((p: any) => ({
        guid: p.guid,
        name: p.name,
        folder_guid: p.folder_guid,
        ...detailsMap.get(p.guid)
      }));

      return res.json(enrichedPersons);
    }

    res.json(persons);
  } catch (error) {
    console.error('Error getting persons:', error);
    res.status(500).json({ error: 'Failed to get persons' });
  }
};

// Получить список дверей
export const getDoors = async (req: Request, res: Response) => {
  try {
    const data = await trassirRequest('devices-and-points-list');
    const doors: { id: number; name: string }[] = [];

    (data.points || []).forEach((point: any) => {
      if (point.name.startsWith('_')) {
        const florIndex = point.name.indexOf('flor');
        const name = florIndex > 0 
          ? point.name.substring(1, florIndex - 2).trim() 
          : point.name.substring(1);
        doors.push({ id: point.id, name });
      }
    });

    res.json(doors);
  } catch (error) {
    console.error('Error getting doors:', error);
    res.status(500).json({ error: 'Failed to get doors' });
  }
};

// Открыть дверь
export const openDoor = async (req: Request, res: Response) => {
  try {
    const { doorId } = req.params;
    const data = await trassirRequest('access-point-open-once', {
      access_point_id: parseInt(doorId),
      language: 'en'
    });

    res.json({ opened: data.opened || false });
  } catch (error) {
    console.error('Error opening door:', error);
    res.status(500).json({ error: 'Failed to open door' });
  }
};

// Получить статистику открытий дверей
export const getDoorStats = async (req: Request, res: Response) => {
  try {
    const { limit = 100 } = req.query;
    
    const logs = await prisma.trassirDoorLog.findMany({
      orderBy: { openedAt: 'desc' },
      take: Number(limit)
    });

    res.json(logs);
  } catch (error) {
    console.error('Error getting door stats:', error);
    res.json([]);
  }
};

// Заблокировать/разблокировать пользователя
export const togglePersonBlock = async (req: Request, res: Response) => {
  try {
    const { personGuid } = req.params;
    const { blocked } = req.body;

    const personData = await trassirRequest('persons-info', { person_guids: [personGuid] });
    const person = personData.persons?.[0];

    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    person.pacs.blocked = blocked;
    person.comment = blocked ? 'Blocked from admin panel' : 'Unblocked from admin panel';

    const result = await trassirRequest('persons-edit', {
      language: 'en',
      persons: [person]
    });

    res.json({ success: Object.keys(result).length > 0 });
  } catch (error) {
    console.error('Error toggling person block:', error);
    res.status(500).json({ error: 'Failed to update person' });
  }
};

// Сбросить привязку Telegram
export const clearPersonTelegram = async (req: Request, res: Response) => {
  try {
    const { personGuid } = req.params;

    const personData = await trassirRequest('persons-info', { person_guids: [personGuid] });
    const person = personData.persons?.[0];

    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    person.pacs.attributes = { tg_id: 0 };
    person.comment = 'tg_id=0';

    const result = await trassirRequest('persons-edit', {
      language: 'en',
      persons: [person]
    });

    res.json({ success: Object.keys(result).length > 0 });
  } catch (error) {
    console.error('Error clearing telegram:', error);
    res.status(500).json({ error: 'Failed to clear telegram' });
  }
};

