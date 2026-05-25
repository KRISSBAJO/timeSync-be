import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EmployeeLifecycleTemplateStatus,
  EmployeeLifecyclePlanStatus,
  EmployeeLifecyclePlanType,
  EmployeeLifecycleTaskOwnerType,
  EmployeeLifecycleTaskPriority,
  EmployeeLifecycleTaskStatus,
} from '@prisma/client';
import {
  IsDateString,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEmployeeLifecyclePlanDto {
  @ApiProperty({ enum: EmployeeLifecyclePlanType })
  @IsEnum(EmployeeLifecyclePlanType)
  type!: EmployeeLifecyclePlanType;

  @ApiProperty({ example: 'Clinical onboarding plan' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Role-specific onboarding tasks for a new clinical hire.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: EmployeeLifecyclePlanStatus, default: EmployeeLifecyclePlanStatus.ACTIVE })
  @IsOptional()
  @IsEnum(EmployeeLifecyclePlanStatus)
  status?: EmployeeLifecyclePlanStatus;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-06-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ example: { template: 'clinical-onboarding' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateEmployeeLifecyclePlanDto {
  @ApiPropertyOptional({ example: 'Clinical onboarding plan' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Role-specific onboarding tasks for a new clinical hire.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: EmployeeLifecyclePlanStatus })
  @IsOptional()
  @IsEnum(EmployeeLifecyclePlanStatus)
  status?: EmployeeLifecyclePlanStatus;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-06-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ example: { owner: 'HR operations' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateEmployeeLifecycleTaskDto {
  @ApiProperty({ example: 'Complete direct deposit record' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Employee submits a payout account for HR verification.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'Payroll readiness' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ enum: EmployeeLifecycleTaskOwnerType, default: EmployeeLifecycleTaskOwnerType.HR })
  @IsOptional()
  @IsEnum(EmployeeLifecycleTaskOwnerType)
  ownerType?: EmployeeLifecycleTaskOwnerType;

  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  assignedUserId?: string;

  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  assignedEmployeeId?: string;

  @ApiPropertyOptional({ enum: EmployeeLifecycleTaskPriority, default: EmployeeLifecycleTaskPriority.NORMAL })
  @IsOptional()
  @IsEnum(EmployeeLifecycleTaskPriority)
  priority?: EmployeeLifecycleTaskPriority;

  @ApiPropertyOptional({ example: '2026-06-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ example: 'Upload bank name and account details for HR verification.' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  instructions?: string;

  @ApiPropertyOptional({ example: { requiredEvidence: ['payout_account'] } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateEmployeeLifecycleTaskDto {
  @ApiPropertyOptional({ example: 'Complete direct deposit record' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Employee submits a payout account for HR verification.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'Payroll readiness' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ enum: EmployeeLifecycleTaskOwnerType })
  @IsOptional()
  @IsEnum(EmployeeLifecycleTaskOwnerType)
  ownerType?: EmployeeLifecycleTaskOwnerType;

  @ApiPropertyOptional({ enum: EmployeeLifecycleTaskStatus })
  @IsOptional()
  @IsEnum(EmployeeLifecycleTaskStatus)
  status?: EmployeeLifecycleTaskStatus;

  @ApiPropertyOptional({ enum: EmployeeLifecycleTaskPriority })
  @IsOptional()
  @IsEnum(EmployeeLifecycleTaskPriority)
  priority?: EmployeeLifecycleTaskPriority;

  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  assignedUserId?: string;

  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  assignedEmployeeId?: string;

  @ApiPropertyOptional({ example: '2026-06-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ example: 'Upload bank name and account details for HR verification.' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  instructions?: string;

  @ApiPropertyOptional({ example: 'Waiting on supporting document.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  blockedReason?: string;

  @ApiPropertyOptional({ example: { requiredEvidence: ['payout_account'] } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CompleteEmployeeLifecycleTaskDto {
  @ApiPropertyOptional({ example: 'Submitted payout details and verified the record.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ example: { documentId: 'optional-reference', submittedBy: 'employee' } })
  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class BlockEmployeeLifecycleTaskDto {
  @ApiProperty({ example: 'Waiting on signed authorization form.' })
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class WaiveEmployeeLifecycleTaskDto {
  @ApiPropertyOptional({ example: 'Task not required for this employee category.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CreateEmployeeLifecycleTemplateDto {
  @ApiProperty({ example: 'CLINICAL_ONBOARDING' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'Clinical employee onboarding' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: EmployeeLifecyclePlanType, example: EmployeeLifecyclePlanType.ONBOARDING })
  @IsEnum(EmployeeLifecyclePlanType)
  type!: EmployeeLifecyclePlanType;

  @ApiPropertyOptional({ example: 'Reusable checklist for clinical hires.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: EmployeeLifecycleTemplateStatus, default: EmployeeLifecycleTemplateStatus.DRAFT })
  @IsOptional()
  @IsEnum(EmployeeLifecycleTemplateStatus)
  status?: EmployeeLifecycleTemplateStatus;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetDays?: number;

  @ApiPropertyOptional({ example: { audience: 'clinical' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateEmployeeLifecycleTemplateDto {
  @ApiPropertyOptional({ example: 'CLINICAL_ONBOARDING' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @ApiPropertyOptional({ example: 'Clinical employee onboarding' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: EmployeeLifecyclePlanType })
  @IsOptional()
  @IsEnum(EmployeeLifecyclePlanType)
  type?: EmployeeLifecyclePlanType;

  @ApiPropertyOptional({ example: 'Reusable checklist for clinical hires.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: EmployeeLifecycleTemplateStatus })
  @IsOptional()
  @IsEnum(EmployeeLifecycleTemplateStatus)
  status?: EmployeeLifecycleTemplateStatus;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetDays?: number;

  @ApiPropertyOptional({ example: { audience: 'clinical' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateEmployeeLifecycleTemplateTaskDto {
  @ApiProperty({ example: 'Submit signed policy acknowledgements' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Compliance' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ example: 'Employee uploads acknowledgements before first day.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: EmployeeLifecycleTaskOwnerType, default: EmployeeLifecycleTaskOwnerType.HR })
  @IsOptional()
  @IsEnum(EmployeeLifecycleTaskOwnerType)
  ownerType?: EmployeeLifecycleTaskOwnerType;

  @ApiPropertyOptional({ enum: EmployeeLifecycleTaskPriority, default: EmployeeLifecycleTaskPriority.NORMAL })
  @IsOptional()
  @IsEnum(EmployeeLifecycleTaskPriority)
  priority?: EmployeeLifecycleTaskPriority;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  dueOffsetDays?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  requiresDocument?: boolean;

  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  documentTypeId?: string;

  @ApiPropertyOptional({ example: 'Upload the required file and mark the task complete.' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  instructions?: string;

  @ApiPropertyOptional({ example: { documentStage: 'preboarding' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateEmployeeLifecycleTemplateTaskDto {
  @ApiPropertyOptional({ example: 'Submit signed policy acknowledgements' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Compliance' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ example: 'Employee uploads acknowledgements before first day.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: EmployeeLifecycleTaskOwnerType })
  @IsOptional()
  @IsEnum(EmployeeLifecycleTaskOwnerType)
  ownerType?: EmployeeLifecycleTaskOwnerType;

  @ApiPropertyOptional({ enum: EmployeeLifecycleTaskPriority })
  @IsOptional()
  @IsEnum(EmployeeLifecycleTaskPriority)
  priority?: EmployeeLifecycleTaskPriority;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  dueOffsetDays?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  requiresDocument?: boolean;

  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  documentTypeId?: string;

  @ApiPropertyOptional({ example: 'Upload the required file and mark the task complete.' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  instructions?: string;

  @ApiPropertyOptional({ example: { documentStage: 'preboarding' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class InstantiateEmployeeLifecycleTemplateDto {
  @ApiProperty({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsUUID('4')
  templateId!: string;

  @ApiPropertyOptional({ example: 'Onboarding for clinical nurse' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-06-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ example: { cohort: 'june-intake' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RemindEmployeeLifecycleTaskDto {
  @ApiPropertyOptional({ example: 'Please complete this onboarding item before your start date.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class CreateMyEmployeeDocumentDto {
  @ApiProperty({ example: 'Signed direct deposit authorization' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: 'Submitted from employee self-service.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '7c1bc8a0-9244-465d-b570-aaf0c11f1e8b' })
  @IsOptional()
  @IsUUID('4')
  documentTypeId?: string;

  @ApiPropertyOptional({ example: '2027-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 'direct-deposit.pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional({ example: 'https://storage.example.com/direct-deposit.pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fileUrl?: string;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  mimeType?: string;

  @ApiPropertyOptional({ example: 124000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @ApiPropertyOptional({ example: 'sha256-checksum' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  checksum?: string;

  @ApiPropertyOptional({ example: { submittedFor: 'onboarding' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
