import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { PublicHiringMarketplaceQueryDto, PublicTalentProfileDto } from './dto/recruitment.dto';
import { RecruitmentService } from './recruitment.service';

@ApiTags('hiring marketplace')
@Public()
@Controller('api/v1/hiring')
export class HiringMarketplaceController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get()
  @ApiOperation({ summary: 'Return the public hiring marketplace with jobs across tenant career boards.' })
  @ApiOkResponse({ description: 'Public hiring marketplace returned.' })
  async marketplace(@Query() query: PublicHiringMarketplaceQueryDto) {
    return this.recruitmentService.getPublicHiringMarketplace(query);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'List public jobs across tenants.' })
  @ApiOkResponse({ description: 'Public marketplace jobs returned.' })
  async jobs(@Query() query: PublicHiringMarketplaceQueryDto) {
    return this.recruitmentService.getPublicHiringMarketplace(query);
  }

  @Post('talent-profiles')
  @ApiOperation({ summary: 'Create or update a public applicant talent profile.' })
  @ApiOkResponse({ description: 'Public talent profile received.' })
  async talentProfile(@Body() dto: PublicTalentProfileDto) {
    return this.recruitmentService.submitPublicTalentProfile(dto);
  }
}
