import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { ListTimelineEventsQueryDto } from './dto/list-timeline-events-query.dto';
import { HistoryService } from './history.service';

@ApiTags('timeline')
@ApiCookieAuth('access_token')
@Controller('api/v1/timeline-events')
export class TimelineEventsController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  @RequirePermissions('timeline.read')
  @ApiOperation({ summary: 'List tenant-scoped workforce timeline events.' })
  @ApiOkResponse({ description: 'Timeline events returned.' })
  async listTimelineEvents(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListTimelineEventsQueryDto,
  ) {
    return this.historyService.listTimelineEvents(user, query);
  }
}
