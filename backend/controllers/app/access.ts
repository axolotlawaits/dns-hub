import { Request, Response } from 'express';
import { prisma } from '../../server.js';

export const getPositionGroupAccessInfo = async (req: Request, res: Response): Promise<any>  => {
  const positionGroup = req.params.positionGroup
  
  const access = await prisma.positionToolAccess.findMany({
    where: {}
  })
}