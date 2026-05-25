import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdatePersonSkillDto {
  @ApiPropertyOptional({ example: 'ADVANCED' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  proficiency?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(80)
  years?: number;
}

