import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../server.js';

export const quickSearch = async (req: Request, res: Response): Promise<any>  => {
  const text = req.query.text as string
  const [branches, branchesByAddress, users, tools] = await Promise.all([
    prisma.branch.findMany({
      where: {name: {contains: text, mode: 'insensitive'}, status: {in: [0, 1]}},
      take: 5
    }),
    prisma.branch.findMany({
      where: {address: {contains: text, mode: 'insensitive'}, status: {in: [0, 1]}},
      take: 5
    }),
    prisma.userData.findMany({
      where: {fio: {contains: text, mode: 'insensitive'}},
      take: 5
    }),
    prisma.tool.findMany({
      where: {name: {contains: text, mode: 'insensitive'}, parent_id: {not: null}},
      take: 2
    })
  ])
  console.log(branches, branchesByAddress)
  if (branches) {
    return res.status(200).json({branches, branchesByAddress, users, tools})
  }
  res.status(400).json({error: 'ошибка при поиске филиалов'})
}

export const searchAll = async (req: Request, res: Response): Promise<any>  => {
  const text = req.query.text as string
  const [branches, users, tools] = await Promise.all([
    prisma.branch.findMany({
      where: {name: {contains: text, mode: 'insensitive'}, status: {in: [0, 1]}},
      include: {userData: true, images: true},
      take: 10
    }),
    prisma.userData.findMany({
      where: {fio: {contains: text, mode: 'insensitive'}},
      include: {branch: true, position: true},
      take: 10
    }),
    prisma.tool.findMany({
      where: {name: {contains: text, mode: 'insensitive'}, parent_id: {not: null}},
      take: 3
    })
  ])

  if (branches) {
    return res.status(200).json({branches, users, tools})
  }
  res.status(400).json({error: 'ошибка при поиске филиалов'})
}

/* tools */

export const searchTools = async (req: Request, res: Response): Promise<any>  => {
  const text = req.query.text as string || undefined

  let where: any = { parent_id: { not: null } }
  if (text) {
    where.name = { contains: text, mode: 'insensitive' }
  }

  const result = await prisma.tool.findMany({ where })
  if (result) {
    return res.status(200).json(result)
  }
  res.status(400).json({error: 'ошибка при поиске инструментов'})
}

/* branches */

export const getBranch = async (req: Request, res: Response): Promise<any>  => {
  const branchId = req.params.id as string
  const branch = await prisma.branch.findUnique({
    where: {uuid: branchId},
    include: {userData: {include: {position: true}}, images: true}
  })
  if (branch) {
    return res.status(200).json(branch)
  }
  res.status(400).json({error: 'ошибка при поиске филиала'})
}

export const searchBranches = async (req: Request, res: Response): Promise<any>  => {
  const text = req.query.text as string
  const city = (req.query.city as string) || undefined

  const result = await prisma.branch.findMany({
    where: {name: {contains: text, mode: 'insensitive'}, city: city, status: {in: [0, 1]}},
    take: 10,
    include: {userData: true, images: true}
  })
  if (result) {
    return res.status(200).json(result)
  }
  res.status(400).json({error: 'ошибка при поиске филиалов'})
}

export const getBranchEmployees = async (req: Request, res: Response): Promise<any>  => {
  const branchId = req.params.id as string

  const branchEmployees = await prisma.userData.findMany({ 
    where: {branch_uuid: branchId}, 
    select: {uuid: true, fio: true, position: {select: {name: true}}}
  })
  
  if (branchEmployees) {
    return res.status(200).json(branchEmployees)
  }
  res.status(400).json({error: 'ошибка при поиске филиала'})
}

/* employee */

export const getEmployee = async (req: Request, res: Response): Promise<any> => {
  const employeeId = req.params.id as string
  const employee = await prisma.userData.findUnique({
    where: {uuid: employeeId},
    include: {branch: true, position: true}
  })
  if (employee) {
    return res.status(200).json(employee)
  }
  res.status(400).json({error: 'ошибка при поиске сотрудника'})
}

export const searchEmployees = async (req: Request, res: Response): Promise<any> => {
  const text = req.query.text as string
  const positionName = (req.query.position as string) || undefined

  const employees = await prisma.userData.findMany({
    where: {fio: {contains: text, mode: 'insensitive'}, position: {name: positionName}},
    take: 10,
    include: {branch: true, position: true}
  })
  if (employees) {
    res.status(200).json(employees)
  } else {
    res.status(400).json({error: 'ошибка при поиске сотрудников'})
  }
}

export const searchEmployeesSummary = async (req: Request, res: Response): Promise<any> => {
  const text = req.query.text as string

  const employees = await prisma.userData.findMany({
    where: {fio: {contains: text, mode: 'insensitive'}},
    take: 10,
    select: {uuid: true, fio: true, position: {select: {name: true}}}
  })
  if (employees) {
    res.status(200).json(employees)
  } else {
    res.status(400).json({error: 'ошибка при поиске сотрудников'})
  }
}

/* filters data */

export const searchCities = async (req: Request, res: Response): Promise<any> => {
  const cities = await prisma.branch.findMany({
    select: {city: true},
    distinct: ['city'],
    orderBy: {city: 'asc'}
  })
  if (cities) {
    res.status(200).json(cities.map(city => city.city))
  } else {
    res.status(400).json({error: 'ошибка при поиске'})
  }
}

export const searchPositions = async (req: Request, res: Response): Promise<any> => {
  const positions = await prisma.position.findMany({
    select: {name: true},
    distinct: ['name'],
    orderBy: {name: 'asc'}
  })
  if (positions) {
    res.status(200).json(positions.map(pos => pos.name))
  } else {
    res.status(400).json({error: 'ошибка при поиске'})
  }
}

/* get all items */

export const getAllGroups = async (req: Request, res: Response): Promise<any> => {
  const groups = await prisma.group.findMany({include: { groupToolAccesses: true }})
  if (groups) {
    res.status(200).json(groups) 
  } else {
    res.status(400).json({error: 'ошибка при поиске должностей'})
  }
}

export const getAllPositions = async (req: Request, res: Response): Promise<any> => {
  const positions = await prisma.position.findMany({include: { positionToolAccesses: true }})
  if (positions) {
    res.status(200).json(positions) 
  } else {
    res.status(400).json({error: 'ошибка при поиске должностей'})
  }
}

export const getAllUsers = async (req: Request, res: Response): Promise<any> => {
  const users = await prisma.user.findMany({include: { userToolAccesses: true }})
  if (users) {
    res.status(200).json(users) 
  } else {
    res.status(400).json({error: 'ошибка при поиске должностей'})
  }
}