import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { UpdateTenantBrandingDto } from './dto/update-tenant-branding.dto';
import { UpdateTenantFeatureDto } from './dto/update-tenant-feature.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { TenantsService } from './tenants.service';

@ApiTags('current tenant')
@ApiCookieAuth('access_token')
@Controller('api/v1/tenants/current')
export class CurrentTenantController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @RequirePermissions('tenants.settings.read')
  @ApiOperation({ summary: 'Return the current tenant context and configuration.' })
  @ApiOkResponse({ description: 'Current tenant returned.' })
  async currentTenant(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.tenantsService.getCurrentTenant(user);
  }

  @Get('onboarding')
  @RequirePermissions('tenants.settings.read')
  @ApiOperation({ summary: 'Return current tenant onboarding checklist and next actions.' })
  @ApiOkResponse({ description: 'Tenant onboarding checklist returned.' })
  async onboarding(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.tenantsService.getCurrentTenantOnboarding(user);
  }

  @Patch('settings')
  @RequirePermissions('tenants.settings.write')
  @ApiOperation({ summary: 'Update current tenant settings.' })
  @ApiOkResponse({ description: 'Tenant settings updated.' })
  async updateSettings(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    return this.tenantsService.updateCurrentSettings(user, dto);
  }

  @Patch('branding')
  @RequirePermissions('tenants.branding.write')
  @ApiOperation({ summary: 'Update current tenant branding.' })
  @ApiOkResponse({ description: 'Tenant branding updated.' })
  async updateBranding(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: UpdateTenantBrandingDto,
  ) {
    return this.tenantsService.updateCurrentBranding(user, dto);
  }

  @Get('subscription')
  @RequirePermissions('tenants.subscription.read')
  @ApiOperation({ summary: 'Return current tenant subscription.' })
  @ApiOkResponse({ description: 'Subscription returned.' })
  async subscription(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.tenantsService.getCurrentSubscription(user);
  }

  @Get('features')
  @RequirePermissions('tenants.features.read')
  @ApiOperation({ summary: 'Return current tenant enabled/available features.' })
  @ApiOkResponse({ description: 'Tenant features returned.' })
  async features(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.tenantsService.listCurrentFeatures(user);
  }

  @Post('features/:featureCode/enable')
  @RequirePermissions('tenants.features.write')
  @ApiOperation({ summary: 'Enable a feature for the current tenant.' })
  @ApiOkResponse({ description: 'Feature enabled.' })
  async enableFeature(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('featureCode') featureCode: string,
    @Body() dto: UpdateTenantFeatureDto,
  ) {
    return this.tenantsService.enableCurrentFeature(user, featureCode, dto);
  }

  @Post('features/:featureCode/disable')
  @RequirePermissions('tenants.features.write')
  @ApiOperation({ summary: 'Disable a feature for the current tenant.' })
  @ApiOkResponse({ description: 'Feature disabled.' })
  async disableFeature(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('featureCode') featureCode: string,
  ) {
    return this.tenantsService.disableCurrentFeature(user, featureCode);
  }
}
