import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentVerificationStatus, DocumentVisibility } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateDocumentDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081', nullable: true })
  @IsOptional()
  @IsUUID('4')
  employeeId?: string | null;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081', nullable: true })
  @IsOptional()
  @IsUUID('4')
  documentTypeId?: string | null;

  @ApiPropertyOptional({ example: 'WORK_PERMIT', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentTypeCode?: string | null;

  @ApiPropertyOptional({ example: 'Ada Lovelace Updated Work Permit' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  title?: string;

  @ApiPropertyOptional({ example: 'Updated after renewal.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ enum: DocumentVisibility })
  @IsOptional()
  @IsEnum(DocumentVisibility)
  visibility?: DocumentVisibility;

  @ApiPropertyOptional({ enum: DocumentVerificationStatus })
  @IsOptional()
  @IsEnum(DocumentVerificationStatus)
  verificationStatus?: DocumentVerificationStatus;

  @ApiPropertyOptional({ example: '2029-06-01T00:00:00.000Z', nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional({ example: { country: 'US', renewal: true } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
