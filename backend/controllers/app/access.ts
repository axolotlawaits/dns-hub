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
    create: { groupId, toolId, accessLevel }
  })
  if (access) {
    res.status(200).json(access)
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
    create: { positionId, toolId, accessLevel }
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