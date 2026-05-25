import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateDocumentVersionDto {
  @ApiProperty({ example: 'work-permit-ada-lovelace.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(260)
  fileName!: string;

  @ApiProperty({ example: 'https://storage.example.com/documents/work-permit-ada-lovelace.pdf' })
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  fileUrl!: string;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  mimeType?: string;

  @ApiPropertyOptional({ example: 245760 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5_000_000_000)
  sizeBytes?: number;

  @ApiPropertyOptional({ example: 'sha256:abc123' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  checksum?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  setCurrent?: boolean;

  @ApiPropertyOptional({ example: { storageProvider: 's3' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
