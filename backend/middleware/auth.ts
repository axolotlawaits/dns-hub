import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { accessPublicKey, refreshPublicKey, prisma, accessPrivateKey, refreshPrivateKey } from '../server.js';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  try {
    const decodedToken = jwt.verify(token, accessPublicKey, { algorithms: ['RS256'] });
    (req as any).token = decodedToken;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Token has expired' });
    }
    return res.sendStatus(401);
  }
}

// Middleware для проверки доступа к конкретному инструменту
export const checkAccess = (toolId: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, positionId, groupId } = (req as any).token;

      if (!userId) {
        return res.status(401).json({ message: 'User ID not found in token' });
      }

      // Проверяем доступ пользователя
      const userAccess = await prisma.userToolAccess.findUnique({
        where: { userId_toolId: { userId, toolId } }
      });

      if (userAccess) return next();

      // Проверяем доступ по должности
      if (positionId) {
        const positionAccess = await prisma.positionToolAccess.findUnique({
          where: { positionId_toolId: { positionId, toolId } }
        });

        if (positionAccess) return next();
      }

      // Проверяем доступ по группе
      if (groupId) {
        const groupAccess = await prisma.groupToolAccess.findUnique({
          where: { groupId_toolId: { groupId, toolId } }
        });

        if (groupAccess) return next();
      }

      return res.status(403).json({ message: 'Access denied' });
    } catch (error) {
      console.error('Error checking access:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
};

// Middleware для проверки доступа по ссылке (legacy)
export const checkAccessByLink = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, positionId, groupId } = (req as any).token;
    const toolLink = req.path.split('/')[2]; // Извлекаем tool link из пути

    if (!userId) {
      return res.status(401).json({ message: 'User ID not found in token' });
    }

    // Находим tool по ссылке
    const tool = await prisma.tool.findFirst({
      where: { link: toolLink }
    });

    if (!tool) {
      return res.status(404).json({ message: 'Tool not found' });
    }

    // Проверяем доступ пользователя
    const userAccess = await prisma.userToolAccess.findUnique({
      where: { userId_toolId: { userId, toolId: tool.id } }
    });

    if (userAccess) return next();

    // Проверяем доступ по должности
    if (positionId) {
      const positionAccess = await prisma.positionToolAccess.findUnique({
        where: { positionId_toolId: { positionId, toolId: tool.id } }
      });

      if (positionAccess) return next();
    }

    // Проверяем доступ по группе
    if (groupId) {
      const groupAccess = await prisma.groupToolAccess.findUnique({
        where: { groupId_toolId: { groupId, toolId: tool.id } }
      });

      if (groupAccess) return next();
    }

    return res.status(403).json({ message: 'Access denied' });
  } catch (error) {
    console.error('Error checking access by link:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

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
    
    // Сохраняем impersonatedBy, если он есть в refresh token
    if (payload.impersonatedBy) {
      newPayload.impersonatedBy = payload.impersonatedBy;
    }
    
    const newAccessToken = jwt.sign(newPayload, accessPrivateKey, { algorithm: 'RS256', expiresIn: '30m' })
    const newRefreshToken = jwt.sign(newPayload, refreshPrivateKey, { algorithm: 'RS256', expiresIn: '90d' })

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',      
      maxAge: 90 * 24 * 60 * 60 * 1000
    })

    res.json(newAccessToken)
  });
}

// Middleware для аутентификации через query параметр (для SSE)
export const authenticateTokenQuery = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const token = req.query.token as string;

  if (!token) {
    return res.status(401).json({ message: 'Token required' });
  }

  try {
    const decodedToken = jwt.verify(token, accessPublicKey, { algorithms: ['RS256'] });
    (req as any).token = decodedToken;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Token has expired' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
};