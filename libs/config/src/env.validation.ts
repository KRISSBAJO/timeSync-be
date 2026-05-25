import { z } from 'zod';

const productionLikeEnvironments = new Set(['staging', 'production']);

const booleanString = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return ['true', '1', 'yes'].includes(String(value).toLowerCase());
  }

  return false;
}, z.boolean());

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('TimeSync HR API'),
    PORT: z.coerce.number().int().positive().default(4040),
    API_PREFIX: z.string().min(1).default('api/v1'),
    TRUST_PROXY: booleanString.default(false),
    JSON_BODY_LIMIT: z.string().min(1).default('6mb'),
    FORM_BODY_LIMIT: z.string().min(1).default('6mb'),
    FRONTEND_APP_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
    CORS_CREDENTIALS: booleanString.default(true),
    CORS_MAX_AGE_SECONDS: z.coerce.number().int().nonnegative().default(600),
    COOKIE_DOMAIN: optionalNonEmptyString,
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    SWAGGER_ENABLED: booleanString.default(true),
    SWAGGER_PATH: z.string().min(1).default('docs'),
    SWAGGER_USERNAME: optionalNonEmptyString,
    SWAGGER_PASSWORD: optionalNonEmptyString,
    SECURITY_HSTS_ENABLED: booleanString.default(false),
    SECURITY_HSTS_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(31536000),
    RELEASE_SHA: optionalNonEmptyString,
    DEPLOYMENT_TARGET: optionalNonEmptyString,
    RUNTIME_CHECKS_STRICT: booleanString.default(false),
    DATABASE_URL: z.string().min(1),
    PRISMA_TRANSACTION_MAX_WAIT_MS: z.coerce.number().int().positive().default(15000),
    PRISMA_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    REDIS_HOST: z.string().min(1).default('localhost'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    BACKUP_ENABLED: booleanString.default(false),
    BACKUP_DATABASE_URL: optionalNonEmptyString,
    BACKUP_STORAGE_PROVIDER: z.enum(['local', 's3', 'external']).default('local'),
    BACKUP_LOCAL_PATH: z.string().min(1).default('./storage/backups'),
    BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    BACKUP_S3_BUCKET: optionalNonEmptyString,
    AUTH_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    AUTH_COOKIE_SECURE: booleanString.default(false),
    AUTH_PLATFORM_ADMIN_EMAIL: z.string().email().optional(),
    AUTH_PLATFORM_ADMIN_PASSWORD: z.string().min(12).optional(),
    THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60000),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
    DOCUMENT_STORAGE_PROVIDER: z.enum(['external', 'local', 's3']).default('local'),
    DOCUMENT_STORAGE_LOCAL_PUBLIC_BASE_URL: z.string().optional(),
    DOCUMENT_STORAGE_LOCAL_ROOT_PATH: z.string().min(1).default('./storage/documents'),
    DOCUMENT_STORAGE_S3_ENDPOINT: z.string().optional(),
    DOCUMENT_STORAGE_S3_BUCKET: z.string().optional(),
    DOCUMENT_STORAGE_S3_REGION: z.string().optional(),
    DOCUMENT_STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
    DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
    DOCUMENT_STORAGE_S3_PUBLIC_BASE_URL: z.string().optional(),
    DOCUMENT_UPLOAD_TOKEN_SECRET: z.string().optional(),
    DOCUMENT_UPLOAD_INTENT_TTL_SECONDS: z.coerce.number().int().positive().default(600),
    DOCUMENT_STORAGE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(104857600),
    NOTIFICATION_EMAIL_FROM: z.string().email().optional(),
    MAIL_PROVIDER: z.string().optional(),
    MAIL_HOST: z.string().optional(),
    MAIL_SERVER: z.string().optional(),
    MAIL_PORT: z.coerce.number().int().positive().optional(),
    MAIL_SECURE: booleanString.optional(),
    MAIL_USER: z.string().optional(),
    MAIL_PASS: z.string().optional(),
    ZEPTOMAIL_TOKEN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const isProductionLike = productionLikeEnvironments.has(env.NODE_ENV);
    const corsOrigins = env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (isProductionLike && corsOrigins.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must contain explicit frontend origins in staging and production.',
      });
    }

    if (isProductionLike && corsOrigins.includes('*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'Wildcard CORS origins are not allowed in staging or production.',
      });
    }

    if (env.DOCUMENT_STORAGE_PROVIDER === 's3') {
      for (const key of [
        'DOCUMENT_STORAGE_S3_ENDPOINT',
        'DOCUMENT_STORAGE_S3_BUCKET',
        'DOCUMENT_STORAGE_S3_ACCESS_KEY_ID',
        'DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when DOCUMENT_STORAGE_PROVIDER=s3.`,
          });
        }
      }
    }

    if (env.NODE_ENV === 'production' && !env.AUTH_COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_COOKIE_SECURE'],
        message: 'AUTH_COOKIE_SECURE must be true in production.',
      });
    }

    if (env.AUTH_COOKIE_SAME_SITE === 'none' && !env.AUTH_COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_COOKIE_SECURE'],
        message: 'AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE is none.',
      });
    }

    if (isProductionLike && env.SWAGGER_ENABLED && (!env.SWAGGER_USERNAME || !env.SWAGGER_PASSWORD)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SWAGGER_USERNAME'],
        message: 'Swagger must be disabled or protected with SWAGGER_USERNAME and SWAGGER_PASSWORD.',
      });
    }

    if (env.BACKUP_ENABLED && env.BACKUP_STORAGE_PROVIDER === 's3' && !env.BACKUP_S3_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BACKUP_S3_BUCKET'],
        message: 'BACKUP_S3_BUCKET is required when BACKUP_STORAGE_PROVIDER=s3.',
      });
    }
  });

export type EnvironmentVariables = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid environment configuration: ${message}`);
  }

  return parsed.data;
}
