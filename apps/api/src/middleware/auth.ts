import { Request, Response, NextFunction } from 'express';
import { db } from '../services/db';
import { User } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing or malformed Authorization header. Expected Bearer token.',
      },
    });
  }

  const token = authHeader.split(' ')[1];

  // Mock / Development Auth Handling
  if (token.includes('client') || token === 'mock-client-jwt') {
    const client = await db.getUserById('11111111-1111-1111-1111-111111111111');
    if (client) {
      req.user = client;
      return next();
    }
  }

  if (token.includes('freelancer') || token === 'mock-freelancer-jwt') {
    const freelancer = await db.getUserById('22222222-2222-2222-2222-222222222222');
    if (freelancer) {
      req.user = freelancer;
      return next();
    }
  }

  if (token.includes('admin') || token === 'mock-admin-jwt') {
    const admin = await db.getUserById('33333333-3333-3333-3333-333333333333');
    if (admin) {
      req.user = admin;
      return next();
    }
  }

  // Fallback to default client user for testing
  const defaultUser = await db.getUserById('11111111-1111-1111-1111-111111111111');
  if (defaultUser) {
    req.user = defaultUser;
    return next();
  }

  return res.status(401).json({
    error: {
      code: 'UNAUTHENTICATED',
      message: 'Invalid authorization token.',
    },
  });
};

export const requireRole = (role: 'client' | 'freelancer' | 'admin') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'User not authenticated' } });
    }
    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Role '${role}' required, but user has role '${req.user.role}'.`,
        },
      });
    }
    next();
  };
};
