import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePersonExperienceDto {
  @ApiProperty({ example: 'Acme Inc.' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  company!: string;

  @ApiPropertyOptional({ example: 'HR Manager' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ example: '2020-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'Led HR operations.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ example: { source: 'resume' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

