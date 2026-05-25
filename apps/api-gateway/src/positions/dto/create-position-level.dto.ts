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

export class CreatePositionLevelDto {
  @ApiProperty({ example: 'L4' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Lead' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  rank?: number;

  @ApiPropertyOptional({ example: 'Leads a functional area or workstream.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: { ladder: 'management' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
