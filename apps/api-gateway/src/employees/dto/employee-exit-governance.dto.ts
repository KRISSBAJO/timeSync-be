import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EmployeeClearanceStatus,
  EmployeeClearanceType,
  EmployeeExitRecordStatus,
  EmployeeRehirePolicy,
  EmployeeRehireRecordStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateEmployeeClearanceItemDto {
  @ApiProperty({ enum: EmployeeClearanceType })
  @IsEnum(EmployeeClearanceType)
  type!: EmployeeClearanceType;

  @ApiProperty({ example: 'Return assigned laptop' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Device and accessories must be returned before the final working day.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  ownerUserId?: string;

  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  ownerEmployeeId?: string;

  @ApiPropertyOptional({ example: 'LT-8842' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assetTag?: string;

  @ApiPropertyOptional({ example: 'Google Workspace' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  systemName?: string;

  @ApiPropertyOptional({ example: '2026-06-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ example: { ownerTeam: 'IT operations' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class StartEmployeeOffboardingDto {
  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  templateId?: string;

  @ApiPropertyOptional({ example: 'Voluntary resignation' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  separationType?: string;

  @ApiPropertyOptional({ example: 'Employee accepted another opportunity.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  separationReason?: string;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  noticeDate?: string;

  @ApiPropertyOptional({ example: '2026-06-28T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  lastWorkingDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  separationDate?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  eligibleForRehire?: boolean;

  @ApiPropertyOptional({ example: 'Recommended for rehire after manager review.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rehireRecommendation?: string;

  @ApiPropertyOptional({ example: '2026-06-30T23:59:00.000Z' })
  @IsOptional()
  @IsDateString()
  accessCutoffAt?: string;

  @ApiPropertyOptional({ type: [CreateEmployeeClearanceItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEmployeeClearanceItemDto)
  checklist?: CreateEmployeeClearanceItemDto[];

  @ApiPropertyOptional({ example: { exitInterviewOwner: 'HR operations' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateEmployeeExitRecordDto {
  @ApiPropertyOptional({ enum: EmployeeExitRecordStatus })
  @IsOptional()
  @IsEnum(EmployeeExitRecordStatus)
  status?: EmployeeExitRecordStatus;

  @ApiPropertyOptional({ example: 'Voluntary resignation' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  separationType?: string;

  @ApiPropertyOptional({ example: 'Employee accepted another opportunity.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  separationReason?: string;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  noticeDate?: string;

  @ApiPropertyOptional({ example: '2026-06-28T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  lastWorkingDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  separationDate?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  eligibleForRehire?: boolean;

  @ApiPropertyOptional({ example: 'Recommended for rehire after manager review.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rehireRecommendation?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  exitInterviewCompleted?: boolean;

  @ApiPropertyOptional({ enum: EmployeeClearanceStatus })
  @IsOptional()
  @IsEnum(EmployeeClearanceStatus)
  finalDocumentCollectionStatus?: EmployeeClearanceStatus;

  @ApiPropertyOptional({ enum: EmployeeClearanceStatus })
  @IsOptional()
  @IsEnum(EmployeeClearanceStatus)
  assetClearanceStatus?: EmployeeClearanceStatus;

  @ApiPropertyOptional({ enum: EmployeeClearanceStatus })
  @IsOptional()
  @IsEnum(EmployeeClearanceStatus)
  accessClearanceStatus?: EmployeeClearanceStatus;

  @ApiPropertyOptional({ example: '2026-06-30T23:59:00.000Z' })
  @IsOptional()
  @IsDateString()
  accessCutoffAt?: string;

  @ApiPropertyOptional({ example: { exitInterviewOwner: 'HR operations' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateEmployeeClearanceItemDto {
  @ApiPropertyOptional({ enum: EmployeeClearanceStatus })
  @IsOptional()
  @IsEnum(EmployeeClearanceStatus)
  status?: EmployeeClearanceStatus;

  @ApiPropertyOptional({ example: 'Return assigned laptop' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Device and accessories must be returned before the final working day.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  ownerUserId?: string;

  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  ownerEmployeeId?: string;

  @ApiPropertyOptional({ example: 'LT-8842' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assetTag?: string;

  @ApiPropertyOptional({ example: 'Google Workspace' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  systemName?: string;

  @ApiPropertyOptional({ example: '2026-06-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ example: '2026-06-29T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  clearedAt?: string;

  @ApiPropertyOptional({ example: 'Waiting for device handoff.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  blockedReason?: string;

  @ApiPropertyOptional({ example: { receiptNumber: 'IT-112' } })
  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { ownerTeam: 'IT operations' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateEmployeeRehireRecordDto {
  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  exitRecordId?: string;

  @ApiPropertyOptional({ enum: EmployeeRehirePolicy, default: EmployeeRehirePolicy.SAME_EMPLOYEE_RECORD })
  @IsOptional()
  @IsEnum(EmployeeRehirePolicy)
  policy?: EmployeeRehirePolicy;

  @ApiPropertyOptional({ enum: EmployeeRehireRecordStatus, default: EmployeeRehireRecordStatus.REVIEW })
  @IsOptional()
  @IsEnum(EmployeeRehireRecordStatus)
  status?: EmployeeRehireRecordStatus;

  @ApiPropertyOptional({ example: '2026-07-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @ApiPropertyOptional({ example: 'Returning to a new position after approved alumni review.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({ example: 'Approved for rehire by HR and business leadership.' })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  decisionNote?: string;

  @ApiPropertyOptional({ example: { source: 'alumni pipeline' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
