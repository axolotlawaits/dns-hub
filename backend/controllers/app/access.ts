import { Request, Response } from 'express';
import { prisma } from '../../server.js';
import { AccessLevel } from '@prisma/client';

/* full access info for user */

export const getFullAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const userId = req.params.id 
  const userEmail = req.query.email as string
  /*fetch user position and group info */
  const userPosAndGroup = await prisma.userData.findUnique({
    where: {email: userEmail},
    select: {
      position: {
        select: {
          name: true,
          group: { select: { name: true } }
        }
      }
    }
  })
  
  if (userPosAndGroup) {
    const groupName = userPosAndGroup?.position?.group?.name
    const positionName = userPosAndGroup?.position?.name

    const [user, group, position] = await Promise.all([
      prisma.userToolAccess.findMany({where: {userId}, select: {toolId: true, accessLevel: true}}),
      prisma.groupToolAccess.findMany({where: {groupName}, select: {toolId: true, accessLevel: true}}),
      prisma.positionToolAccess.findMany({where: {positionName}, select: {toolId: true, accessLevel: true}})
    ])

    if (user && group && position) {
      const combined = [...user, ...group, ...position]
      const levels: Record<AccessLevel, number> = { READONLY: 1, CONTRIBUTOR: 2, FULL: 3 }
      const accessMap = new Map<string, {toolId: string, accessLevel: string}>()
      
      for (const entry of combined) {
        const existing = accessMap.get(entry.toolId)
        if (!existing) {
          accessMap.set(entry.toolId, entry)
        } else {
          if (levels[entry.accessLevel] > levels[existing.accessLevel as AccessLevel]) {
            accessMap.set(entry.toolId, entry)
          }
        }
      }
      const uniqueAccessWithHighestLevel = Array.from(accessMap.values())

      res.status(200).json(uniqueAccessWithHighestLevel)
    } else {
      res.status(400).json({error: 'ошибка при поиске инструментов с доступом'})
    }
  }
}

/* group access  */

export const getGroupAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const groupName = req.params.id
  
  const access = await prisma.groupToolAccess.findMany({where: { groupName }})
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка при поиске информации о доступе'})
  }
}

export const updateGroupAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const { toolId, accessLevel } = req.body
  const groupName = req.params.id

  const access = await prisma.groupToolAccess.upsert({
    where: {
      groupName_toolId: { groupName, toolId,}
    },
    update: { accessLevel },
    create: { groupName, toolId, accessLevel }
  })
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка обновления доступа'})
  }
}

export const deleteGroupAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const { toolId } = req.body
  const groupName = req.params.id

  const access = await prisma.groupToolAccess.delete({
    where: { groupName_toolId: { groupName, toolId }}
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
    create: { userId, toolId, accessLevel }
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
  const positionName = req.params.id
  
  const access = await prisma.positionToolAccess.findMany({where: { positionName }})
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка при поиске информации о доступе'})
  }
}

export const updatePositionAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const { toolId, accessLevel } = req.body
  const positionName = req.params.id

  const access = await prisma.positionToolAccess.upsert({
    where: {
      positionName_toolId: { positionName, toolId,}
    },
    update: { accessLevel },
    create: { positionName, toolId, accessLevel }
  })
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка обновления доступа'})
  }
}

export const deletePositionAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const { toolId } = req.body
  const positionName = req.params.id

  const access = await prisma.positionToolAccess.delete({
    where: { positionName_toolId: { positionName, toolId }}
  })
  if (access) {
    res.status(200).json(access)
  } else {
    res.status(400).json({error: 'ошибка обновления доступа'})
  }
}