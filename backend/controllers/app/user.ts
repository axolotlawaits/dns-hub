import { prisma } from "../../server";
import { Request, Response } from "express";

export const login = async (req: Request, res: Response) => {
  const { login, pass } = req.body
  const loginLowerCase = login.toLowerCase()

  const data = res.locals.user
  console.log(data)
  try {
    const user = await prisma.user.findUnique({where: {login: loginLowerCase}})
    if (!user) {
      const userData = await prisma.user.create({
        data: {
          login: loginLowerCase, 
          email: data.mail.toLowerCase(), 
          position: data.description, 
          name: data.displayName, 
          branch: data.department,
          image: data.thumbnailPhoto || null
        }
      })
      res.status(200).json(userData)
    } else {
      res.status(200).json(user)
    }
  } catch {
    res.status(400).json({ldapError: 'проверьте введенные данные'})
  }
}

