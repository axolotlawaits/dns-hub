import { prisma } from "../../server";
import { Request, Response } from "express";

export const login = async (req: Request, res: Response) => {
  const { login, pass } = req.body

  const data = res.locals.user
  console.log(data)
    try {
      const user = await prisma.user.findUnique({where: {login}})
      if (!user) {
        const userData = await prisma.user.create({data: 
          {login, email: data.mail.toLowerCase(), position: data.description, name: data.displayName, branch: data.department}
        })
        console.log(userData)
        res.status(200).json(userData)
      } else {
        res.status(200).json(user)
      }
    } catch {
      res.status(400).json({ldapError: 'проверьте введенные данные'})
    }
  }

// export const searchUser = async (req: Request, res: Response): Promise<any> => {
//   const name = req.query.search as string
//   const projects = await prisma.userData.findMany({
//     where: {name: {contains: name, mode: 'insensitive'}},
//     take: 5,
//     include: {images: true}
//   })
//   if (projects) {
//     res.status(200).json(projects)
//   } else {
//     res.status(400).json({error: 'ошибка при поиске проектов'})
//   }
// }