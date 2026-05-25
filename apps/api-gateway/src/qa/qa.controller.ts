import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { StartQaRunDto } from './dto/qa.dto';
import { QaService } from './qa.service';

@ApiTags('qa')
@ApiCookieAuth('access_token')
@Controller('api/v1/qa')
export class QaController {
  constructor(private readonly qaService: QaService) {}

  @Get('scripts')
  @RequirePermissions('qa.read')
  @ApiOperation({ summary: 'List whitelisted QA scripts that can be launched from the UI.' })
  @ApiOkResponse({ description: 'QA script catalog returned.' })
  scripts() {
    return this.qaService.listScripts();
  }

  @Get('runs')
  @RequirePermissions('qa.read')
  @ApiOperation({ summary: 'List recent QA script runs.' })
  @ApiOkResponse({ description: 'QA runs returned.' })
  runs(@Query('limit') limit?: string) {
    return this.qaService.listRuns(Number(limit) || 25);
  }

  @Get('runs/:id')
  @RequirePermissions('qa.read')
  @ApiOperation({ summary: 'Return a QA script run with captured output.' })
  @ApiOkResponse({ description: 'QA run returned.' })
  run(@Param('id') runId: string) {
    return this.qaService.getRun(runId);
  }

  @Post('runs')
  @RequirePermissions('qa.run')
  @ApiOperation({ summary: 'Start a whitelisted QA script run.' })
  @ApiOkResponse({ description: 'QA run started.' })
  startRun(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: StartQaRunDto) {
    return this.qaService.startRun(user, dto);
  }

  @Post('runs/:id/cancel')
  @RequirePermissions('qa.run')
  @ApiOperation({ summary: 'Cancel a running QA script.' })
  @ApiOkResponse({ description: 'QA run cancellation requested.' })
  cancelRun(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') runId: string) {
    return this.qaService.cancelRun(runId, user);
  }
}
