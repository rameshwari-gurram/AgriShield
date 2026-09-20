import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_VERSION: z.string().default('v1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').default('postgresql://postgres:postgres_secure_password@localhost:5432/agrishield_db?schema=public'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters').default('development_jwt_secret_key_12345'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    process.exit(1);
  }

  return result.data;
};

export const env = parseEnv();
export type EnvConfig = z.infer<typeof envSchema>;
