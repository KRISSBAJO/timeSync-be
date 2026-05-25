import { Type } from 'class-transformer';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';

import { CreateFormDto } from './create-form.dto';
import { UpsertFormQuestionDto } from './form-question.dto';

export class UpdateFormDto extends PartialType(CreateFormDto) {
  @ApiPropertyOptional({ type: [UpsertFormQuestionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UpsertFormQuestionDto)
  questions?: UpsertFormQuestionDto[];
}
