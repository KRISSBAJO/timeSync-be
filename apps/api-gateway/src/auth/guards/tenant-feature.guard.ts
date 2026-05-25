import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantFeatureStatus } from '@prisma/client';

import { PrismaService } from '@timesync/database';

import { PUBLIC_ROUTE_KEY, REQUIRED_TENANT_FEATURES_KEY } from '../auth.constants';
import type { AuthenticatedRequest } from '../types/authenticated-request';

const ENABLED_FEATURE_STATUSES = [
  TenantFeatureStatus.ENABLED,
  TenantFeatureStatus.TRIAL,
  TenantFeatureStatus.BETA,
];

@Injectable()
export class TenantFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredFeatures = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_TENANT_FEATURES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = request.auth?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('A tenant subscription is required for this workspace.');
    }

    const enabledFeatures = await this.prisma.tenantFeature.findMany({
      where: {
        tenantId,
        status: { in: ENABLED_FEATURE_STATUSES },
        platformFeature: {
          code: { in: requiredFeatures },
          isActive: true,
        },
      },
      select: {
        platformFeature: {
          select: {
            code: true,
          },
        },
      },
    });
    const enabledCodes = new Set(enabledFeatures.map((feature) => feature.platformFeature.code));
    const missingFeature = requiredFeatures.find((feature) => !enabledCodes.has(feature));

    if (missingFeature) {
      throw new ForbiddenException(`Tenant feature is not enabled: ${missingFeature}`);
    }

    return true;
  }
}
