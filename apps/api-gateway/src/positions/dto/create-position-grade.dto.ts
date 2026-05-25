import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePositionGradeDto {
  @ApiProperty({ example: 'G07' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Senior Professional' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  rank?: number;

  @ApiPropertyOptional({ example: 'Senior individual contributor grade.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: { compensationBand: 'P4' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
