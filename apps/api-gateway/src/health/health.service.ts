import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseHealthService } from '@timesync/database';

type RuntimeCheckStatus = 'pass' | 'warn' | 'fail';

type RuntimeCheck = {
  name: string;
  status: RuntimeCheckStatus;
  message: string;
  detail?: Record<string, unknown>;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly databaseHealth: DatabaseHealthService,
    private readonly config: ConfigService,
  ) {}

  live() {
    return {
      status: 'ok',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const database = await this.databaseHealth.check();
    const isReady = database.status === 'up';

    return {
      status: isReady ? 'ok' : 'degraded',
      service: 'api-gateway',
      dependencies: {
        database,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async dependencies() {
    return {
      database: await this.databaseHealth.check(),
      timestamp: new Date().toISOString(),
    };
  }

  async runtime() {
    const environment = this.config.get<string>('app.env', 'development');
    const productionLike = ['staging', 'production'].includes(environment);
    const strict = this.config.get<boolean>('app.runtimeChecksStrict', false);
    const database = await this.databaseHealth.check();
    const checks: RuntimeCheck[] = [
      {
        name: 'database.connectivity',
        status: database.status === 'up' ? 'pass' : 'fail',
        message: database.status === 'up' ? 'Database is reachable.' : 'Database is not reachable.',
        detail: {
          latencyMs: database.latencyMs,
        },
      },
      this.corsCheck(productionLike),
      this.cookieCheck(productionLike),
      this.swaggerCheck(productionLike),
      this.backupCheck(productionLike, strict),
      await this.documentStorageCheck(),
    ];
    const status = checks.some((check) => check.status === 'fail')
      ? 'degraded'
      : checks.some((check) => check.status === 'warn')
        ? 'warning'
        : 'ok';

    return {
      status,
      service: 'api-gateway',
      environment,
      release: {
        sha: this.config.get<string>('app.releaseSha') ?? null,
        target: this.config.get<string>('app.deploymentTarget') ?? null,
      },
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private corsCheck(productionLike: boolean): RuntimeCheck {
    const origins = this.config.get<string[]>('cors.origins', []);
    const hasWildcard = origins.includes('*');
    const explicitOrigins = origins.filter((origin) => origin !== '*');
    const invalid = productionLike && (hasWildcard || explicitOrigins.length === 0);

    return {
      name: 'security.cors',
      status: invalid ? 'fail' : 'pass',
      message: invalid
        ? 'Production-like environments require explicit, non-wildcard CORS origins.'
        : 'CORS origins are explicit for this environment.',
      detail: {
        originCount: explicitOrigins.length,
        wildcard: hasWildcard,
      },
    };
  }

  private cookieCheck(productionLike: boolean): RuntimeCheck {
    const secure = this.config.get<boolean>('auth.cookieSecure', false);
    const sameSite = this.config.get<string>('auth.cookieSameSite', 'lax');
    const hstsEnabled = this.config.get<boolean>('security.hstsEnabled', false);
    const invalid = productionLike && (!secure || !hstsEnabled);

    return {
      name: 'security.cookies',
      status: invalid ? 'fail' : 'pass',
      message: invalid
        ? 'Production-like environments require secure cookies and HSTS.'
        : 'Cookie and transport settings match the current environment.',
      detail: {
        secure,
        sameSite,
        hstsEnabled,
      },
    };
  }

  private swaggerCheck(productionLike: boolean): RuntimeCheck {
    const enabled = this.config.get<boolean>('swagger.enabled', true);
    const protectedByBasicAuth = Boolean(
      this.config.get<string>('swagger.username') && this.config.get<string>('swagger.password'),
    );
    const invalid = productionLike && enabled && !protectedByBasicAuth;

    return {
      name: 'security.swagger',
      status: invalid ? 'fail' : 'pass',
      message: invalid
        ? 'Swagger must be disabled or protected in production-like environments.'
        : 'Swagger exposure is acceptable for this environment.',
      detail: {
        enabled,
        protectedByBasicAuth,
      },
    };
  }

  private backupCheck(productionLike: boolean, strict: boolean): RuntimeCheck {
    const enabled = this.config.get<boolean>('backup.enabled', false);
    const provider = this.config.get<string>('backup.storageProvider', 'local');
    const retentionDays = this.config.get<number>('backup.retentionDays', 30);
    const missing = productionLike && !enabled;

    return {
      name: 'operations.backup',
      status: missing ? (strict ? 'fail' : 'warn') : 'pass',
      message: missing
        ? 'Backups are not marked enabled for this production-like environment.'
        : 'Backup posture is configured.',
      detail: {
        enabled,
        provider,
        retentionDays,
      },
    };
  }

  private async documentStorageCheck(): Promise<RuntimeCheck> {
    const provider = this.config.get<string>('documents.storage.provider', 'local');

    if (provider !== 'local') {
      return {
        name: 'operations.documentStorage',
        status: 'pass',
        message: 'Document storage uses a managed or external provider.',
        detail: { provider },
      };
    }

    const configuredPath = this.config.get<string>('documents.storage.localRootPath', './storage/documents');
    const rootPath = resolve(configuredPath);

    try {
      const root = await stat(rootPath);
      await access(rootPath, constants.R_OK | constants.W_OK);

      return {
        name: 'operations.documentStorage',
        status: root.isDirectory() ? 'pass' : 'fail',
        message: root.isDirectory()
          ? 'Local document storage path exists and is writable.'
          : 'Local document storage path exists but is not a directory.',
        detail: {
          provider,
          configuredPath,
        },
      };
    } catch (error) {
      return {
        name: 'operations.documentStorage',
        status: 'warn',
        message: 'Local document storage path is not ready yet.',
        detail: {
          provider,
          configuredPath,
          reason: error instanceof Error ? error.message : 'Unknown storage check error',
        },
      };
    }
  }
}
