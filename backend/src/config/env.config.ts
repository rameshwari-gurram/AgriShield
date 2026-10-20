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
  OPEN_METEO_BASE_URL: z.string().url().default('https://api.open-meteo.com/v1/forecast'),
  WEATHER_REQUEST_TIMEOUT_MS: z.string().default('8000').transform((val) => parseInt(val, 10)),
  // Copernicus Data Space / Sentinel Hub Provider Settings (Module 7)
  COPERNICUS_CLIENT_ID: z.string().optional(),
  COPERNICUS_CLIENT_SECRET: z.string().optional(),
  COPERNICUS_AUTH_URL: z.string().url().default('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'),
  COPERNICUS_BASE_URL: z.string().url().default('https://sh.dataspace.copernicus.eu'),
  SATELLITE_REQUEST_TIMEOUT_MS: z.string().default('15000').transform((val) => parseInt(val, 10)),
  // Development Auth OTP Settings
  DEV_PRINT_OTP: z
    .preprocess((val) => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        const lower = val.trim().toLowerCase();
        if (lower === 'false' || lower === '0' || lower === 'no') return false;
        return true;
      }
      return true;
    }, z.boolean())
    .default(true),
  // Automated Risk Evaluation Settings (Module 10 Stage 10.3)
  AUTOMATED_RISK_EVALUATION_ENABLED: z
    .preprocess((val) => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return false;
    }, z.boolean())
    .default(false),
  AUTOMATED_RISK_EVALUATION_DRY_RUN: z
    .preprocess((val) => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') return val.toLowerCase() !== 'false';
      return true;
    }, z.boolean())
    .default(true),
  AUTOMATED_RISK_EVALUATION_BATCH_SIZE: z
    .preprocess((val) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') return parseInt(val, 10);
      return 25;
    }, z.number().int().positive())
    .default(25),
  AUTOMATED_RISK_EVALUATION_TIMEOUT_MS: z
    .preprocess((val) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') return parseInt(val, 10);
      return 60000;
    }, z.number().int().positive())
    .default(60000),
  AUTOMATED_RISK_EVALUATION_LOCK_PORT: z
    .preprocess((val) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') return parseInt(val, 10);
      return 54329;
    }, z.number().int().positive().max(65535))
    .default(54329),
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
