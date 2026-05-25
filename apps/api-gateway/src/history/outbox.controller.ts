import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { ListOutboxMessagesQueryDto } from './dto/list-outbox-messages-query.dto';
import { ProcessOutboxMessagesDto, RetryOutboxMessageDto } from './dto/outbox-actions.dto';
import { HistoryService } from './history.service';

@ApiTags('outbox')
@ApiCookieAuth('access_token')
@Controller('api/v1/outbox/messages')
export class OutboxController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  @RequirePermissions('outbox.read')
  @ApiOperation({ summary: 'List tenant-scoped outbox messages.' })
  @ApiOkResponse({ description: 'Outbox messages returned.' })
  async listOutboxMessages(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListOutboxMessagesQueryDto,
  ) {
    return this.historyService.listOutboxMessages(user, query);
  }

  @Get('summary')
  @RequirePermissions('outbox.read')
  @ApiOperation({ summary: 'Return outbox status counts and overdue pending events.' })
  @ApiOkResponse({ description: 'Outbox summary returned.' })
  async outboxSummary(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.historyService.getOutboxSummary(user, tenantId);
  }

  @Post('process')
  @RequirePermissions('outbox.process')
  @ApiOperation({ summary: 'Process pending outbox messages using retry/backoff rules.' })
  @ApiOkResponse({ description: 'Outbox processing completed.' })
  async processOutboxMessages(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: ProcessOutboxMessagesDto,
  ) {
    return this.historyService.processOutboxMessages(user, dto);
  }

  @Get(':id')
  @RequirePermissions('outbox.read')
  @ApiOperation({ summary: 'Get one outbox message.' })
  @ApiOkResponse({ description: 'Outbox message returned.' })
  async getOutboxMessage(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') messageId: string,
  ) {
    return this.historyService.getOutboxMessage(user, messageId);
  }

  @Post(':id/retry')
  @RequirePermissions('outbox.process')
  @ApiOperation({ summary: 'Retry a failed, cancelled, or pending outbox message.' })
  @ApiOkResponse({ description: 'Outbox message retry scheduled.' })
  async retryOutboxMessage(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') messageId: string,
    @Body() dto: RetryOutboxMessageDto,
  ) {
    return this.historyService.retryOutboxMessage(user, messageId, dto);
  }

  @Post(':id/broadcast')
  @RequirePermissions('outbox.process')
  @ApiOperation({ summary: 'Broadcast an outbox message to tenant stewards as an in-app notification.' })
  @ApiOkResponse({ description: 'Outbox steward broadcast created.' })
  async broadcastOutboxMessage(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') messageId: string,
  ) {
    return this.historyService.broadcastOutboxMessage(user, messageId);
  }
}
