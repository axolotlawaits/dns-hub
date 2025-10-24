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


    const branchId = sanitizeUuid(userData.branch_uuid);
    
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
          console.log('[Device] Using full device IP:', deviceIP, '-> network:', networkIP, 'number:', deviceNumber);
        }
      } else if (network && number) {
        // Используем IP адрес, отправленный устройством
        deviceIP = `${network}${number}`;
        networkIP = network;
        deviceNumber = number;
        console.log('[Device] Using device-provided IP:', deviceIP);
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
          console.log('[Device] Using server IP that matches device network:', deviceIP);
        } else {
          // Если не соответствует, используем переданный network + последний октет из serverIP
          deviceIP = `${network}${normalizedIP.split('.').pop() || '1'}`;
          networkIP = network;
          deviceNumber = normalizedIP.split('.').pop() || '1';
          console.log('[Device] Using device network with server IP last octet:', deviceIP);
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
        
        console.log('[Device] Device IP detection (fallback):', {
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

      console.log('[Device] Final device IP data:', {
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
        console.log('[Device] Search by MAC address:', deviceData.macAddress, 'Found:', !!existingDevice);
      }
      
      // Специальная проверка для веб-плеера по userEmail + vendor + macAddress
      if (!existingDevice && deviceData.vendor === 'Web Browser' && deviceData.macAddress?.startsWith('web-') && deviceData.userEmail) {
        existingDevice = await tx.devices.findFirst({
          where: {
            userEmail: deviceData.userEmail,
            vendor: 'Web Browser',
            macAddress: deviceData.macAddress,
            branchId
          },
          select: { id: true, network: true, number: true, name: true, vendor: true, os: true, macAddress: true }
        });
        console.log('[Device] Search by web player email+vendor+mac: Found:', !!existingDevice);
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
          console.log('[Device] Search by deviceId/deviceUuid:', deviceIdentifier, 'Found:', !!existingDevice);
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
        console.log('[Device] Search by vendor+os+name: Found:', !!existingDevice);
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
        console.log('[Device] Search by vendor+os: Found:', !!existingDevice);
      }

      let device;
      if (existingDevice) {
        console.log('[Device] Found existing device:', {
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
        
        console.log('[Device] Device updated successfully:', {
          id: device.id,
          newIP: device.network + device.number
        });
      } else {
        console.log('[Device] Creating new device:', {
          name: deviceData.name,
          IP: deviceData.network + deviceData.number,
          branchId: deviceData.branchId
        });
        
        // Создаем новое устройство
        device = await tx.devices.create({
          data: deviceData
        });
        
        console.log('[Device] New device created:', {
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
    console.error('[Device] Error creating/updating device:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : 'Unknown';
    
    console.error('[Device] Error details:', {
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
    const { deviceId, deviceName, appVersion, macAddress, currentIP, userEmail } = req.body || {};
    
    console.log(`🔍 [Heartbeat] Получен запрос:`, { deviceId, deviceName, userEmail, macAddress });
    
    if (!deviceId && !deviceName) {
      console.log(`❌ [Heartbeat] Ошибка: deviceId или deviceName обязателен`);
      return res.status(400).json({ success: false, error: 'deviceId или deviceName обязателен' });
    }
    
    if (!userEmail) {
      console.log(`❌ [Heartbeat] Ошибка: userEmail обязателен`);
      return res.status(400).json({ success: false, error: 'userEmail обязателен' });
    }

    const now = Date.now();
    const nowDate = new Date(now);
    
    // Определяем deviceId для heartbeat store
    const storeKey = deviceId || deviceName;
    
    // Обновляем heartbeat store (для быстрого доступа)
    heartbeatStore.set(storeKey, now);
    // Логирование heartbeat отключено для уменьшения количества логов

    // Подготавливаем данные для обновления
    const updateData: any = { lastSeen: nowDate };
    
    if (appVersion) {
      updateData.app = sanitizeString(appVersion);
    }
    
    // userUuid больше не используется, так как связь с пользователем через email
    
    // Если есть userEmail, обновляем его
    if (userEmail) {
      updateData.userEmail = sanitizeString(userEmail);
    }
    
    // Если есть MAC адрес, обновляем его
    if (macAddress) {
      updateData.macAddress = sanitizeString(macAddress);
      // Если MAC адрес начинается с 'web-', это веб плеер
      if (macAddress.startsWith('web-')) {
        updateData.vendor = 'Web Browser';
      }
    }
    
    // Если есть текущий IP, обновляем IP адрес
    if (currentIP) {
      const ipParts = currentIP.split('.');
      if (ipParts.length === 4) {
        updateData.network = ipParts.slice(0, 3).join('.') + '.';
        updateData.number = ipParts[3];
      }
    }

    // Обновляем или создаем запись устройства в базе данных
    try {
      // Получаем branchId пользователя из базы
      let userBranchId = null;
      if (updateData.userEmail) {
        console.log(`🔍 [Heartbeat] Ищем пользователя по email: ${updateData.userEmail}`);
        const user = await prisma.user.findUnique({
          where: { email: updateData.userEmail },
          select: { branch: true }
        });
        console.log(`🔍 [Heartbeat] Найденный пользователь:`, user);
        if (user?.branch) {
          const branch = await prisma.branch.findFirst({
            where: { name: user.branch },
            select: { uuid: true }
          });
          userBranchId = branch?.uuid || null;
          console.log(`🔍 [Heartbeat] Найденный филиал:`, branch);
        }
      }
      console.log(`🔍 [Heartbeat] userBranchId: ${userBranchId}`);
      
      // Ищем существующее устройство по приоритету
      let existingDevice = null;
      
      // Для веб-плеера ищем только по userEmail + branchId + vendor
      if (updateData.userEmail && userBranchId) {
        console.log(`🔍 [Heartbeat] Поиск по userEmail + branchId + vendor: email=${updateData.userEmail}, branchId=${userBranchId}`);
        existingDevice = await prisma.devices.findFirst({
          where: {
            userEmail: updateData.userEmail,
            branchId: userBranchId,
            vendor: 'Web Browser'
          }
        });
        console.log(`🔍 [Heartbeat] Результат поиска по userEmail + branchId + vendor:`, existingDevice ? 'найдено' : 'не найдено');
      }
      
      // Для обычных устройств ищем по deviceId или macAddress
      if (!existingDevice && deviceId) {
        console.log(`🔍 [Heartbeat] Поиск по deviceId: ${deviceId}`);
        existingDevice = await prisma.devices.findUnique({
          where: { id: deviceId }
        });
        console.log(`🔍 [Heartbeat] Результат поиска по deviceId:`, existingDevice ? 'найдено' : 'не найдено');
      }
      
      if (!existingDevice && updateData.macAddress && !updateData.macAddress.startsWith('web-')) {
        console.log(`🔍 [Heartbeat] Поиск по macAddress: ${updateData.macAddress}`);
        existingDevice = await prisma.devices.findFirst({
          where: { macAddress: updateData.macAddress }
        });
        console.log(`🔍 [Heartbeat] Результат поиска по macAddress:`, existingDevice ? 'найдено' : 'не найдено');
      }

      if (existingDevice) {
        // Проверяем, что найденное устройство действительно соответствует запрашиваемому
        // Для веб плеера важны: userEmail + branchId + vendor
        const isWebPlayer = existingDevice.vendor === 'Web Browser';
        
        if (isWebPlayer) {
          // Для веб плеера проверяем соответствие по email и филиалу
          const userEmailMatch = existingDevice.userEmail === updateData.userEmail;
          const branchMatch = existingDevice.branchId === userBranchId;
          
          if (!userEmailMatch || !branchMatch) {
            console.warn(`⚠️ [Heartbeat] Web player found but user/branch mismatch: found user=${existingDevice.userEmail}, requested=${updateData.userEmail}, found branch=${existingDevice.branchId}, requested=${userBranchId}`);
            // Создаем новое устройство для другого пользователя/филиала
            existingDevice = null;
          } else {
            // Совпадает email и филиал - обновляем устройство
            const updateDeviceId = existingDevice.id;
            await prisma.devices.update({ 
              where: { id: updateDeviceId }, 
              data: updateData
            });
            
            console.log(`✅ [Heartbeat] Web player updated: ${updateDeviceId}`);
          }
        } else {
          // Для обычных устройств проверяем только deviceId
          if (existingDevice.id !== deviceId) {
            console.warn(`⚠️ [Heartbeat] Device found but ID mismatch: found=${existingDevice.id}, requested=${deviceId}`);
            existingDevice = null;
          } else {
            const updateDeviceId = existingDevice.id;
            await prisma.devices.update({ 
              where: { id: updateDeviceId }, 
              data: updateData
            });
            
            console.log(`✅ [Heartbeat] Device updated: ${updateDeviceId}`);
          }
        }
      }
      
      if (!existingDevice) {
        // Если устройство не существует, создаем новое только если есть userEmail
        if (!updateData.userEmail) {
          console.warn(`⚠️ [Heartbeat] Cannot create device ${deviceId} without userEmail`);
          return res.status(400).json({ success: false, error: 'userEmail required for new device' });
        }
        
        console.log(`🆕 [Heartbeat] Создаем новое устройство для deviceName: ${deviceName || deviceId}`);
        
        // Сначала находим первый доступный branchId
        const firstBranch = await prisma.branch.findFirst({
          select: { uuid: true, name: true }
        });

        if (!firstBranch) {
          console.error(`❌ [Heartbeat] No branches found in database for device ${deviceId}`);
          return res.status(500).json({ success: false, error: 'No branches available' });
        }

        const newDeviceData = {
          name: deviceName || `Web Player ${deviceId || 'unknown'}`,
          vendor: 'Web Browser',
          app: updateData.app || 'Web Player',
          os: 'Web Browser',
          network: updateData.network || '127.0.0.1',
          number: updateData.number || '1',
          timeFrom: '08:00',
          timeUntil: '22:00',
          branchId: userBranchId || firstBranch.uuid, // Используем филиал пользователя если найден
          userEmail: updateData.userEmail,
          macAddress: updateData.macAddress,
          lastSeen: updateData.lastSeen
        };

        console.log(`🆕 [Heartbeat] Данные для создания устройства:`, newDeviceData);
        
        try {
          await prisma.devices.create({
            data: newDeviceData
          });
          console.log(`✅ [Heartbeat] Устройство создано успешно: ${deviceId}`);
        } catch (createError: any) {
          if (createError.code === 'P2002' && createError.meta?.target?.includes('id')) {
            // Устройство с таким ID уже существует, попробуем найти и обновить его
            console.log(`🔄 [Heartbeat] Устройство уже существует, ищем по deviceName: ${deviceName}`);
            const foundDevice = await prisma.devices.findFirst({
              where: {
                name: deviceName,
                userEmail: updateData.userEmail,
                branchId: userBranchId || firstBranch.uuid,
                vendor: 'Web Browser'
              }
            });
            
            if (foundDevice) {
              await prisma.devices.update({
                where: { id: foundDevice.id },
                data: updateData
              });
              console.log(`✅ [Heartbeat] Устройство обновлено: ${foundDevice.id}`);
            } else {
              console.warn(`⚠️ [Heartbeat] Устройство не найдено для обновления: ${deviceName}`);
            }
          } else {
            throw createError;
          }
        }
      }
    } catch (error) {
      console.error('[Device] Error updating/creating device in heartbeat:', error);
      // Не прерываем выполнение, но логируем ошибку
      // HeartbeatStore уже обновлен, что достаточно для отслеживания онлайн статуса
    }

    return res.json({ success: true, serverTime: nowDate.toISOString() });
  } catch (error) {
    console.error('[Device] Error on heartbeat:', error);
    return res.status(500).json({ success: false, error: 'Heartbeat error' });
  }
};

// Получение устройства по IP адресу
export const getDeviceByIP = async (req: Request, res: Response): Promise<any> => {
  try {
    const { ip } = req.params;
    
    console.log('[Device] Getting device by IP:', ip);
    
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
      console.log('[Device] Device not found by IP:', ip);
      return res.status(404).json({ error: 'Устройство с таким IP адресом не найдено' });
    }

    console.log('[Device] Device found by IP:', {
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
    console.error('[Device] Error fetching device by IP:', error);
    return res.status(500).json({ error: 'Ошибка при поиске устройства по IP' });
  }
};

// Получение устройства по MAC адресу
export const getDeviceByMAC = async (req: Request, res: Response): Promise<any> => {
  try {
    const { macAddress } = req.params;
    
    console.log('[Device] Getting device by MAC address:', macAddress);
    
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
      console.log('[Device] Device not found by MAC address:', macAddress);
      return res.status(404).json({ error: 'Устройство с таким MAC адресом не найдено' });
    }

    console.log('[Device] Device found by MAC address:', {
      id: device.id,
      name: device.name,
      macAddress: device.macAddress,
      network: device.network,
      number: device.number,
      branch: device.branch.name
    });

    return res.json({
      success: true,
      data: device
    });
  } catch (error) {
    console.error('[Device] Error fetching device by MAC address:', error);
    return res.status(500).json({ error: 'Ошибка при поиске устройства по MAC адресу' });
  }
};

// Получение устройства по ID
export const getDeviceById = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    console.log('[Device] Getting device by ID:', id);
    
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
      console.log('[Device] Device not found:', id);
      return res.status(404).json({ error: 'Устройство не найдено' });
    }

    console.log('[Device] Device found:', {
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
    console.error('[Device] Error fetching device by ID:', error);
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

    console.log('[Device] Updating device IP:', {
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
    console.error('[Device] Error updating device IP:', error);
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
    console.error('[Device] Error fetching device:', error);
    return res.status(500).json({ error: 'Ошибка при получении устройства' });
  }
};

export const getAllDevices = async (req: Request, res: Response): Promise<any> => {
  try {
    const devices = await prisma.devices.findMany({ include: { branch: { select: { uuid: true, name: true, typeOfDist: true, city: true, address: true } } }, orderBy: { createdAt: 'desc' } });
    return res.status(200).json(devices);
  } catch (error) {
    console.error('[Device] Error fetching devices:', error);
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
    console.error('[Device] Error deleting device:', error);
    return res.status(500).json({ error: 'Ошибка при удалении устройства' });
  }
};
