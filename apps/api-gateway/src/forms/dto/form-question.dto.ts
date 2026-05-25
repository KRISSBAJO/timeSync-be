import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FormQuestionType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class FormQuestionOptionDto {
  @ApiProperty({ example: 'A' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  value!: string;

  @ApiProperty({ example: 'Agree' })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  label!: string;
}

export class UpsertFormQuestionDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  order?: number;

  @ApiProperty({ enum: FormQuestionType, example: FormQuestionType.SINGLE_CHOICE })
  @IsEnum(FormQuestionType)
  type!: FormQuestionType;

  @ApiProperty({ example: 'How satisfied are you with onboarding?' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  title!: string;

  @ApiPropertyOptional({ example: 'Choose the best answer.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ type: [FormQuestionOptionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FormQuestionOptionDto)
  options?: FormQuestionOptionDto[];

  @ApiPropertyOptional({ example: { min: 1, max: 5 } })
  @IsOptional()
  @IsObject()
  validation?: Record<string, unknown>;
}
