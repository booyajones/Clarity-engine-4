import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  MASTERCARD_CONSUMER_KEY: z.string().optional(),
  MASTERCARD_KEY: z.string().optional(),
  MASTERCARD_PRIVATE_KEY: z.string().optional(),
  MASTERCARD_CERT: z.string().optional(),
  MASTERCARD_KEY_ALIAS: z.string().optional(),
  MASTERCARD_KEYSTORE_PASSWORD: z.string().optional(),
  MASTERCARD_KEYSTORE_ALIAS: z.string().optional(),
  MASTERCARD_CLIENT_ID: z.string().optional(),
  MASTERCARD_P12_PATH: z.string().optional(),
  MASTERCARD_ENVIRONMENT: z.enum(['production', 'sandbox']).default('sandbox'),
  MASTERCARD_WEBHOOK_SECRET: z.string().optional(),
  ENABLE_MICROSERVICES: z.coerce.boolean().default(false),
  AKKIO_API_KEY: z.string().optional(),
  DB_POOL_SIZE: z.coerce.number().default(20),
  DB_POOL_MIN: z.coerce.number().default(5),
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  BIGQUERY_PROJECT_ID: z.string().optional(),
  BIGQUERY_DATASET: z.string().default('SE_Enrichment'),
  BIGQUERY_TABLE: z.string().default('supplier'),
  BIGQUERY_MATCH_METRICS_TABLE: z.string().default('fuzzy_match_metrics'),
  BIGQUERY_CREDENTIALS: z.string().optional(),
  BIGQUERY_KEY_FILE: z.string().optional(),
  DISABLE_OPENAI: z.coerce.boolean().default(false),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  throw new Error('Invalid environment variables');
}

export const env = _env.data;
