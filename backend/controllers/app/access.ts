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
  console.log(toolId, accessLevel, groupName)
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