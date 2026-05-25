import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FormStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { UpsertFormQuestionDto } from './form-question.dto';

export class CreateFormDto {
  @ApiPropertyOptional({ example: 'ONBOARDING_WEEK_ONE' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code?: string;

  @ApiProperty({ example: 'Week one onboarding check-in' })
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  title!: string;

  @ApiPropertyOptional({ example: 'Collect early onboarding feedback from new hires.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: FormStatus, default: FormStatus.DRAFT })
  @IsOptional()
  @IsEnum(FormStatus)
  status?: FormStatus;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowMultipleResponses?: boolean;

  @ApiPropertyOptional({ example: '2026-06-01T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  closesAt?: string;

  @ApiPropertyOptional({ example: { businessProcess: 'onboarding' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiProperty({ type: [UpsertFormQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UpsertFormQuestionDto)
  questions!: UpsertFormQuestionDto[];
}
