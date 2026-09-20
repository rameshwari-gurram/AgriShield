import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.config.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { notFoundMiddleware } from './middleware/notFound.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { apiRoutes } from './routes/index.js';

export const createApp = (): Application => {
  const app: Application = express();

  // Security Middlewares
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    })
  );

  // Request Parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request Logging with correlation ID
  app.use(requestLogger);

  // Base Root Route
  app.get('/', (_req, res) => {
    res.json({
      name: 'AgriShield Parametric Backend API',
      status: 'active',
      version: '1.0.0',
      documentation: '/docs',
      api: `/api/${env.API_VERSION}`,
    });
  });

  // Versioned API Routes (/api/v1/...)
  app.use('/api', apiRoutes);

  // 404 & Central Error Handling
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};
