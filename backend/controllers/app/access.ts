import { Request, Response } from 'express';
import { prisma } from '../../server.js';
import { AccessLevel } from '@prisma/client';

/* full access info for user */

export const getFullAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const userId = req.params.id 
  const userEmail = req.query.email as string
  
  // Проверяем наличие email перед запросом
  if (!userEmail) {
    return res.status(400).json({error: 'Email parameter is required'})
  }
  
  /*fetch user position and group info */
  const userPosAndGroup = await prisma.userData.findUnique({
    where: {email: userEmail},
    select: {
      position: {
        select: {
          uuid: true,
          group: { select: { uuid: true } }
        }
      }
    }
  })
  
  if (userPosAndGroup) {
    const groupId = userPosAndGroup?.position?.group?.uuid
    const positionId = userPosAndGroup?.position?.uuid

    const [user, group, position] = await Promise.all([
      prisma.userToolAccess.findMany({where: {userId}, select: {
        tool: {select: {id: true, link: true}}, accessLevel: true
      }}),
      prisma.groupToolAccess.findMany({where: {groupId}, select: {
        tool: {select: {id: true, link: true}}, accessLevel: true
      }}),
      prisma.positionToolAccess.findMany({where: {positionId}, select: {
        tool: {select: {id: true, link: true}}, accessLevel: true
      }})
    ])

    if (user && group && position) {
      const combined = [...user, ...group, ...position]
      const levels: Record<AccessLevel, number> = { READONLY: 1, CONTRIBUTOR: 2, FULL: 3 }

      type FlattenedAccessEntry = {
        toolId: string
        link: string
        accessLevel: AccessLevel
      }
      const accessMap = new Map<string, FlattenedAccessEntry>()

      for (const entry of combined) {
        const toolId = entry.tool.id
        const link = entry.tool.link
        const existing = accessMap.get(toolId)
        
        if (!existing) {
            accessMap.set(toolId, {toolId, link, accessLevel: entry.accessLevel})
        } else {
          if (levels[entry.accessLevel] > levels[existing.accessLevel as AccessLevel]) {
            accessMap.set(toolId, {toolId, link, accessLevel: entry.accessLevel})
          }
        }
      }
      const uniqueAccessWithHighestLevel = Array.from(accessMap.values())

      res.status(200).json(uniqueAccessWithHighestLevel)
    } else {
      res.status(400).json({error: 'ошибка при поиске инструментов с доступом'})
    }
  } else {
    // Если не найдена информация о пользователе, возвращаем только прямые доступы пользователя
    const userAccess = await prisma.userToolAccess.findMany({
      where: {userId}, 
      select: {
        tool: {select: {id: true, link: true}}, 
        accessLevel: true
      }
    })
    
    const accessList = userAccess.map(access => ({
      toolId: access.tool.id,
      link: access.tool.link,
      accessLevel: access.accessLevel
    }))
    
    res.status(200).json(accessList)
  }
}

/* group access  */

export const getGroupAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const groupId = req.params.id
  
  const access = await prisma.groupToolAccess.findMany({where: { groupId }})
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка при поиске информации о доступе'})
  }
}

export const updateGroupAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const { toolId, accessLevel } = req.body
  const groupId = req.params.id

  const access = await prisma.groupToolAccess.upsert({
    where: {
      groupId_toolId: { groupId, toolId,}
    },
    update: { accessLevel },
    create: { 
      accessLevel,
      group: { connect: { uuid: groupId } },
      tool: { connect: { id: toolId } }
    }
  })
  if (access) {
    res.status(200).json(access)
    console.log('[Access]', access)
  } else {
    res.status(400).json({error: 'ошибка обновления доступа'})
  }
}

export const deleteGroupAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const { toolId } = req.body
  const groupId = req.params.id

  const access = await prisma.groupToolAccess.delete({
    where: { groupId_toolId: { groupId, toolId }}
  })
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка обновления доступа'})
  }
}

/* user access */

export const getUserAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const userId = req.params.id
  
  const access = await prisma.userToolAccess.findMany({where: { userId }})
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка при поиске информации о доступе'})
  }
}

export const updateUserAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const { toolId, accessLevel } = req.body
  const userId = req.params.id

  const access = await prisma.userToolAccess.upsert({
    where: { userId_toolId: { userId, toolId }},
    update: { accessLevel },
    create: { 
      accessLevel,
      tool: { connect: { id: toolId } },
      user: { connect: { id: userId } }
    }
  })
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка обновления доступа'})
  }
}

export const deleteUserAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const { toolId } = req.body
  const userId = req.params.id

  const access = await prisma.userToolAccess.delete({
    where: { userId_toolId: { userId, toolId }}
  })
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка обновления доступа'})
  }
}

/* position access */

export const getPositionAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const positionId = req.params.id
  
  const access = await prisma.positionToolAccess.findMany({where: { positionId }})
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка при поиске информации о доступе'})
  }
}

export const updatePositionAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const { toolId, accessLevel } = req.body
  const positionId = req.params.id

  const access = await prisma.positionToolAccess.upsert({
    where: {
      positionId_toolId: { positionId, toolId,}
    },
    update: { accessLevel },
    create: { 
      accessLevel,
      position: { connect: { uuid: positionId } },
      tool: { connect: { id: toolId } }
    }
  })
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка обновления доступа'})
  }
}

export const deletePositionAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const { toolId } = req.body
  const positionId = req.params.id

  const access = await prisma.positionToolAccess.delete({
    where: { positionId_toolId: { positionId, toolId }}
  })
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка обновления доступа'})
  }
}

// Запрос доступа к инструменту
export const requestToolAccess = async (req: Request, res: Response): Promise<any> => {
  try {
    const { toolId } = req.body;
    const token = (req as any).token;
    
    if (!token || !token.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!toolId) {
      return res.status(400).json({ error: 'toolId is required' });
    }
    
    // Получаем информацию о пользователе
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { id: true, name: true, email: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Получаем информацию об инструменте
    const tool = await prisma.tool.findUnique({
      where: { id: toolId },
      select: { id: true, name: true, link: true }
    });
    
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }
    
    // Проверяем, есть ли уже доступ у пользователя
    const existingAccess = await prisma.userToolAccess.findUnique({
      where: { userId_toolId: { userId: user.id, toolId: tool.id } }
    });
    
    if (existingAccess) {
      return res.status(400).json({ error: 'Access already granted' });
    }
    
    // Находим пользователей с полным доступом к инструменту
    const fullAccessUsers = await prisma.userToolAccess.findMany({
      where: {
        toolId: tool.id,
        accessLevel: 'FULL'
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true }
        }
      }
    });
    
    // Находим всех разработчиков
    const developers = await prisma.user.findMany({
      where: {
        role: 'DEVELOPER'
      },
      select: { id: true, name: true, email: true }
    });
    
    // Объединяем получателей (убираем дубликаты)
    const recipients = new Map<string, { id: string; name: string; email: string }>();
    
    // Добавляем только админов с полным доступом к инструменту
    fullAccessUsers.forEach(access => {
      if (access.user.id !== user.id && access.user.role === 'ADMIN') {
        recipients.set(access.user.id, {
          id: access.user.id,
          name: access.user.name,
          email: access.user.email
        });
      }
    });
    
    // Добавляем всех разработчиков
    developers.forEach(dev => {
      if (dev.id !== user.id) {
        recipients.set(dev.id, {
          id: dev.id,
          name: dev.name,
          email: dev.email
        });
      }
    });
    
    const recipientsList = Array.from(recipients.values());
    
    if (recipientsList.length === 0) {
      return res.status(404).json({ error: 'No administrators or developers found for this tool' });
    }
    
    // Создаем обратную связь
    const feedbackText = `Запрос доступа к инструменту "${tool.name}"\n\nПользователь: ${user.name} (${user.email})\nИнструмент: ${tool.name} (${tool.link})\n\nПожалуйста, предоставьте доступ к этому инструменту.`;
    
    const feedback = await (prisma as any).feedback.create({
      data: {
        tool: tool.link,
        userId: user.id,
        email: user.email,
        text: feedbackText,
        photos: [],
        metadata: {
          type: 'access_request',
          toolId: tool.id,
          toolName: tool.name,
          toolLink: tool.link,
          requestedBy: user.id,
          requestedByName: user.name,
          requestedByEmail: user.email
        }
      }
    });
    
    // Отправляем уведомления получателям от пользователя, который запрашивает доступ
    const { NotificationController } = await import('./notification.js');
    const toolRecord = await prisma.tool.findUnique({
      where: { id: tool.id },
      select: { id: true }
    });
    
    for (const recipient of recipientsList) {
      try {
        await NotificationController.create({
          type: 'INFO',
          channels: ['IN_APP', 'EMAIL', 'TELEGRAM'],
          title: `Запрос доступа к инструменту: ${tool.name}`,
          message: `${user.name} (${user.email}) запрашивает доступ к инструменту "${tool.name}"`,
          senderId: user.id, // Отправляем от пользователя, который запрашивает доступ
          receiverId: recipient.id,
          toolId: toolRecord?.id,
          priority: 'MEDIUM',
          action: {
            type: 'NAVIGATE',
            path: `/app/profile/management`,
            params: { userId: user.id, toolId: tool.id }
          }
        });
      } catch (notifError) {
        console.error(`Failed to send notification to ${recipient.id}:`, notifError);
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Access request sent successfully',
      feedbackId: feedback.id,
      recipientsCount: recipientsList.length
    });
  } catch (error) {
    console.error('Error requesting tool access:', error);
    res.status(500).json({ error: 'Failed to request tool access' });
  }
};

// Получение списка защищенных инструментов (тех, у которых есть записи в таблицах доступа)
export const getProtectedTools = async (req: Request, res: Response): Promise<any> => {
  try {
    // Получаем уникальные toolId из всех таблиц доступа
    const [userAccess, groupAccess, positionAccess] = await Promise.all([
      prisma.userToolAccess.findMany({
        select: { toolId: true }
      }),
      prisma.groupToolAccess.findMany({
        select: { toolId: true }
      }),
      prisma.positionToolAccess.findMany({
        select: { toolId: true }
      })
    ]);

    // Объединяем все toolId в Set для уникальности (фильтруем null/undefined)
    const protectedToolIds = new Set<string>();
    userAccess.forEach(access => {
      if (access.toolId) protectedToolIds.add(access.toolId);
    });
    groupAccess.forEach(access => {
      if (access.toolId) protectedToolIds.add(access.toolId);
    });
    positionAccess.forEach(access => {
      if (access.toolId) protectedToolIds.add(access.toolId);
    });

    // Если нет защищенных инструментов, возвращаем пустой массив
    if (protectedToolIds.size === 0) {
      return res.status(200).json([]);
    }

    // Получаем информацию об инструментах
    const tools = await prisma.tool.findMany({
      where: {
        id: { in: Array.from(protectedToolIds) }
      },
      select: {
        id: true,
        link: true
      }
    });

    res.status(200).json(tools.map(tool => tool.link));
  } catch (error) {
    console.error('Error fetching protected tools:', error);
    res.status(500).json({ error: 'Failed to fetch protected tools' });
  }
};

// Получение запросов на доступ к инструментам
export const getAccessRequests = async (req: Request, res: Response): Promise<any> => {
  try {
    const token = (req as any).token;
    
    if (!token || !token.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { id: true, role: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Получаем все запросы на доступ (feedback с metadata.type === 'access_request')
    const accessRequests = await (prisma as any).feedback.findMany({
      where: {
        metadata: {
          path: ['type'],
          equals: 'access_request'
        },
        status: {
          in: ['NEW', 'IN_PROGRESS']
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Получаем информацию о пользователях отдельно, так как Feedback не имеет прямой связи с User
    const userIds = accessRequests
      .map((req: any) => req.userId || (req.metadata as any)?.requestedBy)
      .filter((id: string | null | undefined): id is string => !!id);
    
    const usersMap = new Map<string, { id: string; name: string; email: string }>();
    if (userIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true }
      });
      users.forEach(user => usersMap.set(user.id, user));
    }
    
    // Добавляем информацию о пользователях к запросам
    const accessRequestsWithUsers = accessRequests.map((req: any) => {
      const userId = req.userId || (req.metadata as any)?.requestedBy;
      return {
        ...req,
        user: userId ? usersMap.get(userId) || null : null
      };
    });
    
    // Фильтруем запросы: показываем только те, к которым у пользователя есть FULL доступ или он ADMIN/DEVELOPER
    const filteredRequests = [];
    
    for (const request of accessRequestsWithUsers) {
      const metadata = request.metadata as any;
      const toolId = metadata?.toolId;
      
      if (!toolId) continue;
      
      // DEVELOPER имеет приоритетный доступ ко всему - видит все запросы
      if (user.role === 'DEVELOPER') {
        filteredRequests.push(request);
        continue;
      }
      
      // Админы видят все запросы
      if (user.role === 'ADMIN') {
        filteredRequests.push(request);
        continue;
      }
      
      // Проверяем, есть ли у пользователя FULL доступ к инструменту
      const userAccess = await prisma.userToolAccess.findUnique({
        where: {
          userId_toolId: {
            userId: user.id,
            toolId: toolId
          }
        }
      });
      
      if (userAccess && userAccess.accessLevel === 'FULL') {
        filteredRequests.push(request);
      }
    }
    
    res.status(200).json(filteredRequests);
  } catch (error) {
    console.error('Error fetching access requests:', error);
    res.status(500).json({ error: 'Failed to fetch access requests' });
  }
};

// Одобрение запроса на доступ
export const approveAccessRequest = async (req: Request, res: Response): Promise<any> => {
  try {
    const token = (req as any).token;
    const { requestId } = req.params;
    const { accessLevel = 'READONLY' } = req.body;
    
    if (!token || !token.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { id: true, role: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Получаем запрос
    const request = await (prisma as any).feedback.findUnique({
      where: { id: requestId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    if (!request) {
      return res.status(404).json({ error: 'Access request not found' });
    }
    
    const metadata = request.metadata as any;
    if (metadata?.type !== 'access_request') {
      return res.status(400).json({ error: 'Not an access request' });
    }
    
    const toolId = metadata?.toolId;
    const requesterId = metadata?.requestedBy || request.userId;
    
    if (!toolId || !requesterId) {
      return res.status(400).json({ error: 'Invalid request data' });
    }
    
    // Проверяем права пользователя на управление доступом к этому инструменту
    // DEVELOPER имеет приоритетный доступ ко всему
    if (user.role === 'DEVELOPER') {
      // DEVELOPER может управлять доступом ко всем инструментам
    } else if (user.role === 'ADMIN') {
      // ADMIN может управлять доступом ко всем инструментам
    } else {
      // Остальные пользователи должны иметь FULL доступ
      const userAccess = await prisma.userToolAccess.findUnique({
        where: {
          userId_toolId: {
            userId: user.id,
            toolId: toolId
          }
        }
      });
      
      if (!userAccess || userAccess.accessLevel !== 'FULL') {
        return res.status(403).json({ error: 'You do not have permission to manage access to this tool' });
      }
    }
    
    // Проверяем, нет ли уже доступа
    const existingAccess = await prisma.userToolAccess.findUnique({
      where: {
        userId_toolId: {
          userId: requesterId,
          toolId: toolId
        }
      }
    });
    
    if (existingAccess) {
      // Обновляем статус запроса
      await (prisma as any).feedback.update({
        where: { id: requestId },
        data: {
          status: 'RESOLVED',
          metadata: {
            ...metadata,
            approved: true,
            approvedBy: user.id,
            approvedAt: new Date(),
            accessLevel: existingAccess.accessLevel
          }
        }
      });
      
      return res.status(200).json({
        success: true,
        message: 'Access already exists',
        access: existingAccess
      });
    }
    
    // Создаем доступ
    const newAccess = await prisma.userToolAccess.create({
      data: {
        userId: requesterId,
        toolId: toolId,
        accessLevel: accessLevel as 'READONLY' | 'CONTRIBUTOR' | 'FULL'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        tool: {
          select: {
            id: true,
            name: true,
            link: true
          }
        }
      }
    });
    
    // Обновляем статус запроса
    await (prisma as any).feedback.update({
      where: { id: requestId },
      data: {
        status: 'RESOLVED',
        metadata: {
          ...metadata,
          approved: true,
          approvedBy: user.id,
          approvedAt: new Date(),
          accessLevel: accessLevel
        }
      }
    });
    
    // Отправляем уведомление запросившему пользователю от администратора, который одобрил
    if (request.user) {
      const { NotificationController } = await import('./notification.js');
      try {
        await NotificationController.create({
          type: 'SUCCESS',
          channels: ['IN_APP', 'EMAIL'],
          title: `Доступ предоставлен: ${metadata?.toolName || 'Инструмент'}`,
          message: `Вам предоставлен доступ к инструменту "${metadata?.toolName || 'Инструмент'}" с уровнем доступа "${accessLevel}"`,
          senderId: user.id, // От администратора, который одобрил
          receiverId: requesterId,
          toolId: toolId,
          priority: 'MEDIUM',
          action: {
            type: 'NAVIGATE',
            path: `/${metadata?.toolLink || ''}`,
            params: {}
          }
        });
      } catch (notifError) {
        console.error('Failed to send approval notification:', notifError);
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Access granted successfully',
      access: newAccess
    });
  } catch (error) {
    console.error('Error approving access request:', error);
    res.status(500).json({ error: 'Failed to approve access request' });
  }
};

// Отклонение запроса на доступ
export const rejectAccessRequest = async (req: Request, res: Response): Promise<any> => {
  try {
    const token = (req as any).token;
    const { requestId } = req.params;
    const { reason } = req.body;
    
    if (!token || !token.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { id: true, role: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Получаем запрос
    const request = await (prisma as any).feedback.findUnique({
      where: { id: requestId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    if (!request) {
      return res.status(404).json({ error: 'Access request not found' });
    }
    
    const metadata = request.metadata as any;
    if (metadata?.type !== 'access_request') {
      return res.status(400).json({ error: 'Not an access request' });
    }
    
    const toolId = metadata?.toolId;
    
    // Проверяем права пользователя на управление доступом к этому инструменту
    // DEVELOPER имеет приоритетный доступ ко всему
    if (user.role === 'DEVELOPER') {
      // DEVELOPER может управлять доступом ко всем инструментам
    } else if (user.role === 'ADMIN') {
      // ADMIN может управлять доступом ко всем инструментам
    } else {
      // Остальные пользователи должны иметь FULL доступ
      const userAccess = await prisma.userToolAccess.findUnique({
        where: {
          userId_toolId: {
            userId: user.id,
            toolId: toolId
          }
        }
      });
      
      if (!userAccess || userAccess.accessLevel !== 'FULL') {
        return res.status(403).json({ error: 'You do not have permission to manage access to this tool' });
      }
    }
    
    // Обновляем статус запроса
    await (prisma as any).feedback.update({
      where: { id: requestId },
      data: {
        status: 'RESOLVED',
        metadata: {
          ...metadata,
          rejected: true,
          rejectedBy: user.id,
          rejectedAt: new Date(),
          rejectionReason: reason || 'Запрос отклонен'
        }
      }
    });
    
    // Отправляем уведомление запросившему пользователю от администратора, который отклонил
    const requesterId = metadata?.requestedBy || request.userId;
    
    if (requesterId) {
      const { NotificationController } = await import('./notification.js');
      try {
        await NotificationController.create({
          type: 'WARNING',
          channels: ['IN_APP', 'EMAIL'],
          title: `Запрос доступа отклонен: ${metadata?.toolName || 'Инструмент'}`,
          message: reason || `Ваш запрос доступа к инструменту "${metadata?.toolName || 'Инструмент'}" был отклонен`,
          senderId: user.id, // От администратора, который отклонил
          receiverId: requesterId,
          toolId: toolId,
          priority: 'MEDIUM'
        });
      } catch (notifError) {
        console.error('Failed to send rejection notification:', notifError);
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Access request rejected'
    });
  } catch (error) {
    console.error('Error rejecting access request:', error);
    res.status(500).json({ error: 'Failed to reject access request' });
  }
};