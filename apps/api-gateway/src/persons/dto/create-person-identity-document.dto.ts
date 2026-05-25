import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PersonDocumentType } from '@prisma/client';
import { IsDateString, IsEnum, IsObject, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreatePersonIdentityDocumentDto {
  @ApiProperty({ enum: PersonDocumentType })
  @IsEnum(PersonDocumentType)
  type!: PersonDocumentType;

  @ApiProperty({ example: 'A123456789' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  documentNumber!: string;

  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  issuingCountry?: string;

  @ApiPropertyOptional({ example: '2020-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional({ example: '2030-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/docs/passport.pdf' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  fileUrl?: string;

  @ApiPropertyOptional({ example: { verifiedBy: 'hr' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

