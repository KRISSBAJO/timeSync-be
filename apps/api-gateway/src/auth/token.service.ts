import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';

import {
  ACCESS_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from './auth.constants';

export interface IssuedToken {
  raw: string;
  hash: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(private readonly config: ConfigService) {}

  issueAccessToken(): IssuedToken {
    return this.issueToken(this.accessTokenTtlMs);
  }

  issueRefreshToken(): IssuedToken {
    return this.issueToken(this.refreshTokenTtlMs);
  }

  issueCsrfToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  accessCookieOptions(expiresAt: Date): CookieOptions {
    return this.secureCookieOptions({
      httpOnly: true,
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }

  refreshCookieOptions(expiresAt: Date): CookieOptions {
    return this.secureCookieOptions({
      httpOnly: true,
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }

  csrfCookieOptions(expiresAt: Date): CookieOptions {
    return this.secureCookieOptions({
      httpOnly: false,
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }

  clearCookieOptions(): CookieOptions {
    return this.secureCookieOptions({
      httpOnly: true,
      maxAge: 0,
    });
  }

  csrfClearCookieOptions(): CookieOptions {
    return this.secureCookieOptions({
      httpOnly: false,
      maxAge: 0,
    });
  }

  get cookieNames() {
    return {
      access: ACCESS_TOKEN_COOKIE,
      refresh: REFRESH_TOKEN_COOKIE,
      csrf: CSRF_TOKEN_COOKIE,
    };
  }

  private issueToken(ttlMs: number): IssuedToken {
    const raw = randomBytes(48).toString('base64url');

    return {
      raw,
      hash: this.hash(raw),
      expiresAt: new Date(Date.now() + ttlMs),
    };
  }

  private secureCookieOptions(options: CookieOptions): CookieOptions {
    const sameSite = this.config.get<'lax' | 'strict' | 'none'>('auth.cookieSameSite', 'lax');
    const domain = this.config.get<string | undefined>('security.cookieDomain');

    return {
      path: '/',
      sameSite,
      secure: this.config.get<boolean>('auth.cookieSecure', false),
      domain,
      ...options,
    };
  }

  private get accessTokenTtlMs(): number {
    return this.config.get<number>('auth.accessTokenTtlMinutes', 15) * 60 * 1000;
  }

  private get refreshTokenTtlMs(): number {
    return this.config.get<number>('auth.refreshTokenTtlDays', 30) * 24 * 60 * 60 * 1000;
  }
}

