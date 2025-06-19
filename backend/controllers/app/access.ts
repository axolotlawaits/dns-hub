import { Request, Response } from 'express';
import { prisma } from '../../server.js';
import { error } from 'console';

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