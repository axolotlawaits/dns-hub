import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { accessPublicKey, refreshPublicKey, prisma, accessPrivateKey } from '../server.js';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  try {
    const decodedToken = jwt.verify(token, accessPublicKey, { algorithms: ['RS256'] });
    req.token = decodedToken;

    next();
  } catch (err) {
    console.log(err);
    return res.sendStatus(401);
  }
}

export const checkAccess = async (req: Request, res: Response, next: NextFunction) => {
  const { userId, positionName, groupName } = req.token
  /* need to get toolId here */
  const temp = 'dd6ec264-4e8c-477a-b2d6-c62a956422c0'

  const userAccess = await prisma.userToolAccess.findUnique({
    where: { userId_toolId: { userId, toolId: temp }}
  })
  console.log(userAccess)
  if (userAccess) return next()

  const positionAccess = await prisma.positionToolAccess.findUnique({
    where: {positionName_toolId: { positionName, toolId: temp }}
  })
  console.log(positionAccess)
  if (positionAccess) return next()

  const groupAccess = await prisma.groupToolAccess.findUnique({
    where: {groupName_toolId: { groupName, toolId: temp }}
  })
  console.log(groupAccess)
  if (groupAccess) return next()

  return res.status(403).json({ message: 'Access denied' });
}

export const refreshToken = async (req: Request, res: Response): Promise<any> => {
  const token = req.cookies.refreshToken

  if (!token) {
    return res.status(401).json({ message: 'No refresh token provided' });
  }
  jwt.verify(token, refreshPublicKey, async (err, payload) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    const newAccessToken = jwt.sign(payload, accessPrivateKey, { algorithm: 'RS256', expiresIn: '1m' })

    res.json(newAccessToken)
  });
}