import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationNodeType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListOrganizationNodesQueryDto {
  @ApiPropertyOptional({ enum: OrganizationNodeType })
  @IsOptional()
  @IsEnum(OrganizationNodeType)
  type?: OrganizationNodeType;

  @ApiPropertyOptional({ example: 'f5aa756d-f99f-4c22-8da8-0976e2c02007' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({ example: 'Human' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ example: 'node-id-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

