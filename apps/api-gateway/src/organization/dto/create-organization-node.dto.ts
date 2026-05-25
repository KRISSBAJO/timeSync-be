import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationNodeType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOrganizationNodeDto {
  @ApiPropertyOptional({ example: '5f5dc899-b4e3-408f-a2a8-4200198159f5' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @ApiProperty({ enum: OrganizationNodeType, example: OrganizationNodeType.DEPARTMENT })
  @IsEnum(OrganizationNodeType)
  type!: OrganizationNodeType;

  @ApiProperty({ example: 'HR-DEPT' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Human Resources' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'Owns HR operations and workforce governance.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'f5aa756d-f99f-4c22-8da8-0976e2c02007' })
  @IsOptional()
  @IsUUID('4')
  countryId?: string;

  @ApiPropertyOptional({ example: 'f5aa756d-f99f-4c22-8da8-0976e2c02007' })
  @IsOptional()
  @IsUUID('4')
  stateId?: string;

  @ApiPropertyOptional({ example: 'f5aa756d-f99f-4c22-8da8-0976e2c02007' })
  @IsOptional()
  @IsUUID('4')
  cityId?: string;

  @ApiPropertyOptional({ example: { line1: '100 Main Street', postalCode: '60601' } })
  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: { externalId: 'dept_001' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

