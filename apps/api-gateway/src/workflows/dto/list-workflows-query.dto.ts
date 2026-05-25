import { ApiPropertyOptional } from '@nestjs/swagger';
import { WorkflowStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListWorkflowsQueryDto {
  @ApiPropertyOptional({ enum: WorkflowStatus })
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @ApiPropertyOptional({ example: 'employees' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({ example: 'employee.transfer.requested' })
  @IsOptional()
  @IsString()
  triggerKey?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({ example: 'transfer' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ example: 'workflow-id-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
