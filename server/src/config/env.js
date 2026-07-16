import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load server/.env (falls back silently to process env / defaults if absent).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (def) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default('/api/v1'),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  MONGODB_URI: z.string().optional().default(''),
  // In-memory MongoDB is OFF by default — the app always uses MONGODB_URI.
  // Smoke tests opt in explicitly by setting USE_MEMORY_DB=true before boot.
  USE_MEMORY_DB: bool(false),

  REDIS_URL: z.string().optional().default(''),

  JWT_ACCESS_SECRET: z.string().default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().default('dev-refresh-secret-change-me'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@itsybizzz.local'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin@12345'),
  SEED_ADMIN_NAME: z.string().default('System Administrator'),

  STORAGE_PROVIDER: z.enum(['local', 'cloudinary']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('storage'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),

  AI_PROVIDER: z.enum(['mock', 'claude', 'openai']).default('mock'),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().default('ITSYBIZZ Command Center <no-reply@itsybizzz.local>'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Print a readable error and exit — misconfiguration should fail fast.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n❌ Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDev = env.NODE_ENV === 'development';

// Guardrail: never allow default JWT secrets in production.
if (isProd) {
  const weak = ['dev-access-secret-change-me', 'dev-refresh-secret-change-me', 'change-me-access-secret', 'change-me-refresh-secret'];
  if (weak.includes(env.JWT_ACCESS_SECRET) || weak.includes(env.JWT_REFRESH_SECRET)) {
    // eslint-disable-next-line no-console
    console.error('❌ Refusing to start in production with default JWT secrets. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.');
    process.exit(1);
  }
}

export default env;
