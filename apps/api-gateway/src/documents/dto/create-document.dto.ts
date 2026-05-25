import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateNested,
} from 'class-validator';

import { CreateDocumentVersionDto } from './create-document-version.dto';

export class CreateDocumentDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  documentTypeId?: string;

  @ApiPropertyOptional({ example: 'WORK_PERMIT' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentTypeCode?: string;

  @ApiProperty({ example: 'Ada Lovelace Work Permit' })
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  title!: string;

  @ApiPropertyOptional({ example: 'Uploaded during onboarding.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: DocumentVisibility, default: DocumentVisibility.HR_ONLY })
  @IsOptional()
  @IsEnum(DocumentVisibility)
  visibility?: DocumentVisibility;

  @ApiPropertyOptional({ enum: DocumentVerificationStatus })
  @IsOptional()
  @IsEnum(DocumentVerificationStatus)
  verificationStatus?: DocumentVerificationStatus;

  @ApiPropertyOptional({ example: '2028-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ type: CreateDocumentVersionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateDocumentVersionDto)
  initialVersion?: CreateDocumentVersionDto;

  @ApiPropertyOptional({ example: { country: 'US', source: 'onboarding' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
