import { prisma } from "../../server.js";
import { Request, Response } from "express";

export const heartbeatStore: Map<string, number> = new Map();

function sanitizeString(input: any, fallback: string = ""): string {
  if (typeof input !== 'string') {
    input = String(input ?? fallback);
  }
  return input.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

function sanitizeUuid(input: any): string {
  const s = sanitizeString(input);
  const cleaned = s.replace(/[^a-fA-F0-9-]/g, '');
  return cleaned;
}

function hasControlChars(str: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(str);
}

// Создание или обновление устройства
export const createOrUpdateDevice = async (req: Request, res: Response): Promise<any> => {
  const { userEmail, branchType, deviceName, vendor, network, number, app, os, deviceIP: deviceIPFromBody, ip } = req.body;

  console.log('Device registration request:', {
    userEmail,
    branchType,
    deviceName,
    vendor,
    network,
    number,
    app,
    os,
    deviceIP: deviceIPFromBody,
    ip,
    'req.ip': req.ip,
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'x-real-ip': req.headers['x-real-ip']
  });

  if (!userEmail || !branchType) {
    return res.status(400).json({ error: 'userEmail и branchType обязательны' });
  }

  try {
    // Получаем данные пользователя и его филиал
    const user = await prisma.user.findFirst({ 
      where: { email: userEmail.toLowerCase() }, 
      select: { id: true } 
    });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const userData = await prisma.userData.findUnique({ 
      where: { email: userEmail.toLowerCase() }, 
      select: { branch_uuid: true } 
    });
    if (!userData) {
      return res.status(404).json({ error: 'Пользователь не найден в UserData' });
    }

    const branchId = sanitizeUuid(userData.branch_uuid);
    if (!branchId) {
      return res.status(400).json({ error: 'Некорректный branchId' });
    }

    // Транзакция для атомарности операций
    const result = await prisma.$transaction(async (tx) => {
      // Обновляем филиал
      const updatedBranch = await tx.branch.update({
        where: { uuid: branchId },
        data: { typeOfDist: sanitizeString(branchType) },
        select: { uuid: true, name: true, typeOfDist: true }
      }).catch(async (e) => {
        const exists = await tx.branch.findUnique({ where: { uuid: branchId }, select: { uuid: true } });
        if (!exists) return null;
        throw e;
      });

      if (!updatedBranch) {
        throw new Error('Филиал не найден');
      }

      // Подготавливаем данные устройства
      // Приоритет: полный IP от устройства > network+number > заголовки прокси > req.ip
      let deviceIP = 'Unknown';
      let networkIP = '';
      let deviceNumber = '1';
      
      // Проверяем, есть ли полный IP адрес от устройства
      const fullDeviceIP = deviceIPFromBody || ip;
      if (fullDeviceIP && typeof fullDeviceIP === 'string' && fullDeviceIP.includes('.')) {
        // Разбираем полный IP адрес
        const ipParts = fullDeviceIP.split('.');
        if (ipParts.length === 4) {
          deviceIP = fullDeviceIP;
          networkIP = ipParts.slice(0, 3).join('.') + '.';
          deviceNumber = ipParts[3];
          console.log('Using full device IP:', deviceIP, '-> network:', networkIP, 'number:', deviceNumber);
        }
      } else if (network && number) {
        // Используем IP адрес, отправленный устройством
        deviceIP = `${network}${number}`;
        networkIP = network;
        deviceNumber = number;
        console.log('Using device-provided IP:', deviceIP);
      } else if (network && !number) {
        // Если передан только network (например, "192.168.1."), извлекаем IP из req.ip
        const forwardedFor = req.headers['x-forwarded-for'] as string;
        const realIP = req.headers['x-real-ip'] as string;
        const serverIP = forwardedFor?.split(',')[0]?.trim() || realIP || req.ip || 'Unknown';
        const normalizedIP = serverIP.replace(/^::ffff:/, '');
        
        // Проверяем, соответствует ли serverIP переданному network
        if (normalizedIP.startsWith(network.replace(/\.$/, ''))) {
          deviceIP = normalizedIP;
          networkIP = network;
          deviceNumber = normalizedIP.split('.').pop() || '1';
          console.log('Using server IP that matches device network:', deviceIP);
        } else {
          // Если не соответствует, используем переданный network + последний октет из serverIP
          deviceIP = `${network}${normalizedIP.split('.').pop() || '1'}`;
          networkIP = network;
          deviceNumber = normalizedIP.split('.').pop() || '1';
          console.log('Using device network with server IP last octet:', deviceIP);
        }
      } else {
        // Пытаемся получить реальный IP из заголовков (для NAT/Proxy)
        const forwardedFor = req.headers['x-forwarded-for'] as string;
        const realIP = req.headers['x-real-ip'] as string;
        deviceIP = forwardedFor?.split(',')[0]?.trim() || realIP || req.ip || 'Unknown';
        const normalizedIP = deviceIP.replace(/^::ffff:/, '');
        
        console.log('Device IP detection:', {
          'x-forwarded-for': forwardedFor,
          'x-real-ip': realIP,
          'req.ip': req.ip,
          'final-ip': deviceIP
        });
        
        networkIP = normalizedIP.includes('.') 
          ? normalizedIP.split('.').slice(0, 3).join('.') + '.' 
          : normalizedIP;
        deviceNumber = normalizedIP.split('.').pop() || '1';
      }

      const deviceData = {
        branchId,
        name: sanitizeString(deviceName ?? 'DNS Radio Device', 'DNS Radio Device'),
        vendor: sanitizeString(vendor ?? 'DNS', 'DNS'),
        network: sanitizeString(networkIP, ''),
        number: sanitizeString(deviceNumber, '1'),
        app: sanitizeString(app ?? 'DNS Radio', 'DNS Radio'),
        os: sanitizeString(os ?? 'Android 14', 'Android 14'),
        timeFrom: '08:00',
        timeUntil: '22:00'
      };

      // Ищем существующее устройство
      const existingDevice = await tx.devices.findFirst({
        where: {
          branchId,
          network: deviceData.network,
          number: deviceData.number
        },
        select: { id: true }
      });

      let device;
      if (existingDevice) {
        // Обновляем существующее устройство
        device = await tx.devices.update({
          where: { id: existingDevice.id },
          data: {
            name: deviceData.name,
            vendor: deviceData.vendor,
            network: deviceData.network,
            number: deviceData.number,
            app: deviceData.app,
            os: deviceData.os,
            timeFrom: deviceData.timeFrom,
            timeUntil: deviceData.timeUntil
          }
        });
      } else {
        // Создаем новое устройство
        device = await tx.devices.create({
          data: deviceData
        });
      }

      return { device, branch: updatedBranch };
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Устройство успешно создано/обновлено', 
      ...result, 
      userId: user.id 
    });

  } catch (error) {
    console.error('Error creating/updating device:', error);
    return res.status(500).json({ error: 'Ошибка при создании/обновлении устройства' });
  }
};

// Heartbeat от приложения устройства
export const heartbeat = async (req: Request, res: Response): Promise<any> => {
  try {
    const { deviceId, appVersion } = req.body || {};
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId обязателен' });
    }

    const now = Date.now();
    heartbeatStore.set(deviceId, now);

    await prisma.devices.update({ where: { id: deviceId }, data: { ...(appVersion ? { app: sanitizeString(appVersion) } : {}) } }).catch(() => {});

    return res.json({ success: true, serverTime: new Date(now).toISOString() });
  } catch (error) {
    console.error('Error on heartbeat:', error);
    return res.status(500).json({ success: false, error: 'Heartbeat error' });
  }
};

export const getDeviceByBranchId = async (req: Request, res: Response): Promise<any> => {
  const { branchId: rawId } = req.params;
  const branchId = sanitizeUuid(rawId);
  if (!branchId) {
    return res.status(400).json({ error: 'branchId обязателен' });
  }
  try {
    const device = await prisma.devices.findFirst({ where: { branchId }, include: { branch: { select: { uuid: true, name: true, typeOfDist: true, city: true, address: true } } } });
    if (!device) return res.status(404).json({ error: 'Устройство не найдено' });
    return res.status(200).json(device);
  } catch (error) {
    console.error('Error fetching device:', error);
    return res.status(500).json({ error: 'Ошибка при получении устройства' });
  }
};

export const getAllDevices = async (req: Request, res: Response): Promise<any> => {
  try {
    const devices = await prisma.devices.findMany({ include: { branch: { select: { uuid: true, name: true, typeOfDist: true, city: true, address: true } } }, orderBy: { createdAt: 'desc' } });
    return res.status(200).json(devices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    return res.status(500).json({ error: 'Ошибка при получении устройств' });
  }
};

// Удаление устройства
export const deleteDevice = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'ID устройства обязателен' });
  }

  try {
    await prisma.devices.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Устройство успешно удалено' });
  } catch (error) {
    console.error('Error deleting device:', error);
    return res.status(500).json({ error: 'Ошибка при удалении устройства' });
  }
};
