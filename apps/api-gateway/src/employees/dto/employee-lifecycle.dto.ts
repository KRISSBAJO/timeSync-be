import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class EmployeeLifecycleDto {
  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @ApiPropertyOptional({ example: 'Approved workforce lifecycle change.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({ example: 'Approved by HR operations.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ example: { workflowRequestId: 'optional-reference' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class HireEmployeeDto extends EmployeeLifecycleDto {
  @ApiPropertyOptional({
    enum: EmployeeStatus,
    description: 'Allowed values for hire are ACTIVE or PROBATION.',
    default: EmployeeStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class ReinstateEmployeeDto extends EmployeeLifecycleDto {
  @ApiPropertyOptional({
    enum: EmployeeStatus,
    description: 'Allowed values for reinstatement are ACTIVE or PROBATION.',
    default: EmployeeStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class RehireEmployeeDto extends EmployeeLifecycleDto {
  @ApiPropertyOptional({
    enum: EmployeeStatus,
    description: 'Allowed values for rehire are PREBOARDING, ACTIVE, or PROBATION.',
    default: EmployeeStatus.PREBOARDING,
  })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

export class SeparateEmployeeDto extends EmployeeLifecycleDto {
  @ApiPropertyOptional({ example: 'Voluntary resignation.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  separationReason?: string;
}
