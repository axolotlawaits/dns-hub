import { authenticate } from 'ldap-authentication'
import { NextFunction, Request, Response } from "express";

export async function ldapAuth(req: Request, res: Response, next: NextFunction) {
  const { login, pass } = req.body
  try {
    const options = {
      ldapOpts: {
        url: 'ldap://ural-dc01.partner.ru',
      },
      userDn: `${login}@dns-shop.ru`, 
      userPassword: pass,
      userSearchBase: 'OU=DNS Users,DC=partner,DC=ru',
      usernameAttribute: 'sAMAccountName',
      username: login, 
      attributes: ['department', 'displayName', 'description', 'mail', 'thumbnailPhoto'] 
    }

    const user = await authenticate(options);
    res.locals.user = user
    if (user.thumbnailPhoto) {
      const thumbnailBase64 = user.thumbnailPhoto.toString('base64');
    }

    next()
  } catch (error) {
    res.status(400).send({ message: 'ldap internal issue' })
  }
}

