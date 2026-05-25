import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  EmployeeAvailabilityStatus,
  EmployeeStatus,
  OpenShiftClaimStatus,
  OpenShiftStatus,
  OvertimeApprovalMode,
  OvertimePolicyMode,
  OvertimeRequestStatus,
  ScheduleAssignmentSource,
  ScheduleAssignmentStatus,
  ScheduleCoverageRuleStatus,
  SchedulePolicyStatus,
  ScheduleStatus,
  ScheduleSwapRequestStatus,
  ScheduleWeekStart,
  ShiftStatus,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum AvailabilityApplyMode {
  SINGLE_DAY = 'SINGLE_DAY',
  ALL_WEEK = 'ALL_WEEK',
  SELECTED_DAYS = 'SELECTED_DAYS',
}

export enum ScheduleUnassignmentMode {
  CANCEL_ONLY = 'CANCEL_ONLY',
  RETURN_TO_OPEN_SHIFT = 'RETURN_TO_OPEN_SHIFT',
}

export enum SchedulePlannerView {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

export class ListSchedulingQueryDto {
  @ApiPropertyOptional({ example: '2026-05-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-05-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 'uuid-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ListScheduleAssignmentsQueryDto extends ListSchedulingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: 'Jordan ACME-0004' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  employeeSearch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ example: 'Chicago clinic' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleId?: string;

  @ApiPropertyOptional({ enum: ScheduleAssignmentStatus })
  @IsOptional()
  @IsEnum(ScheduleAssignmentStatus)
  status?: ScheduleAssignmentStatus;
}

export class ListOpenShiftsQueryDto extends ListSchedulingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ example: 'Chicago clinic' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional({ enum: OpenShiftStatus })
  @IsOptional()
  @IsEnum(OpenShiftStatus)
  status?: OpenShiftStatus;
}

export class ListOpenShiftEligibleEmployeesQueryDto extends ListSchedulingQueryDto {
  @ApiPropertyOptional({ example: 'Jordan ACME-0004' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  employeeSearch?: string;
}

export class ListSchedulableEmployeesQueryDto extends ListSchedulingQueryDto {
  @ApiPropertyOptional({ example: 'Jordan ACME-0004' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  employeeSearch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class ListOpenShiftClaimsQueryDto extends ListSchedulingQueryDto {
  @ApiPropertyOptional({ enum: OpenShiftClaimStatus })
  @IsOptional()
  @IsEnum(OpenShiftClaimStatus)
  status?: OpenShiftClaimStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: 'Jordan ACME-0004' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  employeeSearch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ example: 'Chicago clinic' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional({ example: 'teddy night shift' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}

export class ListAvailabilityQueryDto extends ListSchedulingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: 'Jordan ACME-0004' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  employeeSearch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ enum: EmployeeAvailabilityStatus })
  @IsOptional()
  @IsEnum(EmployeeAvailabilityStatus)
  status?: EmployeeAvailabilityStatus;
}

export class PlannerSummaryQueryDto extends ListSchedulingQueryDto {
  @ApiPropertyOptional({ enum: SchedulePlannerView, default: SchedulePlannerView.WEEK })
  @IsOptional()
  @IsEnum(SchedulePlannerView)
  view?: SchedulePlannerView;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: 'Jordan ACME-0004' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  employeeSearch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ example: 'Chicago clinic' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional({ enum: ScheduleAssignmentStatus })
  @IsOptional()
  @IsEnum(ScheduleAssignmentStatus)
  assignmentStatus?: ScheduleAssignmentStatus;

  @ApiPropertyOptional({ enum: EmployeeAvailabilityStatus })
  @IsOptional()
  @IsEnum(EmployeeAvailabilityStatus)
  availabilityStatus?: EmployeeAvailabilityStatus;
}

export class CreateSchedulePolicyDto {
  @ApiProperty({ example: 'NG_NO_OVERTIME' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Nigeria standard no-overtime policy' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: SchedulePolicyStatus })
  @IsOptional()
  @IsEnum(SchedulePolicyStatus)
  status?: SchedulePolicyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryId?: string;

  @ApiPropertyOptional({ example: 'Africa/Lagos' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: ScheduleWeekStart })
  @IsOptional()
  @IsEnum(ScheduleWeekStart)
  weekStartsOn?: ScheduleWeekStart;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  standardHoursPerDay?: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(168)
  standardHoursPerWeek?: number;

  @ApiPropertyOptional({ enum: OvertimePolicyMode })
  @IsOptional()
  @IsEnum(OvertimePolicyMode)
  overtimeMode?: OvertimePolicyMode;

  @ApiPropertyOptional({ enum: OvertimeApprovalMode })
  @IsOptional()
  @IsEnum(OvertimeApprovalMode)
  overtimeApprovalMode?: OvertimeApprovalMode;

  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  overtimeMultiplier?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  doubleTimeMultiplier?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  weekendOvertime?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  holidayOvertime?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowSelfScheduling?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowOpenShiftPickup?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowManagerAssignment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowHrAssignment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  maxConsecutiveDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(48)
  minRestHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  graceMinutesEarly?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  graceMinutesLate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  roundingMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateSchedulePolicyDto extends PartialType(CreateSchedulePolicyDto) {}

export class CreateWorkShiftDto {
  @ApiProperty({ example: 'DAY_0800_1600' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Day shift' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: ShiftStatus })
  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;

  @ApiProperty({ example: '08:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({ example: '16:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  breakMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paidBreak?: boolean;

  @ApiPropertyOptional({ example: 'America/Chicago' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: '#3820d7' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOvertimeEligible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  minHeadcount?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  maxHeadcount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateWorkShiftDto extends PartialType(CreateWorkShiftDto) {}

export class ListCoverageRulesQueryDto extends ListSchedulingQueryDto {
  @ApiPropertyOptional({ enum: ScheduleCoverageRuleStatus })
  @IsOptional()
  @IsEnum(ScheduleCoverageRuleStatus)
  status?: ScheduleCoverageRuleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional({ example: 'Chicago clinic' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional({ example: 'Care evening coverage' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  search?: string;
}

export class CreateCoverageRuleDto {
  @ApiProperty({ example: 'CARE_WEEKDAY_EVENING_MIN' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Care evening weekday coverage' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiProperty({ example: [1, 2, 3, 4, 5], description: 'UTC weekdays, Sunday = 0.' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays!: number[];

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startsAtTime?: string;

  @ApiPropertyOptional({ example: '16:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endsAtTime?: string;

  @ApiPropertyOptional({ example: 'Africa/Lagos' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'Lagos clinic floor 2' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  requiredHeadcount?: number;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  minimumHeadcount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ enum: ScheduleCoverageRuleStatus })
  @IsOptional()
  @IsEnum(ScheduleCoverageRuleStatus)
  status?: ScheduleCoverageRuleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateCoverageRuleDto extends PartialType(CreateCoverageRuleDto) {}

export class CreateSchedulePeriodDto {
  @ApiProperty({ example: 'MAY_2026_WEEK_3' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'May 2026 week 3' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiProperty()
  @IsDateString()
  startsOn!: string;

  @ApiProperty()
  @IsDateString()
  endsOn!: string;

  @ApiPropertyOptional({ example: 'Africa/Lagos' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: ScheduleStatus })
  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class LockSchedulePeriodDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateScheduleAssignmentDto {
  @ApiProperty()
  @IsString()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerEmployeeId?: string;

  @ApiPropertyOptional({ enum: ScheduleAssignmentSource })
  @IsOptional()
  @IsEnum(ScheduleAssignmentSource)
  source?: ScheduleAssignmentSource;

  @ApiProperty()
  @IsDateString()
  workDate!: string;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiProperty()
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  breakMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOpenShift?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOvertime?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class BulkCreateScheduleAssignmentsDto {
  @ApiProperty({ type: [String], example: ['employee-id-1', 'employee-id-2'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  employeeIds!: string[];

  @ApiProperty({ type: [String], example: ['2026-05-19', '2026-05-20'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(62)
  @IsDateString({}, { each: true })
  workDates!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerEmployeeId?: string;

  @ApiProperty({ example: '08:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startsAtTime!: string;

  @ApiProperty({ example: '16:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endsAtTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  breakMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  skipConflicts?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateScheduleAssignmentStatusDto {
  @ApiProperty({ enum: ScheduleAssignmentStatus })
  @IsEnum(ScheduleAssignmentStatus)
  status!: ScheduleAssignmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdateScheduleAssignmentDto extends PartialType(CreateScheduleAssignmentDto) {}

export class UnassignScheduleAssignmentDto {
  @ApiPropertyOptional({ enum: ScheduleUnassignmentMode, default: ScheduleUnassignmentMode.CANCEL_ONLY })
  @IsOptional()
  @IsEnum(ScheduleUnassignmentMode)
  mode?: ScheduleUnassignmentMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class CreateOpenShiftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiProperty()
  @IsDateString()
  workDate!: string;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiProperty()
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  breakMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  locationName?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  requiredHeadcount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pickupRequiresApproval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateOpenShiftDto extends PartialType(CreateOpenShiftDto) {
  @ApiPropertyOptional({ enum: OpenShiftStatus })
  @IsOptional()
  @IsEnum(OpenShiftStatus)
  status?: OpenShiftStatus;
}

export class AssignOpenShiftDto {
  @ApiProperty()
  @IsString()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class DecideOpenShiftClaimDto {
  @ApiProperty({ enum: OpenShiftClaimStatus })
  @IsEnum(OpenShiftClaimStatus)
  status!: OpenShiftClaimStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateOvertimeRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiProperty()
  @IsDateString()
  requestDate!: string;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiProperty()
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class DecideOvertimeRequestDto {
  @ApiProperty({ enum: OvertimeRequestStatus })
  @IsEnum(OvertimeRequestStatus)
  status!: OvertimeRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionNote?: string;
}

export class ListScheduleSwapRequestsQueryDto extends ListSchedulingQueryDto {
  @ApiPropertyOptional({ enum: ScheduleSwapRequestStatus })
  @IsOptional()
  @IsEnum(ScheduleSwapRequestStatus)
  status?: ScheduleSwapRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignmentId?: string;

  @ApiPropertyOptional({ example: 'Jordan ACME-0004' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  employeeSearch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ example: 'Chicago clinic' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;
}

export class CreateScheduleSwapRequestDto {
  @ApiProperty()
  @IsString()
  assignmentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class DecideScheduleSwapRequestDto {
  @ApiProperty({ enum: ScheduleSwapRequestStatus })
  @IsEnum(ScheduleSwapRequestStatus)
  status!: ScheduleSwapRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionNote?: string;
}

export class CreateAvailabilityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    enum: AvailabilityApplyMode,
    description: 'Controls whether the availability applies to one day, every day in the policy week, or selected weekdays.',
  })
  @IsOptional()
  @IsEnum(AvailabilityApplyMode)
  applyMode?: AvailabilityApplyMode;

  @ApiPropertyOptional({
    type: [Number],
    example: [1, 2, 3, 4, 5],
    description: 'Selected weekdays using JavaScript weekday numbers: Sunday 0 through Saturday 6.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: EmployeeAvailabilityStatus })
  @IsOptional()
  @IsEnum(EmployeeAvailabilityStatus)
  status?: EmployeeAvailabilityStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  recurringRule?: string;

  @ApiPropertyOptional({
    description: 'When true, removes existing availability records for the selected employee and selected dates before writing the new window.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  replaceExisting?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
