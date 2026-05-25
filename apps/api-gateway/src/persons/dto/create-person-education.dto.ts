import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePersonEducationDto {
  @ApiProperty({ example: 'University of Lagos' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  institution!: string;

  @ApiPropertyOptional({ example: 'BSc' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  degree?: string;

  @ApiPropertyOptional({ example: 'Computer Science' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  fieldOfStudy?: string;

  @ApiPropertyOptional({ example: '2015-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2019-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: { honors: 'First class' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

