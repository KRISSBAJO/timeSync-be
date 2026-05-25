import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FormAssignmentStatus, FormStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListFormsQueryDto {
  @ApiPropertyOptional({ enum: FormStatus })
  @IsOptional()
  @IsEnum(FormStatus)
  status?: FormStatus;

  @ApiPropertyOptional({ example: 'onboarding' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 'uuid-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ListFormResponsesQueryDto {
  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 'uuid-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ListMyFormAssignmentsQueryDto {
  @ApiPropertyOptional({ enum: FormAssignmentStatus })
  @IsOptional()
  @IsEnum(FormAssignmentStatus)
  status?: FormAssignmentStatus;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  openOnly?: boolean;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
