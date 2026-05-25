import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { HrArticleStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListHrArticlesQueryDto {
  @ApiPropertyOptional({ example: 'workforce-architecture' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'skills' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ example: 'assignments' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ enum: HrArticleStatus })
  @IsOptional()
  @IsEnum(HrArticleStatus)
  status?: HrArticleStatus;

  @ApiPropertyOptional({ example: 12, default: 12, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ example: 0, default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
