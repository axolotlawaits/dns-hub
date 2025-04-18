import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../server';

export const quickSearch = async (req: Request, res: Response) => {
  const text = req.query.text as string
  const result = await prisma.branch.findMany({
    where: {name: {contains: text, mode: 'insensitive'}, status: {in: [0, 1]}},
    take: 5
  })
  if (result) {
    return res.status(200).json(result)
  }
  res.status(400).json({error: 'ошибка при поиске филиалов'})
}

export const getBranch = async (req: Request, res: Response) => {
  const branchId = req.params.id as string
  const branch = await prisma.branch.findMany({
    where: {uuid: branchId},
    include: {userData: true, images: true}
  })
  if (branch) {
    return res.status(200).json(branch)
  }
  res.status(400).json({error: 'ошибка при поиске филиала'})
}

export const searchBranches = async (req: Request, res: Response) => {
  const text = req.query.text as string
  const result = await prisma.branch.findMany({
    where: {name: {contains: text, mode: 'insensitive'}, status: {in: [0, 1]}},
    take: 10,
    include: {userData: true, images: true}
  })
  if (result) {
    return res.status(200).json(result)
  }
  res.status(400).json({error: 'ошибка при поиске филиалов'})
}