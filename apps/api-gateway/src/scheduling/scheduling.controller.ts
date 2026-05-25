import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { RequireTenantFeatures } from '../tenants/decorators/require-tenant-features.decorator';
import {
  AssignOpenShiftDto,
  BulkCreateScheduleAssignmentsDto,
  CreateAvailabilityDto,
  CreateCoverageRuleDto,
  CreateOpenShiftDto,
  CreateOvertimeRequestDto,
  CreateScheduleAssignmentDto,
  CreateSchedulePeriodDto,
  CreateSchedulePolicyDto,
  CreateScheduleSwapRequestDto,
  CreateWorkShiftDto,
  DecideScheduleSwapRequestDto,
  DecideOpenShiftClaimDto,
  DecideOvertimeRequestDto,
  ListAvailabilityQueryDto,
  ListCoverageRulesQueryDto,
  ListOpenShiftEligibleEmployeesQueryDto,
  ListOpenShiftClaimsQueryDto,
  ListOpenShiftsQueryDto,
  ListScheduleAssignmentsQueryDto,
  ListSchedulableEmployeesQueryDto,
  ListScheduleSwapRequestsQueryDto,
  ListSchedulingQueryDto,
  LockSchedulePeriodDto,
  PlannerSummaryQueryDto,
  UnassignScheduleAssignmentDto,
  UpdateCoverageRuleDto,
  UpdateOpenShiftDto,
  UpdateScheduleAssignmentDto,
  UpdateScheduleAssignmentStatusDto,
  UpdateSchedulePolicyDto,
  UpdateWorkShiftDto,
} from './dto/scheduling.dto';
import { SchedulingService } from './scheduling.service';

@ApiTags('scheduling')
@ApiCookieAuth('access_token')
@RequireTenantFeatures('SCHEDULING')
@Controller('api/v1/scheduling')
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get('summary')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Return the role-aware scheduling command summary.' })
  @ApiOkResponse({ description: 'Scheduling summary returned.' })
  async summary(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.schedulingService.getSummary(user);
  }

  @Get('my')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Return current employee schedule, open shifts, overtime, and availability.' })
  @ApiOkResponse({ description: 'Current employee schedule workspace returned.' })
  async mySchedule(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListSchedulingQueryDto) {
    return this.schedulingService.getMySchedule(user, query);
  }

  @Get('planner')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Return day-level scheduling counts for calendar planning.' })
  @ApiOkResponse({ description: 'Planner calendar summary returned.' })
  async planner(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: PlannerSummaryQueryDto) {
    return this.schedulingService.getPlannerSummary(user, query);
  }

  @Post('my/assignments')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Create a self-service schedule assignment when policy allows it.' })
  @ApiOkResponse({ description: 'Self-service assignment created.' })
  async createMyAssignment(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: Omit<CreateScheduleAssignmentDto, 'employeeId'>,
  ) {
    return this.schedulingService.createSelfAssignment(user, dto);
  }

  @Post('my/assignments/:id/confirm')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Confirm the current employee schedule assignment.' })
  @ApiOkResponse({ description: 'Assignment confirmed.' })
  async confirmMyAssignment(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') assignmentId: string) {
    return this.schedulingService.confirmMyAssignment(user, assignmentId);
  }

  @Post('my/open-shifts/:id/claim')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Request or claim an open shift as the current employee.' })
  @ApiOkResponse({ description: 'Open shift claim created.' })
  async claimOpenShift(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') openShiftId: string) {
    return this.schedulingService.claimOpenShift(user, openShiftId);
  }

  @Post('my/overtime')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Submit a current employee overtime request.' })
  @ApiOkResponse({ description: 'Overtime request submitted.' })
  async requestMyOvertime(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateOvertimeRequestDto,
  ) {
    return this.schedulingService.requestOvertime(user, dto);
  }

  @Post('my/availability')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Create current employee availability or unavailability.' })
  @ApiOkResponse({ description: 'Availability created.' })
  async createMyAvailability(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateAvailabilityDto) {
    return this.schedulingService.createAvailability(user, dto);
  }

  @Post('manager/assignments')
  @RequirePermissions('scheduling.team.write')
  @ApiOperation({ summary: 'Create a schedule assignment for an employee in the manager reporting group.' })
  @ApiOkResponse({ description: 'Team assignment created.' })
  async createTeamAssignment(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateScheduleAssignmentDto,
  ) {
    return this.schedulingService.createTeamAssignment(user, dto);
  }

  @Post('manager/assignments/bulk')
  @RequirePermissions('scheduling.team.write')
  @ApiOperation({ summary: 'Bulk create schedule assignments for employees in the manager reporting group.' })
  @ApiOkResponse({ description: 'Team bulk assignment completed.' })
  async createTeamBulkAssignments(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: BulkCreateScheduleAssignmentsDto,
  ) {
    return this.schedulingService.createTeamBulkAssignments(user, dto);
  }

  @Get('manager/employees')
  @RequirePermissions('scheduling.team.write')
  @ApiOperation({ summary: 'List employees in the manager reporting group for schedule assignment.' })
  @ApiOkResponse({ description: 'Team employees returned.' })
  async listTeamEmployees(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListSchedulableEmployeesQueryDto,
  ) {
    return this.schedulingService.listTeamEmployees(user, query);
  }

  @Get('manager/assignments')
  @RequirePermissions('scheduling.team.write')
  @ApiOperation({ summary: 'List schedule assignments for the manager reporting group.' })
  @ApiOkResponse({ description: 'Team schedule assignments returned.' })
  async listTeamAssignments(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListScheduleAssignmentsQueryDto,
  ) {
    return this.schedulingService.listTeamAssignments(user, query);
  }

  @Get('policies')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'List tenant scheduling and overtime policies.' })
  @ApiOkResponse({ description: 'Schedule policies returned.' })
  async listPolicies(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.schedulingService.listPolicies(user);
  }

  @Get('employees')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'List employees available for schedule assignment.' })
  @ApiOkResponse({ description: 'Schedulable employees returned.' })
  async listSchedulableEmployees(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListSchedulableEmployeesQueryDto,
  ) {
    return this.schedulingService.listSchedulableEmployees(user, query);
  }

  @Post('policies')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Create a scheduling and overtime policy.' })
  @ApiOkResponse({ description: 'Schedule policy created.' })
  async createPolicy(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateSchedulePolicyDto) {
    return this.schedulingService.createPolicy(user, dto);
  }

  @Patch('policies/:id')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Update a scheduling and overtime policy.' })
  @ApiOkResponse({ description: 'Schedule policy updated.' })
  async updatePolicy(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') policyId: string,
    @Body() dto: UpdateSchedulePolicyDto,
  ) {
    return this.schedulingService.updatePolicy(user, policyId, dto);
  }

  @Post('policies/:id/activate')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Activate one scheduling policy and archive the previous active policy.' })
  @ApiOkResponse({ description: 'Schedule policy activated.' })
  async activatePolicy(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') policyId: string) {
    return this.schedulingService.activatePolicy(user, policyId);
  }

  @Post('policies/:id/archive')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Archive a scheduling policy.' })
  @ApiOkResponse({ description: 'Schedule policy archived.' })
  async archivePolicy(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') policyId: string) {
    return this.schedulingService.archivePolicy(user, policyId);
  }

  @Get('shifts')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'List shift definitions available to the current scheduling scope.' })
  @ApiOkResponse({ description: 'Work shifts returned.' })
  async listShifts(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.schedulingService.listShifts(user);
  }

  @Post('shifts')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Create a work shift definition.' })
  @ApiOkResponse({ description: 'Work shift created.' })
  async createShift(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateWorkShiftDto) {
    return this.schedulingService.createShift(user, dto);
  }

  @Patch('shifts/:id')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Update a work shift definition.' })
  @ApiOkResponse({ description: 'Work shift updated.' })
  async updateShift(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') shiftId: string,
    @Body() dto: UpdateWorkShiftDto,
  ) {
    return this.schedulingService.updateShift(user, shiftId, dto);
  }

  @Get('coverage-rules')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'List staffing demand rules for schedule planning.' })
  @ApiOkResponse({ description: 'Coverage demand rules returned.' })
  async listCoverageRules(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListCoverageRulesQueryDto,
  ) {
    return this.schedulingService.listCoverageRules(user, query);
  }

  @Post('coverage-rules')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Create a staffing demand rule for schedule planning.' })
  @ApiOkResponse({ description: 'Coverage demand rule created.' })
  async createCoverageRule(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateCoverageRuleDto,
  ) {
    return this.schedulingService.createCoverageRule(user, dto);
  }

  @Patch('coverage-rules/:id')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Update a staffing demand rule.' })
  @ApiOkResponse({ description: 'Coverage demand rule updated.' })
  async updateCoverageRule(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') ruleId: string,
    @Body() dto: UpdateCoverageRuleDto,
  ) {
    return this.schedulingService.updateCoverageRule(user, ruleId, dto);
  }

  @Get('periods')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'List schedule periods.' })
  @ApiOkResponse({ description: 'Schedule periods returned.' })
  async listPeriods(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListSchedulingQueryDto) {
    return this.schedulingService.listPeriods(user, query);
  }

  @Post('periods')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Create a draft schedule period.' })
  @ApiOkResponse({ description: 'Schedule period created.' })
  async createPeriod(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateSchedulePeriodDto) {
    return this.schedulingService.createPeriod(user, dto);
  }

  @Post('periods/:id/publish')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Publish a schedule period.' })
  @ApiOkResponse({ description: 'Schedule period published.' })
  async publishPeriod(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') periodId: string) {
    return this.schedulingService.publishPeriod(user, periodId);
  }

  @Post('periods/:id/lock')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Lock a schedule period after publish and operational review.' })
  @ApiOkResponse({ description: 'Schedule period locked.' })
  async lockPeriod(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') periodId: string,
    @Body() dto: LockSchedulePeriodDto,
  ) {
    return this.schedulingService.lockPeriod(user, periodId, dto);
  }

  @Get('assignments')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'List tenant schedule assignments.' })
  @ApiOkResponse({ description: 'Schedule assignments returned.' })
  async listAssignments(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListScheduleAssignmentsQueryDto,
  ) {
    return this.schedulingService.listAssignments(user, query);
  }

  @Get('assignments/:id')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Return one schedule assignment visible to the current scheduling scope.' })
  @ApiOkResponse({ description: 'Schedule assignment returned.' })
  async getAssignment(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') assignmentId: string) {
    return this.schedulingService.getAssignment(user, assignmentId);
  }

  @Post('assignments')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Create a tenant schedule assignment.' })
  @ApiOkResponse({ description: 'Schedule assignment created.' })
  async createAssignment(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateScheduleAssignmentDto,
  ) {
    return this.schedulingService.createAssignment(user, dto);
  }

  @Post('assignments/bulk')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Bulk create tenant schedule assignments with collision safeguards.' })
  @ApiOkResponse({ description: 'Bulk assignment completed.' })
  async createBulkAssignments(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: BulkCreateScheduleAssignmentsDto,
  ) {
    return this.schedulingService.createBulkAssignments(user, dto);
  }

  @Patch('assignments/:id')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Update an individual schedule assignment inside the current scheduling scope.' })
  @ApiOkResponse({ description: 'Schedule assignment updated.' })
  async updateAssignment(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') assignmentId: string,
    @Body() dto: UpdateScheduleAssignmentDto,
  ) {
    return this.schedulingService.updateAssignment(user, assignmentId, dto);
  }

  @Patch('assignments/:id/status')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Update schedule assignment status.' })
  @ApiOkResponse({ description: 'Schedule assignment status updated.' })
  async updateAssignmentStatus(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') assignmentId: string,
    @Body() dto: UpdateScheduleAssignmentStatusDto,
  ) {
    return this.schedulingService.updateAssignmentStatus(user, assignmentId, dto);
  }

  @Post('assignments/:id/unassign')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Unassign a worker from a shift and optionally return the work to open shifts.' })
  @ApiOkResponse({ description: 'Schedule assignment unassigned.' })
  async unassignAssignment(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') assignmentId: string,
    @Body() dto: UnassignScheduleAssignmentDto,
  ) {
    return this.schedulingService.unassignAssignment(user, assignmentId, dto);
  }

  @Get('open-shifts')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'List open shifts.' })
  @ApiOkResponse({ description: 'Open shifts returned.' })
  async listOpenShifts(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListOpenShiftsQueryDto) {
    return this.schedulingService.listOpenShifts(user, query);
  }

  @Post('open-shifts')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Publish an open shift for employee pickup.' })
  @ApiOkResponse({ description: 'Open shift created.' })
  async createOpenShift(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateOpenShiftDto) {
    return this.schedulingService.createOpenShift(user, dto);
  }

  @Get('open-shifts/:id/eligible-employees')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'List employees eligible for assignment to a targeted open shift.' })
  @ApiOkResponse({ description: 'Eligible employees returned.' })
  async listEligibleEmployeesForOpenShift(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') openShiftId: string,
    @Query() query: ListOpenShiftEligibleEmployeesQueryDto,
  ) {
    return this.schedulingService.listEligibleEmployeesForOpenShift(user, openShiftId, query);
  }

  @Get('open-shifts/:id')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Return one open shift visible to the current scheduling scope.' })
  @ApiOkResponse({ description: 'Open shift returned.' })
  async getOpenShift(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') openShiftId: string) {
    return this.schedulingService.getOpenShift(user, openShiftId);
  }

  @Patch('open-shifts/:id')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Update an open shift inside the current scheduling scope.' })
  @ApiOkResponse({ description: 'Open shift updated.' })
  async updateOpenShift(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') openShiftId: string,
    @Body() dto: UpdateOpenShiftDto,
  ) {
    return this.schedulingService.updateOpenShift(user, openShiftId, dto);
  }

  @Post('open-shifts/:id/assign')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Directly assign an open shift to an employee in the current scheduling scope.' })
  @ApiOkResponse({ description: 'Open shift assigned.' })
  async assignOpenShift(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') openShiftId: string,
    @Body() dto: AssignOpenShiftDto,
  ) {
    return this.schedulingService.assignOpenShift(user, openShiftId, dto);
  }

  @Get('open-shift-claims')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'List open-shift pickup requests visible to the current scheduling scope.' })
  @ApiOkResponse({ description: 'Open-shift claims returned.' })
  async listOpenShiftClaims(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListOpenShiftClaimsQueryDto) {
    return this.schedulingService.listOpenShiftClaims(user, query);
  }

  @Post('open-shift-claims/:id/decision')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Approve, reject, or cancel an open-shift claim.' })
  @ApiOkResponse({ description: 'Open shift claim decision recorded.' })
  async decideOpenShiftClaim(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') claimId: string,
    @Body() dto: DecideOpenShiftClaimDto,
  ) {
    return this.schedulingService.decideOpenShiftClaim(user, claimId, dto);
  }

  @Get('overtime')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'List overtime requests visible to the current scheduling scope.' })
  @ApiOkResponse({ description: 'Overtime requests returned.' })
  async listOvertime(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListSchedulingQueryDto) {
    return this.schedulingService.listOvertime(user, query);
  }

  @Post('overtime')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Create an overtime request for an employee.' })
  @ApiOkResponse({ description: 'Overtime request created.' })
  async createOvertime(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateOvertimeRequestDto) {
    return this.schedulingService.requestOvertime(user, dto);
  }

  @Post('overtime/:id/decision')
  @RequirePermissions('scheduling.overtime.approve')
  @ApiOperation({ summary: 'Approve, reject, cancel, or complete an overtime request.' })
  @ApiOkResponse({ description: 'Overtime request decision recorded.' })
  async decideOvertime(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: DecideOvertimeRequestDto,
  ) {
    return this.schedulingService.decideOvertime(user, requestId, dto);
  }

  @Get('swap-requests')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'List shift swap and coverage-change requests visible to the current scope.' })
  @ApiOkResponse({ description: 'Schedule swap requests returned.' })
  async listSwapRequests(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListScheduleSwapRequestsQueryDto,
  ) {
    return this.schedulingService.listSwapRequests(user, query);
  }

  @Post('my/swap-requests')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Request a shift swap or coverage change for the current employee.' })
  @ApiOkResponse({ description: 'Schedule swap request created.' })
  async createMySwapRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateScheduleSwapRequestDto,
  ) {
    return this.schedulingService.createSwapRequest(user, dto);
  }

  @Post('swap-requests/:id/decision')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'Approve, reject, cancel, or complete a shift swap request.' })
  @ApiOkResponse({ description: 'Schedule swap request decision recorded.' })
  async decideSwapRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: DecideScheduleSwapRequestDto,
  ) {
    return this.schedulingService.decideSwapRequest(user, requestId, dto);
  }

  @Get('availability')
  @RequirePermissions('scheduling.self')
  @ApiOperation({ summary: 'List employee availability records visible to the current scheduling scope.' })
  @ApiOkResponse({ description: 'Availability returned.' })
  async listAvailability(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListAvailabilityQueryDto) {
    return this.schedulingService.listAvailability(user, query);
  }

  @Post('availability')
  @RequirePermissions('scheduling.write')
  @ApiOperation({ summary: 'Create employee availability on behalf of an employee.' })
  @ApiOkResponse({ description: 'Availability created.' })
  async createAvailability(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateAvailabilityDto) {
    return this.schedulingService.createAvailability(user, dto);
  }
}
