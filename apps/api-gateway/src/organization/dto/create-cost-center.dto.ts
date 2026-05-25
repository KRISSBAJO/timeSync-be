import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCostCenterDto {
  @ApiPropertyOptional({ example: 'f5aa756d-f99f-4c22-8da8-0976e2c02007' })
  @IsOptional()
  @IsUUID('4')
  organizationNodeId?: string;

  @ApiProperty({ example: 'HR-001' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'HR Operations Cost Center' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'Tracks HR operations spending.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: { externalId: 'cc_001' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

