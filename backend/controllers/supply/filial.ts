import { prisma } from "../../server"
import { Request, Response } from "express"

export const addFilialData = async (req: Request, res: Response): Promise<any> => {
  let filialId = req.params.id
  let { loaders, feedback } = req.body

  const newRoute = await prisma.filial.update({
    where: { id: filialId },
    data: {
      feedback,
      loaders: {
        create: loaders
      }
    }
  })

  if (newRoute) {
    res.status(200).json(newRoute)
  } else {
    res.status(400).json({error: 'ошибка создания маршрута'})
  }
}

export const getFilials = async (req: Request, res: Response): Promise<any> => {
  const city = req.params.id

  const filials = await prisma.branch.findMany({
    where: {
      city, 
      status: {in: [0, 1]}, 
      type: {in: ['Магазин', 'Сервиcный центр', 'Региональный цех ремонта', 'РСЦ']},
    },
    select: {name: true}
  })
  
  if (filials) {
    return res.status(200).json(filials.map(filial => filial.name))
  }
  res.status(400).json({error: 'ошибка при поиске филиалов'})
}