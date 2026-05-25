import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { HistoryService } from './history.service';

@ApiTags('audit')
@ApiCookieAuth('access_token')
@Controller('api/v1/audit-logs')
export class AuditLogsController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'List tenant-scoped audit logs, or platform logs for platform admins.' })
  @ApiOkResponse({ description: 'Audit logs returned.' })
  async listAuditLogs(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListAuditLogsQueryDto,
  ) {
    return this.historyService.listAuditLogs(user, query);
  }
}
