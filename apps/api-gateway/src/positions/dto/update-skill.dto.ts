import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateSkillDto {
  @ApiPropertyOptional({ example: 'Workforce Architecture' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: 'Functional' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string | null;
}
