import { prisma } from "../../server.js"
import { Request, Response } from "express"

export const addRoute = async (req: Request, res: Response): Promise<any> => {
  let { name, contractor, rrs, filials } = req.body
  let filialsToObj = filials.map((fil: string, index: number) => ({name: fil, place: index + 1}))

  const newRoute = await prisma.route.create({
    data: { name, contractor, rrs, filials: { create: filialsToObj }},
    include: {filials: true}
  })

  if (newRoute) {
    filialsToObj = filials.map((fil: string, index: number) => ({routeId: newRoute.id, name: fil, place: index + 1}))
    await prisma.routeDay.create({
      data: {routeId: newRoute.id, day: new Date(), filials: { create: filialsToObj }}
    })
    res.status(200).json(newRoute)
  } else {
    res.status(400).json({error: 'ошибка создания маршрута'})
  }
}

export const getRoutes = async (req: Request, res: Response): Promise<any> => {
  const routesData = await prisma.route.findMany({include: {filials: {where: {routeDayId: null}, orderBy: {place: 'asc'}}}})

  if (routesData) {
    res.status(200).json(routesData)
  } else {
    res.status(400).json({error: 'не найдено маршрута'})
  }
}

export const updateRoute = async (req: Request, res: Response): Promise<any> => {
  const routeId = req.params.id
  let { name, contractor, rrs, filials } = req.body

  const updatedFilials = await Promise.all(filials.map((filial: any) => {
    return prisma.filial.update({
        where: { id: filial.id },
        data: {
            place: filial.place,
            name: filial.name,
        }})
  }))
  if (updatedFilials) {
    const updatedRoute = await prisma.route.update({
      where: {id: routeId},
      data: { name, contractor, rrs }
    })
  
  
    if (updatedRoute) {
      res.status(200).json(updatedRoute)
    } else {
      res.status(400).json({error: 'не удалось обновить маршрут'})
    }
  }
}

export const deleteRoute = async (req: Request, res: Response): Promise<any> => {
  const routeId = req.params.id

  const deletedRoute = await prisma.route.delete({where: {id: routeId}})
  
  if (deletedRoute) {
    res.status(200).json(deletedRoute)
  } else {
    res.status(400).json({error: 'не удалось удалить маршрут'})
  }
}
