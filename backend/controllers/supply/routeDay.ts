import { prisma } from "../../server.js"
import { Request, Response } from "express"

/* logic used in scheduler, left for further purposes */
export const addRouteDay = async (req: Request, res: Response): Promise<any> => {
  let routeId = req.params.id
  let { day } = req.body

  const routeFilials = await prisma.route.findUnique({
    where: {id: routeId}, 
    select: {filials: {where: {routeDayId: null}, select: {name: true, routeId: true, place: true}}}
  })

  if (routeFilials) {
    const newRoute = await prisma.routeDay.create({
      data: { routeId, day, filials: { create: routeFilials?.filials } }
    })
    if (newRoute) {
      res.status(200).json(newRoute)
    } else {
      res.status(400).json({error: 'ошибка создания маршрута'})
    }
  }
}

/* actual scheduler */ 

export const scheduleRouteDay = async (): Promise<any> => {
  const allRoutes = await prisma.route.findMany({
    select: {id: true, filials: {
      where: {routeDayId: null}, 
      select: {name: true, routeId: true, place: true}
    }}
  })

  if (allRoutes) {
    for (let route of allRoutes) {
      let today = new Date()
      today.setHours(0,0,0,0)
      const exist = await prisma.routeDay.findMany({
        where: {routeId: route.id, day: {gte: today}}
      })
      if (exist.length === 0) {
        await prisma.routeDay.create({
          data: { routeId: route.id, day: new Date, filials: { create: route.filials } }
        })
      }
    }
  }
}

export const getRouteDays = async (req: Request, res: Response): Promise<any> => {
  let routeId = req.params.id

  const routeData = await prisma.routeDay.findMany({ 
    where: { routeId },
    include: { filials: { include: { loaders: { include: { filial: true }}}, orderBy: {place: 'asc'}}, route: true},
    orderBy: {day: 'desc'}
  })

  if (routeData) {
    res.status(200).json(routeData)
  } else {
    res.status(400).json({error: 'не найдено маршрута'})
  }
}

/* day */

export const getAllRoutesDay = async (req: Request, res: Response): Promise<any> => {
  const queryDate = req.query.date as string

  const startDate = new Date(queryDate)
  const endDate = new Date(queryDate)
  startDate.setDate(startDate.getDate() - 1)
  console.log(startDate, endDate)
  const dayData = await prisma.routeDay.findMany({ 
    where: { createdAt: { gte: startDate, lt: endDate }},
    include: { filials: { include: { loaders: { include: { filial: true }}}, orderBy: {place: 'asc'}}, route: true},
    orderBy: {day: 'desc'}
  })
  console.log(dayData)
  if (dayData) {
    res.status(200).json(dayData)
  } else {
    res.status(400).json({error: 'не найдено маршрута'})
  }
}