import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDemoRequestDto {
  @ApiProperty({ example: 'Jordan Ellis' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: 'jordan@acmehealth.com' })
  @IsEmail()
  @MaxLength(180)
  workEmail!: string;

  @ApiProperty({ example: 'Acme Health Group' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  companyName!: string;

  @ApiPropertyOptional({ example: 'VP People Operations' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional({ example: '+15551234567' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ example: '201-500' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  companySize?: string;

  @ApiPropertyOptional({ example: 'Healthcare' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @ApiPropertyOptional({ example: 'United States' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @ApiPropertyOptional({
    example: 'We need multi-tenant HR, employee scheduling, documents, and approvals.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiPropertyOptional({ example: 'landing-page' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @ApiPropertyOptional({ example: 'https://acmehealth.com' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  website?: string;

  @ApiPropertyOptional({ example: { campaign: 'homepage-hero' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
