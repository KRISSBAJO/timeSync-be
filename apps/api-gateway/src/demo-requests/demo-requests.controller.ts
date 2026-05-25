import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { DemoRequestsService } from './demo-requests.service';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { ListDemoRequestsQueryDto } from './dto/list-demo-requests-query.dto';
import { UpdateDemoRequestStatusDto } from './dto/update-demo-request-status.dto';

@ApiTags('demo requests')
@Controller('api/v1')
export class DemoRequestsController {
  constructor(private readonly demoRequestsService: DemoRequestsService) {}

  @Public()
  @Post('demo-requests')
  @ApiOperation({ summary: 'Capture a public TimeSync demo request.' })
  @ApiCreatedResponse({ description: 'Demo request captured.' })
  async createDemoRequest(@Body() dto: CreateDemoRequestDto, @Req() request: Request) {
    return this.demoRequestsService.createDemoRequest(dto, request);
  }

  @Get('platform/demo-requests')
  @ApiCookieAuth('access_token')
  @RequirePermissions('platform.tenants.manage')
  @ApiOperation({ summary: 'List public demo requests for platform administration.' })
  @ApiOkResponse({ description: 'Demo requests returned.' })
  async listDemoRequests(@Query() query: ListDemoRequestsQueryDto) {
    return this.demoRequestsService.listDemoRequests(query);
  }

  @Get('platform/demo-requests/:id')
  @ApiCookieAuth('access_token')
  @RequirePermissions('platform.tenants.manage')
  @ApiOperation({ summary: 'Get a public demo request for platform administration.' })
  @ApiOkResponse({ description: 'Demo request returned.' })
  async getDemoRequest(@Param('id') id: string) {
    return this.demoRequestsService.getDemoRequest(id);
  }

  @Patch('platform/demo-requests/:id/status')
  @ApiCookieAuth('access_token')
  @RequirePermissions('platform.tenants.manage')
  @ApiOperation({ summary: 'Update demo request status.' })
  @ApiOkResponse({ description: 'Demo request status updated.' })
  async updateDemoRequestStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDemoRequestStatusDto,
  ) {
    return this.demoRequestsService.updateDemoRequestStatus(id, dto.status);
  }
}
