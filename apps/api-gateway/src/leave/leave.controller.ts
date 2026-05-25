import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { RequireTenantFeatures } from '../tenants/decorators/require-tenant-features.decorator';
import {
  AdjustLeaveBalanceDto,
  CreateLeaveApprovalRuleDto,
  CreateLeaveBlackoutWindowDto,
  CreateLeaveCalendarDayDto,
  CreateLeaveCalendarDto,
  CreateLeavePolicyDto,
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
  DecideLeaveRequestDto,
  ListLeaveQueryDto,
  UpdateLeaveApprovalRuleDto,
  UpdateLeaveBlackoutWindowDto,
  UpdateLeaveCalendarDayDto,
  UpdateLeaveCalendarDto,
  UpdateLeavePolicyDto,
  UpdateLeaveTypeDto,
} from './dto/leave.dto';
import { LeaveService } from './leave.service';

@ApiTags('leave')
@ApiCookieAuth('access_token')
@RequireTenantFeatures('LEAVE')
@Controller('api/v1/leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('summary')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'Return the role-aware leave command summary.' })
  @ApiOkResponse({ description: 'Leave summary returned.' })
  async summary(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.leaveService.getSummary(user);
  }

  @Get('my')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'Return current employee leave balances and requests.' })
  @ApiOkResponse({ description: 'Current employee leave workspace returned.' })
  async myLeave(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListLeaveQueryDto) {
    return this.leaveService.getMyLeave(user, query);
  }

  @Get('requests')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'List leave requests in the current leave scope.' })
  @ApiOkResponse({ description: 'Leave requests returned.' })
  async listRequests(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListLeaveQueryDto) {
    return this.leaveService.listRequests(user, query);
  }

  @Post('requests')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'Create and submit a leave request through the adopted workflow template.' })
  @ApiOkResponse({ description: 'Leave request submitted.' })
  async createRequest(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveService.createRequest(user, dto);
  }

  @Post('requests/:id/approve')
  @RequirePermissions('leave.approve')
  @ApiOperation({ summary: 'Approve the current workflow step for a leave request.' })
  @ApiOkResponse({ description: 'Leave request approval step processed.' })
  async approveRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: DecideLeaveRequestDto,
  ) {
    return this.leaveService.approveRequest(user, requestId, dto);
  }

  @Post('requests/:id/reject')
  @RequirePermissions('leave.approve')
  @ApiOperation({ summary: 'Reject a leave request through the workflow engine.' })
  @ApiOkResponse({ description: 'Leave request rejected.' })
  async rejectRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: DecideLeaveRequestDto,
  ) {
    return this.leaveService.rejectRequest(user, requestId, dto);
  }

  @Post('requests/:id/cancel')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'Cancel or withdraw a leave request.' })
  @ApiOkResponse({ description: 'Leave request cancelled.' })
  async cancelRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: DecideLeaveRequestDto,
  ) {
    return this.leaveService.cancelRequest(user, requestId, dto);
  }

  @Get('balances')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'List leave balances in the current leave scope.' })
  @ApiOkResponse({ description: 'Leave balances returned.' })
  async listBalances(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListLeaveQueryDto) {
    return this.leaveService.listBalances(user, query);
  }

  @Post('balances/adjust')
  @RequirePermissions('leave.team.write')
  @ApiOperation({ summary: 'Adjust an employee leave balance with a ledger entry.' })
  @ApiOkResponse({ description: 'Leave balance adjusted.' })
  async adjustBalance(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: AdjustLeaveBalanceDto) {
    return this.leaveService.adjustBalance(user, dto);
  }

  @Get('types')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'List tenant leave types.' })
  @ApiOkResponse({ description: 'Leave types returned.' })
  async listTypes(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.leaveService.listTypes(user);
  }

  @Post('types')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Create a leave type.' })
  @ApiOkResponse({ description: 'Leave type created.' })
  async createType(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateLeaveTypeDto) {
    return this.leaveService.createType(user, dto);
  }

  @Patch('types/:id')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Update a leave type.' })
  @ApiOkResponse({ description: 'Leave type updated.' })
  async updateType(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') typeId: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leaveService.updateType(user, typeId, dto);
  }

  @Get('policies')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'List tenant leave policies.' })
  @ApiOkResponse({ description: 'Leave policies returned.' })
  async listPolicies(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.leaveService.listPolicies(user);
  }

  @Post('policies')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Create a leave policy.' })
  @ApiOkResponse({ description: 'Leave policy created.' })
  async createPolicy(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateLeavePolicyDto) {
    return this.leaveService.createPolicy(user, dto);
  }

  @Patch('policies/:id')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Update a leave policy.' })
  @ApiOkResponse({ description: 'Leave policy updated.' })
  async updatePolicy(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') policyId: string,
    @Body() dto: UpdateLeavePolicyDto,
  ) {
    return this.leaveService.updatePolicy(user, policyId, dto);
  }

  @Get('calendar')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'Return leave calendar events, blackout windows, and active requests.' })
  @ApiOkResponse({ description: 'Leave calendar view returned.' })
  async calendarView(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListLeaveQueryDto) {
    return this.leaveService.getCalendarView(user, query);
  }

  @Get('reports')
  @RequirePermissions('leave.reports.read')
  @ApiOperation({ summary: 'Return leave reports and coverage risk analytics.' })
  @ApiOkResponse({ description: 'Leave reports returned.' })
  async reports(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListLeaveQueryDto) {
    return this.leaveService.getReports(user, query);
  }

  @Get('calendars')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'List leave calendars.' })
  @ApiOkResponse({ description: 'Leave calendars returned.' })
  async listCalendars(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.leaveService.listCalendars(user);
  }

  @Post('calendars')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Create a leave calendar.' })
  @ApiOkResponse({ description: 'Leave calendar created.' })
  async createCalendar(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateLeaveCalendarDto) {
    return this.leaveService.createCalendar(user, dto);
  }

  @Patch('calendars/:id')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Update a leave calendar.' })
  @ApiOkResponse({ description: 'Leave calendar updated.' })
  async updateCalendar(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') calendarId: string,
    @Body() dto: UpdateLeaveCalendarDto,
  ) {
    return this.leaveService.updateCalendar(user, calendarId, dto);
  }

  @Get('calendar-days')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'List leave calendar days and holidays.' })
  @ApiOkResponse({ description: 'Leave calendar days returned.' })
  async listCalendarDays(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListLeaveQueryDto) {
    return this.leaveService.listCalendarDays(user, query);
  }

  @Post('calendar-days')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Create or update a leave calendar day.' })
  @ApiOkResponse({ description: 'Leave calendar day saved.' })
  async createCalendarDay(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateLeaveCalendarDayDto) {
    return this.leaveService.createCalendarDay(user, dto);
  }

  @Patch('calendar-days/:id')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Update a leave calendar day.' })
  @ApiOkResponse({ description: 'Leave calendar day updated.' })
  async updateCalendarDay(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') dayId: string,
    @Body() dto: UpdateLeaveCalendarDayDto,
  ) {
    return this.leaveService.updateCalendarDay(user, dayId, dto);
  }

  @Get('blackout-windows')
  @RequirePermissions('leave.self')
  @ApiOperation({ summary: 'List leave blackout windows.' })
  @ApiOkResponse({ description: 'Leave blackout windows returned.' })
  async listBlackoutWindows(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListLeaveQueryDto) {
    return this.leaveService.listBlackoutWindows(user, query);
  }

  @Post('blackout-windows')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Create a leave blackout window.' })
  @ApiOkResponse({ description: 'Leave blackout window created.' })
  async createBlackoutWindow(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateLeaveBlackoutWindowDto) {
    return this.leaveService.createBlackoutWindow(user, dto);
  }

  @Patch('blackout-windows/:id')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Update a leave blackout window.' })
  @ApiOkResponse({ description: 'Leave blackout window updated.' })
  async updateBlackoutWindow(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') blackoutId: string,
    @Body() dto: UpdateLeaveBlackoutWindowDto,
  ) {
    return this.leaveService.updateBlackoutWindow(user, blackoutId, dto);
  }

  @Get('approval-rules')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'List leave workflow adoption rules.' })
  @ApiOkResponse({ description: 'Leave approval rules returned.' })
  async listApprovalRules(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.leaveService.listApprovalRules(user);
  }

  @Post('approval-rules')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Create a leave workflow adoption rule.' })
  @ApiOkResponse({ description: 'Leave approval rule created.' })
  async createApprovalRule(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateLeaveApprovalRuleDto) {
    return this.leaveService.createApprovalRule(user, dto);
  }

  @Patch('approval-rules/:id')
  @RequirePermissions('leave.policy.write')
  @ApiOperation({ summary: 'Update a leave workflow adoption rule.' })
  @ApiOkResponse({ description: 'Leave approval rule updated.' })
  async updateApprovalRule(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') ruleId: string,
    @Body() dto: UpdateLeaveApprovalRuleDto,
  ) {
    return this.leaveService.updateApprovalRule(user, ruleId, dto);
  }
}
