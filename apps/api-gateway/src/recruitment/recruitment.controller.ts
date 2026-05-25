import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { RequireTenantFeatures } from '../tenants/decorators/require-tenant-features.decorator';
import {
  CreateApplicationDto,
  CreateCandidateDto,
  CreateOfferDto,
  CreateRecruitmentApprovalRuleDto,
  CreateRequisitionDto,
  DecideRecruitmentDto,
  ListRecruitmentQueryDto,
  MoveApplicationDto,
  ScheduleInterviewDto,
  SubmitInterviewFeedbackDto,
  UpdateCandidateDto,
  UpdateOfferDto,
  UpdateRecruitmentApprovalRuleDto,
  UpdateRequisitionDto,
} from './dto/recruitment.dto';
import { RecruitmentService } from './recruitment.service';

@ApiTags('recruitment')
@ApiCookieAuth('access_token')
@RequireTenantFeatures('RECRUITMENT')
@Controller('api/v1/recruitment')
export class RecruitmentController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get('summary')
  @RequirePermissions('recruitment.read')
  @ApiOperation({ summary: 'Return the role-aware recruitment command summary.' })
  @ApiOkResponse({ description: 'Recruitment summary returned.' })
  async summary(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.recruitmentService.getSummary(user);
  }

  @Get('requisitions')
  @RequirePermissions('recruitment.read')
  @ApiOperation({ summary: 'List recruitment requisitions.' })
  @ApiOkResponse({ description: 'Recruitment requisitions returned.' })
  async listRequisitions(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListRecruitmentQueryDto) {
    return this.recruitmentService.listRequisitions(user, query);
  }

  @Post('requisitions')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Create a requisition with a default hiring pipeline.' })
  @ApiOkResponse({ description: 'Recruitment requisition created.' })
  async createRequisition(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateRequisitionDto) {
    return this.recruitmentService.createRequisition(user, dto);
  }

  @Patch('requisitions/:id')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Update a recruitment requisition.' })
  @ApiOkResponse({ description: 'Recruitment requisition updated.' })
  async updateRequisition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requisitionId: string,
    @Body() dto: UpdateRequisitionDto,
  ) {
    return this.recruitmentService.updateRequisition(user, requisitionId, dto);
  }

  @Post('requisitions/:id/submit')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Submit a requisition into recruitment workflow approval.' })
  @ApiOkResponse({ description: 'Recruitment requisition submitted.' })
  async submitRequisition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requisitionId: string,
    @Body() dto: DecideRecruitmentDto,
  ) {
    return this.recruitmentService.submitRequisition(user, requisitionId, dto);
  }

  @Post('requisitions/:id/approve')
  @RequirePermissions('recruitment.approve')
  @ApiOperation({ summary: 'Approve a recruitment requisition workflow.' })
  @ApiOkResponse({ description: 'Recruitment requisition approved.' })
  async approveRequisition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requisitionId: string,
    @Body() dto: DecideRecruitmentDto,
  ) {
    return this.recruitmentService.approveRequisition(user, requisitionId, dto);
  }

  @Post('requisitions/:id/reject')
  @RequirePermissions('recruitment.approve')
  @ApiOperation({ summary: 'Reject a recruitment requisition workflow.' })
  @ApiOkResponse({ description: 'Recruitment requisition rejected.' })
  async rejectRequisition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requisitionId: string,
    @Body() dto: DecideRecruitmentDto,
  ) {
    return this.recruitmentService.rejectRequisition(user, requisitionId, dto);
  }

  @Post('requisitions/:id/open')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Open an approved requisition for candidates.' })
  @ApiOkResponse({ description: 'Recruitment requisition opened.' })
  async openRequisition(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') requisitionId: string) {
    return this.recruitmentService.openRequisition(user, requisitionId);
  }

  @Post('requisitions/:id/close')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Close a recruitment requisition.' })
  @ApiOkResponse({ description: 'Recruitment requisition closed.' })
  async closeRequisition(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requisitionId: string,
    @Body() dto: DecideRecruitmentDto,
  ) {
    return this.recruitmentService.closeRequisition(user, requisitionId, dto);
  }

  @Get('candidates')
  @RequirePermissions('recruitment.read')
  @ApiOperation({ summary: 'List recruitment candidates.' })
  @ApiOkResponse({ description: 'Recruitment candidates returned.' })
  async listCandidates(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListRecruitmentQueryDto) {
    return this.recruitmentService.listCandidates(user, query);
  }

  @Post('candidates')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Create a recruitment candidate.' })
  @ApiOkResponse({ description: 'Recruitment candidate created.' })
  async createCandidate(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateCandidateDto) {
    return this.recruitmentService.createCandidate(user, dto);
  }

  @Patch('candidates/:id')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Update a recruitment candidate.' })
  @ApiOkResponse({ description: 'Recruitment candidate updated.' })
  async updateCandidate(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') candidateId: string,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.recruitmentService.updateCandidate(user, candidateId, dto);
  }

  @Get('applications')
  @RequirePermissions('recruitment.read')
  @ApiOperation({ summary: 'List candidate applications.' })
  @ApiOkResponse({ description: 'Recruitment applications returned.' })
  async listApplications(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListRecruitmentQueryDto) {
    return this.recruitmentService.listApplications(user, query);
  }

  @Post('applications')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Attach a candidate to an open requisition.' })
  @ApiOkResponse({ description: 'Recruitment application created.' })
  async createApplication(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateApplicationDto) {
    return this.recruitmentService.createApplication(user, dto);
  }

  @Post('applications/:id/move')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Move an application to a pipeline stage.' })
  @ApiOkResponse({ description: 'Recruitment application moved.' })
  async moveApplication(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') applicationId: string,
    @Body() dto: MoveApplicationDto,
  ) {
    return this.recruitmentService.moveApplication(user, applicationId, dto);
  }

  @Get('interviews')
  @RequirePermissions('recruitment.read')
  @ApiOperation({ summary: 'List recruitment interviews.' })
  @ApiOkResponse({ description: 'Recruitment interviews returned.' })
  async listInterviews(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListRecruitmentQueryDto) {
    return this.recruitmentService.listInterviews(user, query);
  }

  @Post('interviews')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Schedule a recruitment interview.' })
  @ApiOkResponse({ description: 'Recruitment interview scheduled.' })
  async scheduleInterview(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: ScheduleInterviewDto) {
    return this.recruitmentService.scheduleInterview(user, dto);
  }

  @Post('interviews/feedback')
  @RequirePermissions('recruitment.interview')
  @ApiOperation({ summary: 'Submit structured recruitment interview feedback.' })
  @ApiOkResponse({ description: 'Recruitment interview feedback submitted.' })
  async submitInterviewFeedback(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: SubmitInterviewFeedbackDto) {
    return this.recruitmentService.submitInterviewFeedback(user, dto);
  }

  @Get('offers')
  @RequirePermissions('recruitment.read')
  @ApiOperation({ summary: 'List recruitment offers.' })
  @ApiOkResponse({ description: 'Recruitment offers returned.' })
  async listOffers(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListRecruitmentQueryDto) {
    return this.recruitmentService.listOffers(user, query);
  }

  @Post('offers')
  @RequirePermissions('recruitment.offer.write')
  @ApiOperation({ summary: 'Create a recruitment offer.' })
  @ApiOkResponse({ description: 'Recruitment offer created.' })
  async createOffer(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateOfferDto) {
    return this.recruitmentService.createOffer(user, dto);
  }

  @Patch('offers/:id')
  @RequirePermissions('recruitment.offer.write')
  @ApiOperation({ summary: 'Update a recruitment offer.' })
  @ApiOkResponse({ description: 'Recruitment offer updated.' })
  async updateOffer(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') offerId: string,
    @Body() dto: UpdateOfferDto,
  ) {
    return this.recruitmentService.updateOffer(user, offerId, dto);
  }

  @Post('offers/:id/submit')
  @RequirePermissions('recruitment.offer.write')
  @ApiOperation({ summary: 'Submit a recruitment offer into workflow approval.' })
  @ApiOkResponse({ description: 'Recruitment offer submitted.' })
  async submitOffer(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') offerId: string,
    @Body() dto: DecideRecruitmentDto,
  ) {
    return this.recruitmentService.submitOffer(user, offerId, dto);
  }

  @Post('offers/:id/approve')
  @RequirePermissions('recruitment.approve')
  @ApiOperation({ summary: 'Approve a recruitment offer.' })
  @ApiOkResponse({ description: 'Recruitment offer approved.' })
  async approveOffer(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') offerId: string,
    @Body() dto: DecideRecruitmentDto,
  ) {
    return this.recruitmentService.approveOffer(user, offerId, dto);
  }

  @Post('offers/:id/reject')
  @RequirePermissions('recruitment.approve')
  @ApiOperation({ summary: 'Reject a recruitment offer.' })
  @ApiOkResponse({ description: 'Recruitment offer rejected.' })
  async rejectOffer(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') offerId: string,
    @Body() dto: DecideRecruitmentDto,
  ) {
    return this.recruitmentService.rejectOffer(user, offerId, dto);
  }

  @Get('approval-rules')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'List recruitment workflow adoption rules.' })
  @ApiOkResponse({ description: 'Recruitment approval rules returned.' })
  async listApprovalRules(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.recruitmentService.listApprovalRules(user);
  }

  @Post('approval-rules')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Create a recruitment workflow adoption rule.' })
  @ApiOkResponse({ description: 'Recruitment approval rule created.' })
  async createApprovalRule(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateRecruitmentApprovalRuleDto) {
    return this.recruitmentService.createApprovalRule(user, dto);
  }

  @Patch('approval-rules/:id')
  @RequirePermissions('recruitment.write')
  @ApiOperation({ summary: 'Update a recruitment workflow adoption rule.' })
  @ApiOkResponse({ description: 'Recruitment approval rule updated.' })
  async updateApprovalRule(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') ruleId: string,
    @Body() dto: UpdateRecruitmentApprovalRuleDto,
  ) {
    return this.recruitmentService.updateApprovalRule(user, ruleId, dto);
  }

  @Get('reports')
  @RequirePermissions('recruitment.reports.read')
  @ApiOperation({ summary: 'Return recruitment funnel and source reports.' })
  @ApiOkResponse({ description: 'Recruitment reports returned.' })
  async reports(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListRecruitmentQueryDto) {
    return this.recruitmentService.getReports(user, query);
  }
}
