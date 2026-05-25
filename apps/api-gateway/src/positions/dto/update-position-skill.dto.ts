import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePositionSkillDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ example: 'INTERMEDIATE', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  minimumProficiency?: string | null;
}
