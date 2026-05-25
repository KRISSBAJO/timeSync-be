import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CompensationChangeStatus,
  CompensationComponentType,
  EmploymentContractType,
  EmploymentTermStatus,
  PayFrequency,
  ReportingRelationshipStatus,
  ReportingRelationshipType,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const DECIMAL_STRING = /^-?\d{1,16}(\.\d{1,2})?$/;

export class UpsertEmployeeEmploymentTermDto {
  @ApiPropertyOptional({ enum: EmploymentContractType })
  @IsOptional()
  @IsEnum(EmploymentContractType)
  contractType?: EmploymentContractType;

  @ApiPropertyOptional({ enum: EmploymentTermStatus })
  @IsOptional()
  @IsEnum(EmploymentTermStatus)
  status?: EmploymentTermStatus;

  @ApiPropertyOptional({ example: 'Full-time employment agreement' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional({ example: 'ACME-EMP-2026-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ enum: PayFrequency })
  @IsOptional()
  @IsEnum(PayFrequency)
  payFrequency?: PayFrequency;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @ApiPropertyOptional({ example: '85000.00' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING)
  baseAmount?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  gradeId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  levelId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  positionId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  organizationNodeId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  costCenterId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  documentId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  workflowRequestId?: string;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ example: '2027-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  approveNow?: boolean;

  @ApiPropertyOptional({ example: { source: 'employment-terms-workspace' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpsertEmployeeCompensationComponentDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  termId?: string;

  @ApiPropertyOptional({ enum: CompensationComponentType })
  @IsOptional()
  @IsEnum(CompensationComponentType)
  type?: CompensationComponentType;

  @ApiPropertyOptional({ example: 'Transportation allowance' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: '250.00' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING)
  amount?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @ApiPropertyOptional({ enum: PayFrequency })
  @IsOptional()
  @IsEnum(PayFrequency)
  frequency?: PayFrequency;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @ApiPropertyOptional({ enum: CompensationChangeStatus })
  @IsOptional()
  @IsEnum(CompensationChangeStatus)
  status?: CompensationChangeStatus;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ example: '2027-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ example: { taxableBasis: 'local-policy' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateEmployeeCompensationChangeDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  termId?: string;

  @ApiPropertyOptional({ enum: CompensationChangeStatus })
  @IsOptional()
  @IsEnum(CompensationChangeStatus)
  status?: CompensationChangeStatus;

  @ApiPropertyOptional({ example: '2026-07-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @ApiPropertyOptional({ example: 'Annual compensation review' })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  reason?: string;

  @ApiPropertyOptional({ example: { baseAmount: '92000.00', currencyCode: 'USD' } })
  @IsOptional()
  @IsObject()
  proposedState?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  workflowRequestId?: string;

  @ApiPropertyOptional({ example: { reviewCycle: '2026-midyear' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateEmployeeReportingRelationshipDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  relatedEmployeeId?: string;

  @ApiPropertyOptional({ enum: ReportingRelationshipType })
  @IsOptional()
  @IsEnum(ReportingRelationshipType)
  type?: ReportingRelationshipType;

  @ApiPropertyOptional({ enum: ReportingRelationshipStatus })
  @IsOptional()
  @IsEnum(ReportingRelationshipStatus)
  status?: ReportingRelationshipStatus;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  organizationNodeId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  positionId?: string;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2027-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ example: 'Matrix reporting line for project delivery.' })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  reason?: string;

  @ApiPropertyOptional({ example: { scope: 'project' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateEmployeeReportingRelationshipDto extends CreateEmployeeReportingRelationshipDto {}
