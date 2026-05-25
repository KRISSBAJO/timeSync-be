import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { ListActivityLogsQueryDto } from './dto/list-activity-logs-query.dto';
import { HistoryService } from './history.service';

@ApiTags('activity')
@ApiCookieAuth('access_token')
@Controller('api/v1/activity-logs')
export class ActivityLogsController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  @RequirePermissions('activity.read')
  @ApiOperation({ summary: 'List tenant-scoped activity logs.' })
  @ApiOkResponse({ description: 'Activity logs returned.' })
  async listActivityLogs(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListActivityLogsQueryDto,
  ) {
    return this.historyService.listActivityLogs(user, query);
  }
}
