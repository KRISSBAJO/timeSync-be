import { Controller, Get, Query, Sse } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { RealtimeFeedQueryDto } from './dto/realtime-feed-query.dto';
import { RealtimeService } from './realtime.service';

@ApiTags('realtime')
@ApiCookieAuth('access_token')
@Controller('api/v1/realtime')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Get('feed')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Return a compact live tenant operations feed.' })
  @ApiOkResponse({ description: 'Realtime feed returned.' })
  async feed(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: RealtimeFeedQueryDto,
  ) {
    return this.realtimeService.getFeed(user, query);
  }

  @Sse('events')
  @RequirePermissions('dashboard.read')
  @ApiOperation({ summary: 'Stream live tenant operations feed events over server-sent events.' })
  @ApiOkResponse({ description: 'Realtime event stream opened.' })
  events(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: RealtimeFeedQueryDto,
  ) {
    return this.realtimeService.streamFeed(user, query);
  }
}
