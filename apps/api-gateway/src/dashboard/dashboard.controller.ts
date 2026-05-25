import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { DashboardService } from './dashboard.service';
import { DataQualityActionDto } from './dto/data-quality-action.dto';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import {
  ListDashboardWidgetsQueryDto,
  UpdateDashboardWidgetDto,
  UpsertDashboardWidgetDto,
} from './dto/dashboard-widget.dto';

@ApiTags('dashboard')
@ApiCookieAuth('access_token')
@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Return executive workforce, operations, compliance, and risk dashboard metrics.' })
  @ApiOkResponse({ description: 'Executive dashboard returned.' })
  async overview(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getExecutiveOverview(user, query);
  }

  @Get('workforce')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Return workforce intelligence, distribution, and trend metrics.' })
  @ApiOkResponse({ description: 'Workforce dashboard returned.' })
  async workforce(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getWorkforceDashboard(user, query);
  }

  @Get('positions')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Return position control, capacity, vacancy, and org distribution metrics.' })
  @ApiOkResponse({ description: 'Position control dashboard returned.' })
  async positions(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getPositionControlDashboard(user, query);
  }

  @Get('operations')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Return operational queues across approvals, documents, notifications, and outbox.' })
  @ApiOkResponse({ description: 'Operations dashboard returned.' })
  async operations(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getOperationsDashboard(user, query);
  }

  @Get('risks')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Return workforce and platform risk indicators with health scoring.' })
  @ApiOkResponse({ description: 'Risk dashboard returned.' })
  async risks(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getRiskDashboard(user, query);
  }

  @Get('data-quality')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Return admin-grade data quality, compliance, and remediation signals.' })
  @ApiOkResponse({ description: 'Data quality command center returned.' })
  async dataQuality(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getDataQualityDashboard(user, query);
  }

  @Post('data-quality/actions')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Record or broadcast a remediation action for a data quality issue.' })
  @ApiOkResponse({ description: 'Data quality remediation action handled.' })
  async dataQualityAction(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: DataQualityActionDto,
  ) {
    return this.dashboardService.handleDataQualityAction(user, dto);
  }

  @Get('widgets')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'List global and tenant dashboard widgets.' })
  @ApiOkResponse({ description: 'Dashboard widgets returned.' })
  async widgets(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListDashboardWidgetsQueryDto,
  ) {
    return this.dashboardService.listWidgets(user, query);
  }

  @Post('widgets')
  @RequirePermissions('dashboard.write')
  @ApiOperation({ summary: 'Create or update a global or tenant dashboard widget.' })
  @ApiOkResponse({ description: 'Dashboard widget upserted.' })
  async upsertWidget(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: UpsertDashboardWidgetDto,
  ) {
    return this.dashboardService.upsertWidget(user, dto);
  }

  @Patch('widgets/:id')
  @RequirePermissions('dashboard.write')
  @ApiOperation({ summary: 'Update a dashboard widget.' })
  @ApiOkResponse({ description: 'Dashboard widget updated.' })
  async updateWidget(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') widgetId: string,
    @Body() dto: UpdateDashboardWidgetDto,
  ) {
    return this.dashboardService.updateWidget(user, widgetId, dto);
  }
}
