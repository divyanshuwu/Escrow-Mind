import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[API Error]', err);

  const status = err.status || 500;
  const code = err.code || (status === 502 ? 'PAYPAL_API_ERROR' : 'INTERNAL_SERVER_ERROR');
  const message = err.message || 'An unexpected server error occurred.';

  res.status(status).json({
    error: {
      code,
      message,
      debugId: err.debugId,
      details: err.details,
    },
  });
};
