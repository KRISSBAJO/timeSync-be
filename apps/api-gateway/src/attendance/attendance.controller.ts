import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RequirePermissions } from '../iam/decorators/require-permissions.decorator';
import { RequireTenantFeatures } from '../tenants/decorators/require-tenant-features.decorator';
import { AttendanceService } from './attendance.service';
import {
  AttendanceInsightsQueryDto,
  CreateAttendanceClockDeviceDto,
  CreateAttendanceCorrectionRequestDto,
  CreateAttendanceGeofenceDto,
  CreateAttendanceHolidayDto,
  CreateAttendanceKioskCredentialDto,
  CreateAttendancePremiumRuleDto,
  CreateAttendancePolicyDto,
  DecideAttendanceCorrectionRequestDto,
  DecideAttendanceExceptionDto,
  DecideTimesheetDto,
  ExportPayrollPeriodDto,
  GenerateTimesheetsDto,
  KioskPunchAttendanceDto,
  ListAttendanceControlsQueryDto,
  ListAttendanceCorrectionRequestsQueryDto,
  ListAttendanceExceptionsQueryDto,
  ListAttendancePayrollExportsQueryDto,
  ListAttendanceRecordsQueryDto,
  ListTimesheetsQueryDto,
  ManualAttendanceRecordDto,
  PayrollPeriodActionDto,
  PunchAttendanceDto,
  RunAttendanceReconciliationDto,
  SupervisorAttendanceBoardQueryDto,
  SyncOfflinePunchesDto,
  UpdateAttendanceClockDeviceDto,
  UpdateAttendanceGeofenceDto,
  UpdateAttendanceHolidayDto,
  UpdateAttendanceKioskCredentialDto,
  UpdateAttendancePremiumRuleDto,
  UpdateAttendancePolicyDto,
} from './dto/attendance.dto';

@ApiTags('attendance')
@ApiCookieAuth('access_token')
@RequireTenantFeatures('ATTENDANCE')
@Controller('api/v1/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('summary')
  @RequirePermissions('attendance.self')
  @ApiOperation({ summary: 'Return the role-aware attendance command summary.' })
  @ApiOkResponse({ description: 'Attendance summary returned.' })
  async summary(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.attendanceService.getSummary(user);
  }

  @Get('my')
  @RequirePermissions('attendance.self')
  @ApiOperation({ summary: 'Return current employee attendance, punches, exceptions, and timesheets.' })
  @ApiOkResponse({ description: 'Current employee attendance workspace returned.' })
  async myAttendance(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListAttendanceRecordsQueryDto) {
    return this.attendanceService.getMyAttendance(user, query);
  }

  @Post('my/punch')
  @RequirePermissions('attendance.self')
  @ApiOperation({ summary: 'Create a current employee clock or break punch.' })
  @ApiOkResponse({ description: 'Attendance punch recorded.' })
  async punch(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: PunchAttendanceDto) {
    return this.attendanceService.punch(user, dto);
  }

  @Post('my/offline-punches/sync')
  @RequirePermissions('attendance.self')
  @ApiOperation({ summary: 'Sync queued offline punches for the current employee.' })
  @ApiOkResponse({ description: 'Offline punch sync results returned.' })
  async syncOfflinePunches(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: SyncOfflinePunchesDto) {
    return this.attendanceService.syncOfflinePunches(user, dto);
  }

  @Post('kiosk/punch')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'Record a badge/PIN kiosk punch through an authenticated kiosk operator session.' })
  @ApiOkResponse({ description: 'Kiosk attendance punch recorded.' })
  async kioskPunch(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: KioskPunchAttendanceDto) {
    return this.attendanceService.kioskPunch(user, dto);
  }

  @Get('records')
  @RequirePermissions('attendance.self')
  @ApiOperation({ summary: 'List attendance records in the current attendance scope.' })
  @ApiOkResponse({ description: 'Attendance records returned.' })
  async listRecords(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListAttendanceRecordsQueryDto) {
    return this.attendanceService.listRecords(user, query);
  }

  @Get('supervisor-board')
  @RequirePermissions('attendance.self')
  @ApiOperation({ summary: 'Return a daily attendance board for the current attendance scope.' })
  @ApiOkResponse({ description: 'Supervisor attendance board returned.' })
  async supervisorBoard(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: SupervisorAttendanceBoardQueryDto) {
    return this.attendanceService.getSupervisorBoard(user, query);
  }

  @Get('reports/advanced')
  @RequirePermissions('attendance.reports.read')
  @ApiOperation({ summary: 'Return advanced attendance performance, payroll readiness, and control reports.' })
  @ApiOkResponse({ description: 'Advanced attendance report returned.' })
  async advancedReport(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: AttendanceInsightsQueryDto) {
    return this.attendanceService.getAdvancedReport(user, query);
  }

  @Get('alerts/predictive')
  @RequirePermissions('attendance.reports.read')
  @ApiOperation({ summary: 'Return predictive attendance alerts for the current attendance scope.' })
  @ApiOkResponse({ description: 'Predictive attendance alerts returned.' })
  async predictiveAlerts(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: AttendanceInsightsQueryDto) {
    return this.attendanceService.getPredictiveAlerts(user, query);
  }

  @Post('alerts/predictive/notify')
  @RequirePermissions('attendance.reports.read')
  @ApiOperation({ summary: 'Create in-app notifications for current predictive attendance alerts.' })
  @ApiOkResponse({ description: 'Predictive alert notifications queued.' })
  async notifyPredictiveAlerts(@CurrentUser() user: AuthenticatedPrincipal, @Body() query: AttendanceInsightsQueryDto) {
    return this.attendanceService.notifyPredictiveAlerts(user, query);
  }

  @Post('records/manual')
  @RequirePermissions('attendance.team.write')
  @ApiOperation({ summary: 'Create or adjust an attendance record manually.' })
  @ApiOkResponse({ description: 'Manual attendance record saved.' })
  async manualRecord(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: ManualAttendanceRecordDto) {
    return this.attendanceService.createManualRecord(user, dto);
  }

  @Get('correction-requests')
  @RequirePermissions('attendance.self')
  @ApiOperation({ summary: 'List attendance correction requests visible to the current user.' })
  @ApiOkResponse({ description: 'Attendance correction requests returned.' })
  async listCorrectionRequests(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListAttendanceCorrectionRequestsQueryDto,
  ) {
    return this.attendanceService.listCorrectionRequests(user, query);
  }

  @Post('correction-requests')
  @RequirePermissions('attendance.self')
  @ApiOperation({ summary: 'Request a correction to an attendance record.' })
  @ApiOkResponse({ description: 'Attendance correction request submitted.' })
  async requestCorrection(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateAttendanceCorrectionRequestDto,
  ) {
    return this.attendanceService.createCorrectionRequest(user, dto);
  }

  @Post('correction-requests/:id/decision')
  @RequirePermissions('attendance.team.write')
  @ApiOperation({ summary: 'Approve, reject, or cancel an attendance correction request.' })
  @ApiOkResponse({ description: 'Attendance correction request decision recorded.' })
  async decideCorrectionRequest(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') requestId: string,
    @Body() dto: DecideAttendanceCorrectionRequestDto,
  ) {
    return this.attendanceService.decideCorrectionRequest(user, requestId, dto);
  }

  @Get('exceptions')
  @RequirePermissions('attendance.self')
  @ApiOperation({ summary: 'List attendance exceptions visible to the current user.' })
  @ApiOkResponse({ description: 'Attendance exceptions returned.' })
  async listExceptions(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListAttendanceExceptionsQueryDto) {
    return this.attendanceService.listExceptions(user, query);
  }

  @Post('exceptions/:id/decision')
  @RequirePermissions('attendance.exceptions.approve')
  @ApiOperation({ summary: 'Approve, reject, waive, or resolve an attendance exception.' })
  @ApiOkResponse({ description: 'Attendance exception decision recorded.' })
  async decideException(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') exceptionId: string,
    @Body() dto: DecideAttendanceExceptionDto,
  ) {
    return this.attendanceService.decideException(user, exceptionId, dto);
  }

  @Get('timesheets')
  @RequirePermissions('attendance.self')
  @ApiOperation({ summary: 'List timesheets visible to the current user.' })
  @ApiOkResponse({ description: 'Timesheets returned.' })
  async listTimesheets(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListTimesheetsQueryDto) {
    return this.attendanceService.listTimesheets(user, query);
  }

  @Post('timesheets/generate')
  @RequirePermissions('attendance.team.write')
  @ApiOperation({ summary: 'Generate timesheets from schedules and attendance records.' })
  @ApiOkResponse({ description: 'Timesheets generated.' })
  async generateTimesheets(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: GenerateTimesheetsDto) {
    return this.attendanceService.generateTimesheets(user, dto);
  }

  @Post('timesheets/:id/submit')
  @RequirePermissions('attendance.self')
  @ApiOperation({ summary: 'Submit a timesheet for approval.' })
  @ApiOkResponse({ description: 'Timesheet submitted.' })
  async submitTimesheet(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') timesheetId: string) {
    return this.attendanceService.submitTimesheet(user, timesheetId);
  }

  @Post('timesheets/:id/decision')
  @RequirePermissions('attendance.timesheets.approve')
  @ApiOperation({ summary: 'Approve, reject, lock, or reopen a timesheet.' })
  @ApiOkResponse({ description: 'Timesheet decision recorded.' })
  async decideTimesheet(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') timesheetId: string,
    @Body() dto: DecideTimesheetDto,
  ) {
    return this.attendanceService.decideTimesheet(user, timesheetId, dto);
  }

  @Get('payroll/exports')
  @RequirePermissions('attendance.timesheets.approve')
  @ApiOperation({ summary: 'List payroll lock and export runs for attendance pay periods.' })
  @ApiOkResponse({ description: 'Payroll export runs returned.' })
  async listPayrollExports(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query() query: ListAttendancePayrollExportsQueryDto,
  ) {
    return this.attendanceService.listPayrollExports(user, query);
  }

  @Post('payroll/lock')
  @RequirePermissions('attendance.timesheets.approve')
  @ApiOperation({ summary: 'Lock approved attendance timesheets for a pay period.' })
  @ApiOkResponse({ description: 'Payroll period locked.' })
  async lockPayrollPeriod(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: PayrollPeriodActionDto) {
    return this.attendanceService.lockPayrollPeriod(user, dto);
  }

  @Post('payroll/export')
  @RequirePermissions('attendance.timesheets.approve')
  @ApiOperation({ summary: 'Generate an auditable payroll CSV export from locked timesheets.' })
  @ApiOkResponse({ description: 'Payroll export generated.' })
  async exportPayrollPeriod(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: ExportPayrollPeriodDto) {
    return this.attendanceService.exportPayrollPeriod(user, dto);
  }

  @Post('reconciliation/run')
  @RequirePermissions('attendance.team.write')
  @ApiOperation({ summary: 'Reconcile attendance records to nearby schedules, including overnight and split-shift candidates.' })
  @ApiOkResponse({ description: 'Attendance reconciliation summary returned.' })
  async runReconciliation(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: RunAttendanceReconciliationDto) {
    return this.attendanceService.runReconciliation(user, dto);
  }

  @Get('geofences')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'List attendance geofence controls.' })
  @ApiOkResponse({ description: 'Attendance geofences returned.' })
  async listGeofences(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListAttendanceControlsQueryDto) {
    return this.attendanceService.listGeofences(user, query);
  }

  @Post('geofences')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'Create an attendance geofence control.' })
  @ApiOkResponse({ description: 'Attendance geofence created.' })
  async createGeofence(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateAttendanceGeofenceDto) {
    return this.attendanceService.createGeofence(user, dto);
  }

  @Patch('geofences/:id')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'Update an attendance geofence control.' })
  @ApiOkResponse({ description: 'Attendance geofence updated.' })
  async updateGeofence(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') geofenceId: string,
    @Body() dto: UpdateAttendanceGeofenceDto,
  ) {
    return this.attendanceService.updateGeofence(user, geofenceId, dto);
  }

  @Get('devices')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'List trusted attendance clock devices and kiosks.' })
  @ApiOkResponse({ description: 'Attendance clock devices returned.' })
  async listClockDevices(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListAttendanceControlsQueryDto) {
    return this.attendanceService.listClockDevices(user, query);
  }

  @Post('devices')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'Register a trusted attendance clock device or kiosk.' })
  @ApiOkResponse({ description: 'Attendance clock device created.' })
  async createClockDevice(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateAttendanceClockDeviceDto) {
    return this.attendanceService.createClockDevice(user, dto);
  }

  @Patch('devices/:id')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'Update a trusted attendance clock device or kiosk.' })
  @ApiOkResponse({ description: 'Attendance clock device updated.' })
  async updateClockDevice(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') deviceId: string,
    @Body() dto: UpdateAttendanceClockDeviceDto,
  ) {
    return this.attendanceService.updateClockDevice(user, deviceId, dto);
  }

  @Get('kiosk-credentials')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'List badge/PIN kiosk credentials.' })
  @ApiOkResponse({ description: 'Attendance kiosk credentials returned.' })
  async listKioskCredentials(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListAttendanceControlsQueryDto) {
    return this.attendanceService.listKioskCredentials(user, query);
  }

  @Post('kiosk-credentials')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'Create a badge/PIN kiosk credential for an employee.' })
  @ApiOkResponse({ description: 'Attendance kiosk credential created.' })
  async createKioskCredential(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateAttendanceKioskCredentialDto) {
    return this.attendanceService.createKioskCredential(user, dto);
  }

  @Patch('kiosk-credentials/:id')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'Update a badge/PIN kiosk credential.' })
  @ApiOkResponse({ description: 'Attendance kiosk credential updated.' })
  async updateKioskCredential(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') credentialId: string,
    @Body() dto: UpdateAttendanceKioskCredentialDto,
  ) {
    return this.attendanceService.updateKioskCredential(user, credentialId, dto);
  }

  @Get('holidays')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'List attendance payroll holidays.' })
  @ApiOkResponse({ description: 'Attendance holidays returned.' })
  async listHolidays(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListAttendanceControlsQueryDto) {
    return this.attendanceService.listHolidays(user, query);
  }

  @Post('holidays')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'Create an attendance payroll holiday.' })
  @ApiOkResponse({ description: 'Attendance holiday created.' })
  async createHoliday(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateAttendanceHolidayDto) {
    return this.attendanceService.createHoliday(user, dto);
  }

  @Patch('holidays/:id')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'Update an attendance payroll holiday.' })
  @ApiOkResponse({ description: 'Attendance holiday updated.' })
  async updateHoliday(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') holidayId: string,
    @Body() dto: UpdateAttendanceHolidayDto,
  ) {
    return this.attendanceService.updateHoliday(user, holidayId, dto);
  }

  @Get('premium-rules')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'List attendance payroll premium and differential rules.' })
  @ApiOkResponse({ description: 'Attendance premium rules returned.' })
  async listPremiumRules(@CurrentUser() user: AuthenticatedPrincipal, @Query() query: ListAttendanceControlsQueryDto) {
    return this.attendanceService.listPremiumRules(user, query);
  }

  @Post('premium-rules')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'Create an attendance payroll premium or differential rule.' })
  @ApiOkResponse({ description: 'Attendance premium rule created.' })
  async createPremiumRule(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateAttendancePremiumRuleDto) {
    return this.attendanceService.createPremiumRule(user, dto);
  }

  @Patch('premium-rules/:id')
  @RequirePermissions('attendance.controls.write')
  @ApiOperation({ summary: 'Update an attendance payroll premium or differential rule.' })
  @ApiOkResponse({ description: 'Attendance premium rule updated.' })
  async updatePremiumRule(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') ruleId: string,
    @Body() dto: UpdateAttendancePremiumRuleDto,
  ) {
    return this.attendanceService.updatePremiumRule(user, ruleId, dto);
  }

  @Get('policies')
  @RequirePermissions('attendance.write')
  @ApiOperation({ summary: 'List tenant attendance policies.' })
  @ApiOkResponse({ description: 'Attendance policies returned.' })
  async listPolicies(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.attendanceService.listPolicies(user);
  }

  @Post('policies')
  @RequirePermissions('attendance.write')
  @ApiOperation({ summary: 'Create an attendance policy.' })
  @ApiOkResponse({ description: 'Attendance policy created.' })
  async createPolicy(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: CreateAttendancePolicyDto) {
    return this.attendanceService.createPolicy(user, dto);
  }

  @Patch('policies/:id')
  @RequirePermissions('attendance.write')
  @ApiOperation({ summary: 'Update an attendance policy.' })
  @ApiOkResponse({ description: 'Attendance policy updated.' })
  async updatePolicy(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') policyId: string,
    @Body() dto: UpdateAttendancePolicyDto,
  ) {
    return this.attendanceService.updatePolicy(user, policyId, dto);
  }

  @Post('policies/:id/activate')
  @RequirePermissions('attendance.write')
  @ApiOperation({ summary: 'Activate one attendance policy for the tenant.' })
  @ApiOkResponse({ description: 'Attendance policy activated.' })
  async activatePolicy(@CurrentUser() user: AuthenticatedPrincipal, @Param('id') policyId: string) {
    return this.attendanceService.activatePolicy(user, policyId);
  }
}
