import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import projectsRouter from './routes/projects';
import paypalRouter from './routes/paypal';
import milestonesRouter from './routes/milestones';
import workflowsRouter from './routes/workflows';
import webhooksRouter from './routes/webhooks';
import invoicesRouter from './routes/invoices';
import ledgerRouter from './routes/ledger';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

export function createApp(): Application {
  const app = express();

  // Webhooks route MUST use raw body parser before express.json()
  app.use('/api', webhooksRouter);

  // General middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/healthz', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'escrowmind-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // API Routes
  app.use('/api', projectsRouter);
  app.use('/api', paypalRouter);
  app.use('/api', milestonesRouter);
  app.use('/api', workflowsRouter);
  app.use('/api', invoicesRouter);
  app.use('/api', ledgerRouter);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
