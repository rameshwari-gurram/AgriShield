import { createApp } from './app.js';
import { env } from './config/env.config.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import http from 'http';

const startServer = async () => {
  const app = createApp();
  const server = http.createServer(app);

  // Initialize Database Connection
  await connectDatabase();

  server.listen(env.PORT, () => {
    logger.info(`=======================================================`);
    logger.info(`AgriShield Backend API running on port ${env.PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
    logger.info(`Health check: http://localhost:${env.PORT}/api/${env.API_VERSION}/health`);
    logger.info(`=======================================================`);
  });

  // Graceful Shutdown Handlers
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);

    server.close(async () => {
      logger.info('HTTP server closed');
      await disconnectDatabase();
      logger.info('Process terminated gracefully');
      process.exit(0);
    });

    // Fallback force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
