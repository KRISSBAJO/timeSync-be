import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePersonLanguageDto {
  @ApiPropertyOptional({ example: 'FLUENT' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  proficiency?: string;
}

