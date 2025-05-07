import { prisma } from "../../server";
import { Request, Response } from "express";

export const login = async (req: Request, res: Response) => {
  const { login, pass } = req.body;
  const loginLowerCase = login.toLowerCase();

  const data = res.locals.user;
  
  try {
    const user = await prisma.user.findUnique({
      where: { login: loginLowerCase }
    });

    if (!user) {
      const imageBase64 = data.thumbnailPhoto 
        ? Buffer.from(data.thumbnailPhoto).toString('base64') 
        : null;

      const userData = {
        login: loginLowerCase,
        email: data.mail?.toLowerCase() || null,
        position: data.description || null,
        name: data.displayName || null,
        branch: data.department || null,
        image: imageBase64
      };

      const newUser = await prisma.user.create({
        data: userData
      });

      console.log('Новый пользователь создан:', newUser);
      res.status(200).json(newUser);
    } else {
      res.status(200).json(user);
    }
  } catch (error) {
    console.error('Ошибка при входе:', error);
    res.status(400).json({ ldapError: 'Проверьте введенные данные' });
  }
};