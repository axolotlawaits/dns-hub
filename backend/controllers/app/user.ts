import { prisma } from "../../server";
import { Request, Response } from "express";
import { spawn } from "child_process" 

export const login = async (req: Request, res: Response) => {
  const { login, pass } = req.body

  const process = spawn('python', ["./utils/ldap.py", login, pass])
  process.stdout.on('data', async data => { 
    try {
      const ldapData = JSON.parse(data)

      const user = await prisma.user.findUnique({where: {login}})
      if (!user) {
        const userData = await prisma.user.create({data: 
          {login, email: ldapData.mail.toLowerCase(), position: ldapData.position, name: ldapData.name, branch: ldapData.branch}
        })
        res.status(200).json(userData)
      } else {
        res.status(200).json(user)
      }
    } catch {
      res.status(400).json({ldapError: 'проверьте введенные данные'})
    }
  }) 
  
  process.on('close', code => {
    console.log('child process exited with code ', code)
  })
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