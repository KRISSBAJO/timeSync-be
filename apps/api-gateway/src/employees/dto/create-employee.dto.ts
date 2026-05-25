import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeStatus, EmploymentType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsUUID('4')
  personId!: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({
    example: 'EMP000001',
    description: 'Optional manual employee number. Omit to use the tenant sequence.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9_.-]+$/)
  employeeNumber?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus, default: EmployeeStatus.PREBOARDING })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiProperty({ enum: EmploymentType })
  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  confirmationDate?: string;

  @ApiPropertyOptional({ example: '2027-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'Contract completed.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  separationReason?: string;

  @ApiPropertyOptional({ example: 'manual-import' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @ApiPropertyOptional({ example: { externalId: 'hris_001' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
