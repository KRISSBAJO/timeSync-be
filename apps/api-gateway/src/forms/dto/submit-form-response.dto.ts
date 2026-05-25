import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class FormAnswerDto {
  @ApiProperty({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsUUID('4')
  questionId!: string;

  @ApiProperty({ example: 'YES' })
  @Allow()
  value!: unknown;
}

export class SubmitFormResponseDto {
  @ApiProperty({ type: [FormAnswerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FormAnswerDto)
  answers!: FormAnswerDto[];

  @ApiPropertyOptional({ example: { device: 'web' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
