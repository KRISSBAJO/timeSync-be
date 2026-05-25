import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class UpdateTenantBrandingDto {
  @ApiPropertyOptional({ example: 'https://cdn.acme.com/logo.png' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.acme.com/favicon.ico' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  faviconUrl?: string;

  @ApiPropertyOptional({ example: '#0F766E' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#111827' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  secondaryColor?: string;

  @ApiPropertyOptional({ example: '#F59E0B' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  accentColor?: string;

  @ApiPropertyOptional({ example: 'Inter' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fontFamily?: string;

  @ApiPropertyOptional({ example: 'https://cdn.acme.com/email-header.png' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  emailHeaderUrl?: string;

  @ApiPropertyOptional({ example: ':root { --brand: #0F766E; }' })
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  customCss?: string;

  @ApiPropertyOptional({ example: { loginMessage: 'Welcome to Acme WorkforceOS' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

