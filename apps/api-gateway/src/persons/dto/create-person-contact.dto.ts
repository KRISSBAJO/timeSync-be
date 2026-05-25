import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePersonContactDto {
  @ApiProperty({ example: 'EMAIL' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  type!: string;

  @ApiProperty({ example: 'ada@example.com' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  value!: string;

  @ApiPropertyOptional({ example: 'Work email' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ example: '2026-05-16T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  verifiedAt?: string;
}

