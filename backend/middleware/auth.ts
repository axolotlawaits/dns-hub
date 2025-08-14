import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { accessPublicKey, refreshPublicKey, prisma, accessPrivateKey, refreshPrivateKey } from '../server.js';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  try {
    const decodedToken = jwt.verify(token, accessPublicKey, { algorithms: ['RS256'] });
    (req as any).token = decodedToken;

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Token has expired' });
    }
    console.log(err);
    return res.sendStatus(401);
  }
}

export const checkAccess = async (req: Request, res: Response, next: NextFunction) => {
  const { userId, positionId, groupId } = (req as any).token
  /* need to get toolId here */
  const temp = 'dd6ec264-4e8c-477a-b2d6-c62a956422c0'

  const userAccess = await prisma.userToolAccess.findUnique({
    where: { userId_toolId: { userId, toolId: temp }}
  })

  if (userAccess) return next()

  const positionAccess = await prisma.positionToolAccess.findUnique({
    where: {positionId_toolId: { positionId, toolId: temp }}
  })

  if (positionAccess) return next()

  const groupAccess = await prisma.groupToolAccess.findUnique({
    where: {groupId_toolId: { groupId, toolId: temp }}
  })

  if (groupAccess) return next()

  return res.status(403).json({ message: 'Access denied' });
}

export const refreshToken = async (req: Request, res: Response): Promise<any> => {
  const token = req.cookies.refreshToken

  if (!token) {
    return res.status(401).json({ message: 'No refresh token provided' });
  }
  jwt.verify(token, refreshPublicKey, async (err: any, payload: any) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }
    const { exp, iat, ...newPayload } = payload 
    
    const newAccessToken = jwt.sign(newPayload, accessPrivateKey, { algorithm: 'RS256', expiresIn: '30m' })
    const newRefreshToken = jwt.sign(newPayload, refreshPrivateKey, { algorithm: 'RS256', expiresIn: '90d' })

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',      
      maxAge: 90 * 24 * 60 * 60 * 1000
    })

    console.log(`sending new access token with payload`)
    res.json(newAccessToken)
  });
}