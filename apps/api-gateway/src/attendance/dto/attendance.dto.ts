import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  AttendanceClockDeviceType,
  AttendanceCorrectionRequestStatus,
  AttendanceControlStatus,
  AttendanceExceptionStatus,
  AttendanceExceptionType,
  AttendanceKioskCredentialStatus,
  AttendancePremiumRuleType,
  AttendancePayrollExportStatus,
  AttendancePolicyStatus,
  AttendancePunchType,
  AttendanceRecordStatus,
  AttendanceSource,
  AttendanceTimesheetStatus,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ListAttendanceQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ListAttendanceRecordsQueryDto extends ListAttendanceQueryDto {
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

  @ApiPropertyOptional({ example: 'Ward A' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional({ enum: AttendanceRecordStatus })
  @IsOptional()
  @IsEnum(AttendanceRecordStatus)
  status?: AttendanceRecordStatus;
}

export class ListAttendanceExceptionsQueryDto extends ListAttendanceRecordsQueryDto {
  @ApiPropertyOptional({ enum: AttendanceExceptionStatus })
  @IsOptional()
  @IsEnum(AttendanceExceptionStatus)
  exceptionStatus?: AttendanceExceptionStatus;

  @ApiPropertyOptional({ enum: AttendanceExceptionType })
  @IsOptional()
  @IsEnum(AttendanceExceptionType)
  type?: AttendanceExceptionType;
}

export class ListTimesheetsQueryDto extends ListAttendanceRecordsQueryDto {
  @ApiPropertyOptional({ enum: AttendanceTimesheetStatus })
  @IsOptional()
  @IsEnum(AttendanceTimesheetStatus)
  timesheetStatus?: AttendanceTimesheetStatus;
}

export class ListAttendanceCorrectionRequestsQueryDto extends ListAttendanceRecordsQueryDto {
  @ApiPropertyOptional({ enum: AttendanceCorrectionRequestStatus })
  @IsOptional()
  @IsEnum(AttendanceCorrectionRequestStatus)
  correctionStatus?: AttendanceCorrectionRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recordId?: string;
}

export class SupervisorAttendanceBoardQueryDto extends ListAttendanceRecordsQueryDto {
  @ApiPropertyOptional({ example: '2026-05-22T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class ListAttendancePayrollExportsQueryDto extends ListAttendanceRecordsQueryDto {
  @ApiPropertyOptional({ enum: AttendancePayrollExportStatus })
  @IsOptional()
  @IsEnum(AttendancePayrollExportStatus)
  payrollExportStatus?: AttendancePayrollExportStatus;
}

export class ListAttendanceControlsQueryDto extends ListAttendanceRecordsQueryDto {
  @ApiPropertyOptional({ enum: AttendanceControlStatus })
  @IsOptional()
  @IsEnum(AttendanceControlStatus)
  controlStatus?: AttendanceControlStatus;

  @ApiPropertyOptional({ enum: AttendanceClockDeviceType })
  @IsOptional()
  @IsEnum(AttendanceClockDeviceType)
  deviceType?: AttendanceClockDeviceType;

  @ApiPropertyOptional({ enum: AttendanceKioskCredentialStatus })
  @IsOptional()
  @IsEnum(AttendanceKioskCredentialStatus)
  kioskCredentialStatus?: AttendanceKioskCredentialStatus;

  @ApiPropertyOptional({ enum: AttendancePremiumRuleType })
  @IsOptional()
  @IsEnum(AttendancePremiumRuleType)
  premiumRuleType?: AttendancePremiumRuleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  geofenceId?: string;
}

export class AttendanceInsightsQueryDto extends ListAttendanceRecordsQueryDto {
  @ApiPropertyOptional({ example: 30, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  lookbackDays?: number;
}

export class CreateAttendancePolicyDto {
  @ApiProperty({ example: 'STANDARD_CLOCK_POLICY' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Standard attendance policy' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: AttendancePolicyStatus })
  @IsOptional()
  @IsEnum(AttendancePolicyStatus)
  status?: AttendancePolicyStatus;

  @ApiPropertyOptional({ example: 'America/Chicago' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowWebClockIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowMobileClockIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowKioskClockIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireScheduleForClockIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireLocationCapture?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireKnownDevice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireGeofenceForClockIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  blockOutsideGeofence?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  geofenceGraceMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requirePhotoAttestation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireAttestationNote?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowOfflinePunchSync?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(10080)
  offlinePunchGraceMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowManualAdjustments?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoCreateTimesheetEntries?: boolean;

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
  @Min(0)
  @Max(240)
  graceMinutesEarlyLeave?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  roundingMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(1440)
  maxShiftMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  dailyOvertimeMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10080)
  weeklyOvertimeMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  breakRequiredAfterMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  breakDurationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateAttendancePolicyDto extends PartialType(CreateAttendancePolicyDto) {}

export class CreateAttendanceGeofenceDto {
  @ApiProperty({ example: 'MAIN_CLINIC' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Main clinic' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: AttendanceControlStatus })
  @IsOptional()
  @IsEnum(AttendanceControlStatus)
  status?: AttendanceControlStatus;

  @ApiProperty({ example: 41.8781 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: -87.6298 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ example: 150, default: 150 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(10000)
  radiusMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

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
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateAttendanceGeofenceDto extends PartialType(CreateAttendanceGeofenceDto) {}

export class CreateAttendanceClockDeviceDto {
  @ApiProperty({ example: 'KIOSK-LOBBY-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  deviceId!: string;

  @ApiProperty({ example: 'Lobby kiosk' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: AttendanceClockDeviceType })
  @IsOptional()
  @IsEnum(AttendanceClockDeviceType)
  type?: AttendanceClockDeviceType;

  @ApiPropertyOptional({ enum: AttendanceControlStatus })
  @IsOptional()
  @IsEnum(AttendanceControlStatus)
  status?: AttendanceControlStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  geofenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateAttendanceClockDeviceDto extends PartialType(CreateAttendanceClockDeviceDto) {}

export class PunchAttendanceDto {
  @ApiProperty({ enum: AttendancePunchType })
  @IsEnum(AttendancePunchType)
  type!: AttendancePunchType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleAssignmentId?: string;

  @ApiPropertyOptional({ example: '2026-05-22T14:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ enum: AttendanceSource, default: AttendanceSource.WEB })
  @IsOptional()
  @IsEnum(AttendanceSource)
  source?: AttendanceSource;

  @ApiPropertyOptional({ example: 'America/Chicago' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ example: 'Ward A kiosk' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ example: 'https://files.example.com/attendance/selfie.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  photoAttestationUrl?: string;

  @ApiPropertyOptional({ example: 'Selfie confirmed at front desk.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attestationNote?: string;

  @ApiPropertyOptional({ example: 'offline-20260522-employee-01-clockin' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  clientMutationId?: string;
}

export class KioskPunchAttendanceDto extends PunchAttendanceDto {
  @ApiProperty({ example: 'ACME-0004' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  badgeNumber!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  pin!: string;
}

export class OfflinePunchAttendanceDto extends OmitType(PunchAttendanceDto, ['clientMutationId'] as const) {
  @ApiProperty({ example: 'offline-20260522-employee-01-clockin' })
  @IsString()
  @MinLength(8)
  @MaxLength(160)
  declare clientMutationId: string;
}

export class SyncOfflinePunchesDto {
  @ApiProperty({ type: [OfflinePunchAttendanceDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OfflinePunchAttendanceDto)
  punches!: OfflinePunchAttendanceDto[];
}

export class CreateAttendanceKioskCredentialDto {
  @ApiProperty()
  @IsString()
  employeeId!: string;

  @ApiProperty({ example: 'ACME-0004' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  badgeNumber!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  pin!: string;

  @ApiPropertyOptional({ enum: AttendanceKioskCredentialStatus })
  @IsOptional()
  @IsEnum(AttendanceKioskCredentialStatus)
  status?: AttendanceKioskCredentialStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateAttendanceKioskCredentialDto extends PartialType(CreateAttendanceKioskCredentialDto) {}

export class CreateAttendanceHolidayDto {
  @ApiProperty({ example: 'MEMORIAL_DAY' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Memorial Day' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiProperty({ example: '2026-05-25T00:00:00.000Z' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ enum: AttendanceControlStatus })
  @IsOptional()
  @IsEnum(AttendanceControlStatus)
  status?: AttendanceControlStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  multiplier?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateAttendanceHolidayDto extends PartialType(CreateAttendanceHolidayDto) {}

export class CreateAttendancePremiumRuleDto {
  @ApiProperty({ example: 'NIGHT_DIFF' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Night differential' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiProperty({ enum: AttendancePremiumRuleType })
  @IsEnum(AttendancePremiumRuleType)
  type!: AttendancePremiumRuleType;

  @ApiPropertyOptional({ enum: AttendanceControlStatus })
  @IsOptional()
  @IsEnum(AttendanceControlStatus)
  status?: AttendanceControlStatus;

  @ApiPropertyOptional({ example: 1.25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  multiplier?: number;

  @ApiPropertyOptional({ example: 1320 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  startsAtMinute?: number;

  @ApiPropertyOptional({ example: 360 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  endsAtMinute?: number;

  @ApiPropertyOptional({ example: [0, 6] })
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
  @MaxLength(180)
  locationName?: string;

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
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateAttendancePremiumRuleDto extends PartialType(CreateAttendancePremiumRuleDto) {}

export class RunAttendanceReconciliationDto extends ListAttendanceRecordsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ManualAttendanceRecordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recordId?: string;

  @ApiProperty()
  @IsString()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleAssignmentId?: string;

  @ApiProperty({ example: '2026-05-22T00:00:00.000Z' })
  @IsDateString()
  workDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualClockInAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualClockOutAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  breakMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adjustmentReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  supportingDocumentUrl?: string;
}

export class CreateAttendanceCorrectionRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recordId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleAssignmentId?: string;

  @ApiProperty({ example: '2026-05-22T00:00:00.000Z' })
  @IsDateString()
  workDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualClockInAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualClockOutAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  breakMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ example: 'Employee resumed at 8:00 AM but forgot to clock in until 10:00 AM.' })
  @IsString()
  @MinLength(4)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  supportingDocumentUrl?: string;
}

export class DecideAttendanceCorrectionRequestDto {
  @ApiProperty({ enum: AttendanceCorrectionRequestStatus, example: AttendanceCorrectionRequestStatus.APPROVED })
  @IsEnum(AttendanceCorrectionRequestStatus)
  status!: AttendanceCorrectionRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNote?: string;
}

export class DecideAttendanceExceptionDto {
  @ApiProperty({ enum: AttendanceExceptionStatus, example: AttendanceExceptionStatus.APPROVED })
  @IsEnum(AttendanceExceptionStatus)
  status!: AttendanceExceptionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNote?: string;
}

export class GenerateTimesheetsDto {
  @ApiProperty({ example: '2026-05-18T00:00:00.000Z' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-05-24T23:59:59.999Z' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class PayrollPeriodActionDto {
  @ApiProperty({ example: '2026-05-18T00:00:00.000Z' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-05-24T23:59:59.999Z' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ExportPayrollPeriodDto extends PayrollPeriodActionDto {
  @ApiPropertyOptional({ example: 'CSV', default: 'CSV' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  format?: string;
}

export class DecideTimesheetDto {
  @ApiProperty({ enum: AttendanceTimesheetStatus, example: AttendanceTimesheetStatus.APPROVED })
  @IsEnum(AttendanceTimesheetStatus)
  status!: AttendanceTimesheetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNote?: string;
}
