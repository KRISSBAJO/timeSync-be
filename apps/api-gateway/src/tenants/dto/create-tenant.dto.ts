import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Health' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'Acme Health Incorporated' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiProperty({ example: 'acme-health' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty({ example: 'acme' })
  @IsString()
  @MinLength(2)
  @MaxLength(63)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  subdomain!: string;

  @ApiPropertyOptional({ example: 'hr.acme.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customDomain?: string;

  @ApiPropertyOptional({ enum: TenantStatus, default: TenantStatus.TRIAL })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({ example: 'Healthcare' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @ApiPropertyOptional({ example: '201-500' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sizeBand?: string;

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  website?: string;

  @ApiPropertyOptional({ example: 'support@acme.com' })
  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @ApiPropertyOptional({ example: '+15551234567' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  supportPhone?: string;

  @ApiPropertyOptional({ example: 'c8110d9c-4df4-4637-91c5-97ba9f8b8879' })
  @IsOptional()
  @IsUUID('4')
  countryId?: string;

  @ApiPropertyOptional({ example: 'c8110d9c-4df4-4637-91c5-97ba9f8b8879' })
  @IsOptional()
  @IsUUID('4')
  currencyId?: string;

  @ApiProperty({ example: 'tenant.admin@acme.com' })
  @IsEmail()
  adminEmail!: string;

  @ApiPropertyOptional({ example: 'TenantAdmin123!' })
  @IsOptional()
  @IsString()
  @MinLength(12)
  adminPassword?: string;

  @ApiPropertyOptional({ example: 'ENTERPRISE_TRIAL' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  planCode?: string;

  @ApiPropertyOptional({ example: 'Enterprise Trial' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  planName?: string;

  @ApiPropertyOptional({ example: 'TRIAL' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  subscriptionStatus?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  userLimit?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  employeeLimit?: number;

  @ApiPropertyOptional({ example: 10240 })
  @IsOptional()
  @IsInt()
  @Min(1)
  storageLimitMb?: number;
}
