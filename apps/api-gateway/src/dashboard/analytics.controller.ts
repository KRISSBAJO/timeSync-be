import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { DashboardService } from './dashboard.service';
import {
  ListAnalyticsSnapshotsQueryDto,
  RefreshAnalyticsSnapshotDto,
} from './dto/analytics-snapshot.dto';

@ApiTags('analytics')
@ApiCookieAuth('access_token')
@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('snapshots')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'List historical analytics snapshots for a tenant.' })
  @ApiOkResponse({ description: 'Analytics snapshots returned.' })
  async snapshots(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListAnalyticsSnapshotsQueryDto,
  ) {
    return this.dashboardService.listAnalyticsSnapshots(user, query);
  }

  @Get('snapshots/latest')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Return the latest analytics snapshot per analytics key.' })
  @ApiOkResponse({ description: 'Latest analytics snapshots returned.' })
  async latestSnapshots(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListAnalyticsSnapshotsQueryDto,
  ) {
    return this.dashboardService.latestAnalyticsSnapshots(user, query);
  }

  @Post('snapshots/refresh')
  @RequirePermissions('analytics.write')
  @ApiOperation({ summary: 'Compute and persist a fresh tenant analytics snapshot.' })
  @ApiOkResponse({ description: 'Analytics snapshot refreshed.' })
  async refreshSnapshot(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: RefreshAnalyticsSnapshotDto,
  ) {
    return this.dashboardService.refreshAnalyticsSnapshot(user, dto);
  }
}
