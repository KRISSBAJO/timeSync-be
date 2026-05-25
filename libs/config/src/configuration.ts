function parseCsv(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ['true', '1', 'yes'].includes(value.toLowerCase());
}

export const configuration = () => ({
  app: {
    name: process.env.APP_NAME ?? 'TimeSync HR API',
    env: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4040),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    trustProxy: parseBoolean(process.env.TRUST_PROXY),
    jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? '6mb',
    formBodyLimit: process.env.FORM_BODY_LIMIT ?? '6mb',
    frontendUrl: process.env.FRONTEND_APP_URL ?? 'http://localhost:3000',
    releaseSha: process.env.RELEASE_SHA,
    deploymentTarget: process.env.DEPLOYMENT_TARGET,
    runtimeChecksStrict: parseBoolean(process.env.RUNTIME_CHECKS_STRICT),
  },
  cors: {
    origins: parseCsv(process.env.CORS_ORIGINS),
    credentials: parseBoolean(process.env.CORS_CREDENTIALS, true),
    maxAgeSeconds: Number(process.env.CORS_MAX_AGE_SECONDS ?? 600),
  },
  database: {
    url: process.env.DATABASE_URL,
    transactionMaxWaitMs: Number(process.env.PRISMA_TRANSACTION_MAX_WAIT_MS ?? 15000),
    transactionTimeoutMs: Number(process.env.PRISMA_TRANSACTION_TIMEOUT_MS ?? 60000),
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  backup: {
    enabled: parseBoolean(process.env.BACKUP_ENABLED),
    databaseUrl: process.env.BACKUP_DATABASE_URL,
    storageProvider: process.env.BACKUP_STORAGE_PROVIDER ?? 'local',
    localPath: process.env.BACKUP_LOCAL_PATH ?? './storage/backups',
    retentionDays: Number(process.env.BACKUP_RETENTION_DAYS ?? 30),
    s3Bucket: process.env.BACKUP_S3_BUCKET,
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  swagger: {
    enabled: parseBoolean(process.env.SWAGGER_ENABLED ?? 'true', true),
    path: process.env.SWAGGER_PATH ?? 'docs',
    username: process.env.SWAGGER_USERNAME,
    password: process.env.SWAGGER_PASSWORD,
  },
  security: {
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,
    hstsEnabled: parseBoolean(process.env.SECURITY_HSTS_ENABLED, process.env.NODE_ENV === 'production'),
    hstsMaxAgeSeconds: Number(process.env.SECURITY_HSTS_MAX_AGE_SECONDS ?? 31536000),
  },
  auth: {
    accessTokenTtlMinutes: Number(process.env.AUTH_ACCESS_TOKEN_TTL_MINUTES ?? 15),
    refreshTokenTtlDays: Number(process.env.AUTH_REFRESH_TOKEN_TTL_DAYS ?? 30),
    cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE ?? 'lax',
    cookieSecure:
      parseBoolean(process.env.AUTH_COOKIE_SECURE) ||
      process.env.NODE_ENV === 'production',
    platformAdminEmail: process.env.AUTH_PLATFORM_ADMIN_EMAIL,
    platformAdminPassword: process.env.AUTH_PLATFORM_ADMIN_PASSWORD,
  },
  throttle: {
    ttlMs: Number(process.env.THROTTLE_TTL_MS ?? 60000),
    limit: Number(process.env.THROTTLE_LIMIT ?? 120),
  },
  documents: {
    storage: {
      provider: process.env.DOCUMENT_STORAGE_PROVIDER ?? 'local',
      localPublicBaseUrl: process.env.DOCUMENT_STORAGE_LOCAL_PUBLIC_BASE_URL,
      localRootPath: process.env.DOCUMENT_STORAGE_LOCAL_ROOT_PATH ?? './storage/documents',
      s3Endpoint: process.env.DOCUMENT_STORAGE_S3_ENDPOINT,
      s3Bucket: process.env.DOCUMENT_STORAGE_S3_BUCKET,
      s3Region: process.env.DOCUMENT_STORAGE_S3_REGION,
      s3AccessKeyId: process.env.DOCUMENT_STORAGE_S3_ACCESS_KEY_ID,
      s3SecretAccessKey: process.env.DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY,
      s3PublicBaseUrl: process.env.DOCUMENT_STORAGE_S3_PUBLIC_BASE_URL,
      uploadTokenSecret: process.env.DOCUMENT_UPLOAD_TOKEN_SECRET,
      uploadIntentTtlSeconds: Number(process.env.DOCUMENT_UPLOAD_INTENT_TTL_SECONDS ?? 600),
      maxUploadBytes: Number(process.env.DOCUMENT_STORAGE_MAX_UPLOAD_BYTES ?? 104857600),
    },
  },
  notifications: {
    email: {
      provider: process.env.MAIL_PROVIDER ?? 'smtp',
      from: process.env.NOTIFICATION_EMAIL_FROM ?? process.env.MAIL_USER,
      host: process.env.MAIL_HOST ?? process.env.MAIL_SERVER,
      port: process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : undefined,
      secure: ['true', '1', 'yes'].includes((process.env.MAIL_SECURE ?? '').toLowerCase()),
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
      zeptoMailTokenConfigured: Boolean(process.env.ZEPTOMAIL_TOKEN),
    },
  },
});
