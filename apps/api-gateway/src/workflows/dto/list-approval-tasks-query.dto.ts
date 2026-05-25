import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalRequestStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListApprovalTasksQueryDto {
  @ApiPropertyOptional({ enum: ApprovalRequestStatus, default: ApprovalRequestStatus.PENDING })
  @IsOptional()
  @IsEnum(ApprovalRequestStatus)
  status?: ApprovalRequestStatus = ApprovalRequestStatus.PENDING;

  @ApiPropertyOptional({ example: 'employees' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  assignedToMe?: boolean = true;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  currentOnly?: boolean = true;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ example: 'approval-step-id-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
