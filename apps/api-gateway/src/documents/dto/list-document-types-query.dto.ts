import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListDocumentTypesQueryDto {
  @ApiPropertyOptional({ example: 'permit' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Include global platform document types alongside tenant-owned types.',
  })
  @IsOptional()
  @IsBoolean()
  includeGlobal?: boolean = true;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  requiresExpiry?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  requiresVerification?: boolean;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ example: 'document-type-id-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
