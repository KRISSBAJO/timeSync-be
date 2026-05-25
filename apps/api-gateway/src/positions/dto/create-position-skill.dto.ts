import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreatePositionSkillDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  skillId?: string;

  @ApiPropertyOptional({ example: 'Workforce Planning' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  skillName?: string;

  @ApiPropertyOptional({ example: 'Functional' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ example: 'ADVANCED' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  minimumProficiency?: string;
}
