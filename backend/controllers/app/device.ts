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
  const { userEmail, branchType, deviceName, vendor, network, number, app, os, deviceIP: deviceIPFromBody, ip, deviceId, deviceUuid, macAddress } = req.body;

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
    deviceId,
    deviceUuid,
    'req.ip': req.ip,
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'x-real-ip': req.headers['x-real-ip']
  });

  if (!userEmail || !branchType) {
    return res.status(400).json({ error: 'userEmail и branchType обязательны' });
  }

  try {
    // Получаем данные пользователя из UserData
    const userData = await prisma.userData.findUnique({ 
      where: { email: userEmail.toLowerCase() }, 
      select: { 
        uuid: true,
        fio: true,
        branch_uuid: true,
        email: true
      } 
    });
    if (!userData) {
      return res.status(404).json({ error: 'Пользователь не найден в UserData' });
    }

    // Логируем информацию о пользователе из UserData
    console.log('Найден пользователь в UserData:', userData.fio, 'с email:', userData.email);

    const branchId = sanitizeUuid(userData.branch_uuid);
    console.log('🔍 [createOrUpdateDevice] branch_uuid из UserData:', userData.branch_uuid);
    console.log('🔍 [createOrUpdateDevice] sanitized branchId:', branchId);
    
    if (!branchId) {
      return res.status(400).json({ error: 'Некорректный branchId' });
    }

    // Транзакция для атомарности операций
    const result = await prisma.$transaction(async (tx) => {
      // Проверяем, существует ли филиал
      const existingBranch = await tx.branch.findUnique({ 
        where: { uuid: branchId }, 
        select: { uuid: true, name: true, typeOfDist: true } 
      });
      
      console.log('🔍 [createOrUpdateDevice] Поиск филиала с UUID:', branchId);
      console.log('🔍 [createOrUpdateDevice] Найденный филиал:', existingBranch);
      
      if (!existingBranch) {
        throw new Error('Филиал не найден');
      }

      // Обновляем филиал
      const updatedBranch = await tx.branch.update({
        where: { uuid: branchId },
        data: { typeOfDist: sanitizeString(branchType) },
        select: { uuid: true, name: true, typeOfDist: true }
      });
      
      console.log('🔍 [createOrUpdateDevice] Обновленный филиал:', updatedBranch);

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
        const clientIP = req.headers['x-client-ip'] as string;
        const cfConnectingIP = req.headers['cf-connecting-ip'] as string;
        
        deviceIP = forwardedFor?.split(',')[0]?.trim() || 
                  realIP || 
                  clientIP || 
                  cfConnectingIP || 
                  req.ip || 
                  'Unknown';
        const normalizedIP = deviceIP.replace(/^::ffff:/, '');
        
        console.log('Device IP detection (fallback):', {
          'x-forwarded-for': forwardedFor,
          'x-real-ip': realIP,
          'x-client-ip': clientIP,
          'cf-connecting-ip': cfConnectingIP,
          'req.ip': req.ip,
          'final-ip': deviceIP
        });
        
        networkIP = normalizedIP.includes('.') 
          ? normalizedIP.split('.').slice(0, 3).join('.') + '.' 
          : normalizedIP;
        deviceNumber = normalizedIP.split('.').pop() || '1';
      }

      console.log('Final device IP data:', {
        deviceIP,
        networkIP,
        deviceNumber,
        fullIP: `${networkIP}${deviceNumber}`
      });

      const deviceData = {
        branchId,
        userEmail: userData.email, // Сохраняем email пользователя
        name: sanitizeString(deviceName ?? 'DNS Radio Device', 'DNS Radio Device'),
        vendor: sanitizeString(vendor ?? 'DNS', 'DNS'),
        network: sanitizeString(networkIP, ''),
        number: sanitizeString(deviceNumber, '1'),
        app: sanitizeString(app ?? 'DNS Radio', 'DNS Radio'),
        os: sanitizeString(os ?? 'Android 14', 'Android 14'),
        macAddress: macAddress ? sanitizeString(macAddress, '') : null,
        timeFrom: '08:00',
        timeUntil: '22:00'
      };

      // Ищем существующее устройство
      let existingDevice = null;
      
      // Приоритет 1: По MAC адресу (самый надежный идентификатор)
      if (deviceData.macAddress) {
        existingDevice = await tx.devices.findFirst({
          where: {
            macAddress: deviceData.macAddress
          },
          select: { id: true, network: true, number: true, name: true, vendor: true, os: true, macAddress: true }
        });
        console.log('Search by MAC address:', deviceData.macAddress, 'Found:', !!existingDevice);
      }
      
      // Приоритет 2: По deviceId/deviceUuid (если не найден по MAC)
      if (!existingDevice) {
        const deviceIdentifier = deviceId || deviceUuid;
        if (deviceIdentifier) {
          existingDevice = await tx.devices.findFirst({
            where: {
              id: deviceIdentifier
            },
            select: { id: true, network: true, number: true, name: true, vendor: true, os: true, macAddress: true }
          });
          console.log('Search by deviceId/deviceUuid:', deviceIdentifier, 'Found:', !!existingDevice);
        }
      }
      
      // Приоритет 3: По комбинации полей (если не найден по MAC/ID)
      if (!existingDevice) {
        existingDevice = await tx.devices.findFirst({
          where: {
            branchId,
            vendor: deviceData.vendor,
            os: deviceData.os,
            name: deviceData.name
          },
          select: { id: true, network: true, number: true, name: true, vendor: true, os: true, macAddress: true }
        });
        console.log('Search by vendor+os+name: Found:', !!existingDevice);
      }
      
      // Приоритет 4: Только по vendor + os (если не найден по полной комбинации)
      if (!existingDevice) {
        existingDevice = await tx.devices.findFirst({
          where: {
            branchId,
            vendor: deviceData.vendor,
            os: deviceData.os
          },
          select: { id: true, network: true, number: true, name: true, vendor: true, os: true, macAddress: true }
        });
        console.log('Search by vendor+os: Found:', !!existingDevice);
      }

      let device;
      if (existingDevice) {
        console.log('Found existing device:', {
          id: existingDevice.id,
          oldIP: existingDevice.network + existingDevice.number,
          newIP: deviceData.network + deviceData.number,
          name: deviceData.name
        });
        
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
            macAddress: deviceData.macAddress,
            timeFrom: deviceData.timeFrom,
            timeUntil: deviceData.timeUntil,
            userEmail: deviceData.userEmail, // Обновляем email пользователя
            branchId: deviceData.branchId    // Обновляем филиал
          }
        });
        
        console.log('Device updated successfully:', {
          id: device.id,
          newIP: device.network + device.number
        });
      } else {
        console.log('Creating new device:', {
          name: deviceData.name,
          IP: deviceData.network + deviceData.number,
          branchId: deviceData.branchId
        });
        
        // Создаем новое устройство
        device = await tx.devices.create({
          data: deviceData
        });
        
        console.log('New device created:', {
          id: device.id,
          IP: device.network + device.number
        });
      }

      return { device, branch: updatedBranch };
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Устройство успешно создано/обновлено', 
      ...result, 
      userEmail: userData.email 
    });

  } catch (error) {
    console.error('Error creating/updating device:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : 'Unknown';
    
    console.error('Error details:', {
      message: errorMessage,
      stack: errorStack,
      name: errorName
    });
    return res.status(500).json({ 
      error: 'Ошибка при создании/обновлении устройства',
      details: errorMessage 
    });
  }
};

// Heartbeat от приложения устройства
export const heartbeat = async (req: Request, res: Response): Promise<any> => {
  try {
    const { deviceId, appVersion, macAddress, currentIP, userEmail } = req.body || {};
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId обязателен' });
    }

    const now = Date.now();
    const nowDate = new Date(now);
    
    // Обновляем heartbeat store (для быстрого доступа)
    heartbeatStore.set(deviceId, now);

    // Подготавливаем данные для обновления
    const updateData: any = { lastSeen: nowDate };
    
    if (appVersion) {
      updateData.app = sanitizeString(appVersion);
    }
    
    // userUuid больше не используется, так как связь с пользователем через email
    
    // Если есть userEmail, обновляем его
    if (userEmail) {
      updateData.userEmail = sanitizeString(userEmail);
      console.log('Updating device userEmail from heartbeat:', {
        deviceId,
        userEmail: updateData.userEmail
      });
    }
    
    // Если есть MAC адрес, обновляем его
    if (macAddress) {
      updateData.macAddress = sanitizeString(macAddress);
      console.log('Updating device MAC address from heartbeat:', {
        deviceId,
        macAddress: updateData.macAddress
      });
    }
    
    // Если есть текущий IP, обновляем IP адрес
    if (currentIP) {
      const ipParts = currentIP.split('.');
      if (ipParts.length === 4) {
        updateData.network = ipParts.slice(0, 3).join('.') + '.';
        updateData.number = ipParts[3];
        console.log('Updating device IP from heartbeat:', {
          deviceId,
          currentIP,
          network: updateData.network,
          number: updateData.number
        });
      }
    }

    // Обновляем lastSeen и другие данные в базе данных
    await prisma.devices.update({ 
      where: { id: deviceId }, 
      data: updateData
    }).catch((error) => {
      console.error('Error updating device in heartbeat:', error);
    });

    console.log('Heartbeat received from device:', deviceId, 'at', nowDate.toISOString());

    return res.json({ success: true, serverTime: nowDate.toISOString() });
  } catch (error) {
    console.error('Error on heartbeat:', error);
    return res.status(500).json({ success: false, error: 'Heartbeat error' });
  }
};

// Получение устройства по IP адресу
export const getDeviceByIP = async (req: Request, res: Response): Promise<any> => {
  try {
    const { ip } = req.params;
    
    console.log('Getting device by IP:', ip);
    
    // Ищем устройство по IP адресу
    let device = null;
    
    if (ip.includes('.')) {
      // Если IP содержит точки, разбираем его на network и number
      const ipParts = ip.split('.');
      if (ipParts.length === 4) {
        const network = ipParts.slice(0, 3).join('.') + '.';
        const number = ipParts[3];
        
        device = await prisma.devices.findFirst({
          where: {
            AND: [
              { network: network },
              { number: number }
            ]
          },
          include: {
            branch: {
              select: {
                name: true,
                type: true
              }
            }
          }
        });
      }
    }
    
    // Если не нашли по полному IP, попробуем найти по частичному совпадению
    if (!device) {
      device = await prisma.devices.findFirst({
        where: {
          OR: [
            { network: { contains: ip } },
            { number: ip }
          ]
        },
        include: {
          branch: {
            select: {
              name: true,
              type: true
            }
          }
        }
      });
    }

    if (!device) {
      console.log('Device not found by IP:', ip);
      return res.status(404).json({ error: 'Устройство с таким IP адресом не найдено' });
    }

    console.log('Device found by IP:', {
      id: device.id,
      name: device.name,
      network: device.network,
      number: device.number,
      fullIP: device.network + device.number,
      branch: device.branch?.name
    });

    return res.json({
      success: true,
      data: device
    });
  } catch (error) {
    console.error('Error fetching device by IP:', error);
    return res.status(500).json({ error: 'Ошибка при поиске устройства по IP' });
  }
};

// Получение устройства по MAC адресу
export const getDeviceByMAC = async (req: Request, res: Response): Promise<any> => {
  try {
    const { macAddress } = req.params;
    
    console.log('Getting device by MAC address:', macAddress);
    
    const device = await prisma.devices.findFirst({
      where: { macAddress },
      include: {
        branch: {
          select: {
            name: true,
            type: true
          }
        }
      }
    });

    if (!device) {
      console.log('Device not found by MAC address:', macAddress);
      return res.status(404).json({ error: 'Устройство с таким MAC адресом не найдено' });
    }

    console.log('Device found by MAC address:', {
      id: device.id,
      name: device.name,
      macAddress: device.macAddress,
      network: device.network,
      number: device.number,
      branch: device.branch?.name || 'Unknown'
    });

    return res.json({
      success: true,
      data: device
    });
  } catch (error) {
    console.error('Error fetching device by MAC address:', error);
    return res.status(500).json({ error: 'Ошибка при поиске устройства по MAC адресу' });
  }
};

// Получение устройства по ID
export const getDeviceById = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    console.log('Getting device by ID:', id);
    
    const device = await prisma.devices.findUnique({
      where: { id },
      include: {
        branch: {
          select: {
            name: true,
            type: true
          }
        }
      }
    });

    if (!device) {
      console.log('Device not found:', id);
      return res.status(404).json({ error: 'Устройство не найдено' });
    }

    console.log('Device found:', {
      id: device.id,
      name: device.name,
      network: device.network,
      number: device.number,
      branch: device.branch?.name
    });

    return res.json({
      success: true,
      data: device
    });
  } catch (error) {
    console.error('Error fetching device by ID:', error);
    return res.status(500).json({ error: 'Ошибка при получении устройства' });
  }
};

// Обновление IP адреса устройства
export const updateDeviceIP = async (req: Request, res: Response): Promise<any> => {
  try {
    const { deviceId, deviceIP, network, number } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId обязателен' });
    }

    let networkIP = '';
    let deviceNumber = '1';

    if (deviceIP && typeof deviceIP === 'string' && deviceIP.includes('.')) {
      // Разбираем полный IP адрес
      const ipParts = deviceIP.split('.');
      if (ipParts.length === 4) {
        networkIP = ipParts.slice(0, 3).join('.') + '.';
        deviceNumber = ipParts[3];
      }
    } else if (network && number) {
      networkIP = network;
      deviceNumber = number;
    } else {
      return res.status(400).json({ error: 'Необходимо указать deviceIP или network+number' });
    }

    console.log('Updating device IP:', {
      deviceId,
      deviceIP,
      network: networkIP,
      number: deviceNumber,
      fullIP: `${networkIP}${deviceNumber}`
    });

    const updatedDevice = await prisma.devices.update({
      where: { id: deviceId },
      data: {
        network: networkIP,
        number: deviceNumber
      }
    });

    return res.json({ 
      success: true, 
      data: updatedDevice,
      message: `IP адрес обновлен на ${networkIP}${deviceNumber}`
    });
  } catch (error) {
    console.error('Error updating device IP:', error);
    return res.status(500).json({ error: 'Ошибка при обновлении IP адреса устройства' });
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
