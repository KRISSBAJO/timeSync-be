import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  LeaveBlackoutSeverity,
  LeaveCalendarDayType,
  LeavePolicyStatus,
  LeaveRequestStatus,
  LeaveTypeUnit,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListLeaveQueryDto {
  @ApiPropertyOptional({ example: '2026-05-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-05-31T23:59:59.999Z' })
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

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
  leaveTypeId?: string;

  @ApiPropertyOptional({ enum: LeaveRequestStatus })
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  calendarId?: string;
}

export class CreateLeaveTypeDto {
  @ApiProperty({ example: 'PTO' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Paid Time Off' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'PTO' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ enum: LeaveTypeUnit })
  @IsOptional()
  @IsEnum(LeaveTypeUnit)
  unit?: LeaveTypeUnit;

  @ApiPropertyOptional({ enum: LeavePolicyStatus })
  @IsOptional()
  @IsEnum(LeavePolicyStatus)
  status?: LeavePolicyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresDocumentation?: boolean;

  @ApiPropertyOptional({ example: '#3820d7' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateLeaveTypeDto extends PartialType(CreateLeaveTypeDto) {}

export class CreateLeavePolicyDto {
  @ApiProperty()
  @IsString()
  leaveTypeId!: string;

  @ApiProperty({ example: 'PTO_STANDARD' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Standard PTO Policy' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: LeavePolicyStatus })
  @IsOptional()
  @IsEnum(LeavePolicyStatus)
  status?: LeavePolicyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  eligibilityDays?: number;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200000)
  annualAllowanceMinutes?: number;

  @ApiPropertyOptional({ example: 'ANNUAL_GRANT' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  accrualMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200000)
  accrualRateMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200000)
  maxBalanceMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200000)
  carryoverLimitMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowNegativeBalance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200000)
  negativeBalanceLimitMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200000)
  minimumRequestMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200000)
  maximumRequestMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ example: 'LEAVE_STANDARD' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workflowCode?: string;

  @ApiPropertyOptional({ example: 'leave.request.submitted' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  workflowTriggerKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateLeavePolicyDto extends PartialType(CreateLeavePolicyDto) {}

export class CreateLeaveApprovalRuleDto {
  @ApiProperty({ example: 'STANDARD_LEAVE_APPROVAL' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Manager then HR approval' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ enum: LeavePolicyStatus })
  @IsOptional()
  @IsEnum(LeavePolicyStatus)
  status?: LeavePolicyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leaveTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workflowId?: string;

  @ApiPropertyOptional({ example: 'LEAVE_STANDARD' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workflowCode?: string;

  @ApiPropertyOptional({ example: 'leave.request.submitted' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  triggerKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  priority?: number;

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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200000)
  minMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200000)
  maxMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateLeaveApprovalRuleDto extends PartialType(CreateLeaveApprovalRuleDto) {}

export class CreateLeaveCalendarDto {
  @ApiProperty({ example: 'US_STANDARD' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'US standard leave calendar' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'America/Chicago' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  timezone?: string;

  @ApiPropertyOptional({ enum: LeavePolicyStatus })
  @IsOptional()
  @IsEnum(LeavePolicyStatus)
  status?: LeavePolicyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: [1, 2, 3, 4, 5], description: 'Weekdays, Sunday = 0.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workWeekdays?: number[];

  @ApiPropertyOptional({ example: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  defaultWorkdayMinutes?: number;

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

  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  countryCode?: string;

  @ApiPropertyOptional({ example: 'IL' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  regionCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateLeaveCalendarDto extends PartialType(CreateLeaveCalendarDto) {}

export class CreateLeaveCalendarDayDto {
  @ApiProperty()
  @IsString()
  calendarId!: string;

  @ApiProperty({ example: '2026-05-25T00:00:00.000Z' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: 'Memorial Day' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ enum: LeaveCalendarDayType })
  @IsOptional()
  @IsEnum(LeaveCalendarDayType)
  type?: LeaveCalendarDayType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @ApiPropertyOptional({ example: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  workdayMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateLeaveCalendarDayDto extends PartialType(CreateLeaveCalendarDayDto) {}

export class CreateLeaveBlackoutWindowDto {
  @ApiProperty({ example: 'PAYROLL_CLOSE_BLACKOUT' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Payroll close leave blackout' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: '2026-05-28T00:00:00.000Z' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ example: '2026-05-31T23:59:59.999Z' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ enum: LeaveBlackoutSeverity })
  @IsOptional()
  @IsEnum(LeaveBlackoutSeverity)
  severity?: LeaveBlackoutSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leaveTypeId?: string;

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

  @ApiPropertyOptional({ enum: LeavePolicyStatus })
  @IsOptional()
  @IsEnum(LeavePolicyStatus)
  status?: LeavePolicyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateLeaveBlackoutWindowDto extends PartialType(CreateLeaveBlackoutWindowDto) {}

export class AdjustLeaveBalanceDto {
  @ApiProperty()
  @IsString()
  employeeId!: string;

  @ApiProperty()
  @IsString()
  leaveTypeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  policyId?: string;

  @ApiProperty({ example: 480 })
  @Type(() => Number)
  @IsInt()
  @Min(-200000)
  @Max(200000)
  minutes!: number;

  @ApiProperty({ example: 'Opening balance for 2026.' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateLeaveRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiProperty()
  @IsString()
  leaveTypeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiProperty({ example: '2026-06-01T14:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ example: '2026-06-01T22:00:00.000Z' })
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({ example: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200000)
  requestedMinutes?: number;

  @ApiProperty({ example: 'Family medical appointment.' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  supportingDocumentUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class DecideLeaveRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
