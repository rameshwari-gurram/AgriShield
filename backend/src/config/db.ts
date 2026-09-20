import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';
import { env } from './env.config.js';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });

if (env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('Connected to PostgreSQL via Prisma ORM');
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL database:', error);
    // Don't kill process immediately on connection failure during local boot if docker is starting up
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('Disconnected from PostgreSQL database');
  } catch (error) {
    logger.error('Error disconnecting from database:', error);
  }
};
