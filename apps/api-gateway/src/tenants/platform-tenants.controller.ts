import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantStatus } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { UpdateTenantFeatureDto } from './dto/update-tenant-feature.dto';
import { UpdateTenantSubscriptionDto } from './dto/update-tenant-subscription.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@ApiTags('platform tenants')
@ApiCookieAuth('access_token')
@Controller('api/v1/platform/tenants')
export class PlatformTenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @RequirePermissions('platform.tenants.manage')
  @ApiOperation({ summary: 'Provision a new tenant with default roles, features, and admin user.' })
  @ApiOkResponse({ description: 'Tenant provisioned.' })
  async createTenant(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateTenantDto,
  ) {
    return this.tenantsService.createTenant(user, dto);
  }

  @Get()
  @RequirePermissions('platform.tenants.manage')
  @ApiOperation({ summary: 'List tenants for platform administration.' })
  @ApiOkResponse({ description: 'Tenants returned.' })
  async listTenants(@Query() query: ListTenantsQueryDto) {
    return this.tenantsService.listPlatformTenants(query);
  }

  @Get(':id')
  @RequirePermissions('platform.tenants.manage')
  @ApiOperation({ summary: 'Get a tenant for platform administration.' })
  @ApiOkResponse({ description: 'Tenant returned.' })
  async getTenant(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') tenantId: string) {
    return this.tenantsService.getPlatformTenant(user, tenantId);
  }

  @Get(':id/onboarding')
  @RequirePermissions('platform.tenants.manage')
  @ApiOperation({ summary: 'Get tenant onboarding checklist for platform administration.' })
  @ApiOkResponse({ description: 'Tenant onboarding checklist returned.' })
  async getTenantOnboarding(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') tenantId: string,
  ) {
    return this.tenantsService.getPlatformTenantOnboarding(user, tenantId);
  }

  @Patch(':id')
  @RequirePermissions('platform.tenants.manage')
  @ApiOperation({ summary: 'Update a tenant.' })
  @ApiOkResponse({ description: 'Tenant updated.' })
  async updateTenant(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.updateTenant(user, tenantId, dto);
  }

  @Post(':id/activate')
  @RequirePermissions('platform.tenants.manage')
  @ApiOperation({ summary: 'Activate a tenant.' })
  @ApiOkResponse({ description: 'Tenant activated.' })
  async activateTenant(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') tenantId: string) {
    return this.tenantsService.setTenantStatus(user, tenantId, TenantStatus.ACTIVE);
  }

  @Post(':id/suspend')
  @RequirePermissions('platform.tenants.manage')
  @ApiOperation({ summary: 'Suspend a tenant.' })
  @ApiOkResponse({ description: 'Tenant suspended.' })
  async suspendTenant(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') tenantId: string) {
    return this.tenantsService.setTenantStatus(user, tenantId, TenantStatus.SUSPENDED);
  }

  @Post(':id/archive')
  @RequirePermissions('platform.tenants.manage')
  @ApiOperation({ summary: 'Archive a tenant.' })
  @ApiOkResponse({ description: 'Tenant archived.' })
  async archiveTenant(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') tenantId: string) {
    return this.tenantsService.setTenantStatus(user, tenantId, TenantStatus.ARCHIVED);
  }

  @Patch(':id/subscription')
  @RequirePermissions('tenants.subscription.write')
  @ApiOperation({ summary: 'Update a tenant subscription.' })
  @ApiOkResponse({ description: 'Subscription updated.' })
  async updateSubscription(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') tenantId: string,
    @Body() dto: UpdateTenantSubscriptionDto,
  ) {
    return this.tenantsService.updateTenantSubscription(user, tenantId, dto);
  }

  @Get(':id/features')
  @RequirePermissions('platform.features.manage')
  @ApiOperation({ summary: 'List features for a tenant.' })
  @ApiOkResponse({ description: 'Tenant features returned.' })
  async listTenantFeatures(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') tenantId: string,
  ) {
    return this.tenantsService.listPlatformTenantFeatures(user, tenantId);
  }

  @Post(':id/features/:featureCode/enable')
  @RequirePermissions('platform.features.manage')
  @ApiOperation({ summary: 'Enable a feature for a tenant.' })
  @ApiOkResponse({ description: 'Feature enabled.' })
  async enableTenantFeature(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') tenantId: string,
    @Param('featureCode') featureCode: string,
    @Body() dto: UpdateTenantFeatureDto,
  ) {
    return this.tenantsService.enablePlatformTenantFeature(user, tenantId, featureCode, dto);
  }

  @Post(':id/features/:featureCode/disable')
  @RequirePermissions('platform.features.manage')
  @ApiOperation({ summary: 'Disable a feature for a tenant.' })
  @ApiOkResponse({ description: 'Feature disabled.' })
  async disableTenantFeature(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') tenantId: string,
    @Param('featureCode') featureCode: string,
  ) {
    return this.tenantsService.disablePlatformTenantFeature(user, tenantId, featureCode);
  }
}
