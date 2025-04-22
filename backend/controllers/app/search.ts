import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../server';

export const quickSearch = async (req: Request, res: Response) => {
  const text = req.query.text as string
  const branches = await prisma.branch.findMany({
    where: {name: {contains: text, mode: 'insensitive'}, status: {in: [0, 1]}},
    take: 5
  })
  const users = await prisma.userData.findMany({
    where: {fio: {contains: text, mode: 'insensitive'}},
    take: 5
  })
  if (branches && users) {
    return res.status(200).json({branches, users})
  }
  res.status(400).json({error: 'ошибка при поиске филиалов'})
}

export const getBranch = async (req: Request, res: Response) => {
  const branchId = req.params.id as string
  const branch = await prisma.branch.findUnique({
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

/* employee */

export const getEmployee = async (req: Request, res: Response) => {
  const employeeId = req.params.id as string
  const employee = await prisma.userData.findUnique({
    where: {uuid: employeeId},
    include: {branch: true}
  })
  if (employee) {
    return res.status(200).json(employee)
  }
  res.status(400).json({error: 'ошибка при поиске филиала'})
}

export const searchEmployees = async (req: Request, res: Response): Promise<any> => {
  const text = req.query.search as string
  const employee = await prisma.userData.findMany({
    where: {fio: {contains: text, mode: 'insensitive'}},
    take: 10,
    include: {branch: true}
  })
  if (employee) {
    res.status(200).json(employee)
  } else {
    res.status(400).json({error: 'ошибка при поиске проектов'})
  }
}