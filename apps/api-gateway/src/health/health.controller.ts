import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Public()
@Controller('api/v1/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOkResponse({ description: 'Liveness probe.' })
  live() {
    return this.healthService.live();
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Readiness probe with critical dependency checks.' })
  async ready(@Res({ passthrough: true }) response: Response) {
    const result = await this.healthService.ready();

    if (result.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }

  @Get('dependencies')
  @ApiOkResponse({ description: 'Dependency health details.' })
  async dependencies() {
    return this.healthService.dependencies();
  }

  @Get('runtime')
  @ApiOkResponse({ description: 'Sanitized runtime, backup, and production posture checks.' })
  async runtime(@Res({ passthrough: true }) response: Response) {
    const result = await this.healthService.runtime();

    if (result.status === 'degraded') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }
}
