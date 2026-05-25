import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreatePersonCertificationDto {
  @ApiProperty({ example: 'SHRM-SCP' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'SHRM' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  issuer?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 'CERT-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  credentialId?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/cert.pdf' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  fileUrl?: string;
}

