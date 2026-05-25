import { ApiPropertyOptional } from '@nestjs/swagger';
import { WorkflowStatus } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateWorkflowDto {
  @ApiPropertyOptional({ example: 'EMPLOYEE_TRANSFER_V2' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code?: string;

  @ApiPropertyOptional({ example: 'Employee Transfer Approval V2' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated transfer approval policy.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ example: 'employees' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  module?: string;

  @ApiPropertyOptional({ enum: WorkflowStatus })
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @ApiPropertyOptional({ example: 'employee.transfer.requested', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  triggerKey?: string | null;

  @ApiPropertyOptional({ example: { employmentTypes: ['FULL_TIME'] }, nullable: true })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: { version: 2 }, nullable: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
