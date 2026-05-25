import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { CSRF_TOKEN_COOKIE, PUBLIC_ROUTE_KEY, SKIP_CSRF_KEY } from '../auth.constants';
import type { AuthenticatedRequest } from '../types/authenticated-request';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCsrf || isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const csrfCookie = cookies?.[CSRF_TOKEN_COOKIE];
    const csrfHeader = request.header('x-csrf-token');

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      throw new ForbiddenException('A valid CSRF token is required.');
    }

    return true;
  }
}

