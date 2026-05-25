import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ACCESS_TOKEN_COOKIE, PUBLIC_ROUTE_KEY } from '../auth.constants';
import { AuthService } from '../auth.service';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractAccessToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication is required.');
    }

    request.auth = await this.authService.validateAccessToken(token);
    return true;
  }

  private extractAccessToken(request: AuthenticatedRequest): string | undefined {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const cookieToken = cookies?.[ACCESS_TOKEN_COOKIE];

    if (cookieToken) {
      return cookieToken;
    }

    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return undefined;
    }

    return authorization.slice('Bearer '.length).trim();
  }
}

