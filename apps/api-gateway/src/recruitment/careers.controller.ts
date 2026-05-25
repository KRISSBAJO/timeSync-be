import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { PublicCareerQueryDto, PublicJobApplicationDto } from './dto/recruitment.dto';
import { RecruitmentService } from './recruitment.service';

@ApiTags('careers')
@Public()
@Controller('api/v1/careers')
export class CareersController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get(':tenantSlug')
  @ApiOperation({ summary: 'Return a tenant public careers board.' })
  @ApiOkResponse({ description: 'Public careers board returned.' })
  async getCareersBoard(@Param('tenantSlug') tenantSlug: string, @Query() query: PublicCareerQueryDto) {
    return this.recruitmentService.getPublicCareersBoard(tenantSlug, query);
  }

  @Get(':tenantSlug/jobs')
  @ApiOperation({ summary: 'List tenant public job postings.' })
  @ApiOkResponse({ description: 'Public job postings returned.' })
  async listPublicJobs(@Param('tenantSlug') tenantSlug: string, @Query() query: PublicCareerQueryDto) {
    return this.recruitmentService.getPublicCareersBoard(tenantSlug, query);
  }

  @Get(':tenantSlug/jobs/:jobSlug')
  @ApiOperation({ summary: 'Return a public job posting detail page.' })
  @ApiOkResponse({ description: 'Public job detail returned.' })
  async getPublicJob(@Param('tenantSlug') tenantSlug: string, @Param('jobSlug') jobSlug: string) {
    return this.recruitmentService.getPublicJob(tenantSlug, jobSlug);
  }

  @Post(':tenantSlug/jobs/:jobSlug/apply')
  @ApiOperation({ summary: 'Submit a public job application into recruitment.' })
  @ApiOkResponse({ description: 'Public job application received.' })
  async applyToPublicJob(
    @Param('tenantSlug') tenantSlug: string,
    @Param('jobSlug') jobSlug: string,
    @Body() dto: PublicJobApplicationDto,
  ) {
    return this.recruitmentService.applyToPublicJob(tenantSlug, jobSlug, dto);
  }
}
