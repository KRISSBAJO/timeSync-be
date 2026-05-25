import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HrArticleAuthorType, HrArticleStatus, HrArticleVisibility } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateHrArticleDto {
  @ApiProperty({ example: 'Assignment-based workforce modeling' })
  @IsString()
  @MinLength(4)
  @MaxLength(180)
  title!: string;

  @ApiPropertyOptional({ example: 'A practical guide to preserving workforce history.' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  subtitle?: string;

  @ApiPropertyOptional({ example: 'assignment-based-workforce-modeling' })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @ApiProperty({ example: 'Learn how effective-dated assignments keep workforce reporting reliable.' })
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  excerpt!: string;

  @ApiProperty({ example: 'Long-form article body in Markdown-like plain text.' })
  @IsString()
  @MinLength(80)
  @MaxLength(40000)
  body!: string;

  @ApiPropertyOptional({ example: 'workforce-architecture' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  categorySlug?: string;

  @ApiPropertyOptional({ example: 'https://example.com/article-hero.png' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  heroImageUrl?: string;

  @ApiPropertyOptional({ example: ['assignments', 'hr operations'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 6, default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  readingMinutes?: number;

  @ApiPropertyOptional({ enum: HrArticleStatus })
  @IsOptional()
  @IsEnum(HrArticleStatus)
  status?: HrArticleStatus;

  @ApiPropertyOptional({ enum: HrArticleVisibility })
  @IsOptional()
  @IsEnum(HrArticleVisibility)
  visibility?: HrArticleVisibility;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({ enum: HrArticleAuthorType })
  @IsOptional()
  @IsEnum(HrArticleAuthorType)
  authorType?: HrArticleAuthorType;

  @ApiPropertyOptional({ example: 'TimeSync Platform Team' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  authorName?: string;

  @ApiPropertyOptional({ example: 'WorkforceOS Research' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  authorTitle?: string;

  @ApiPropertyOptional({ example: '/images/logo.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  authorAvatarUrl?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  authorUserId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  authorPersonId?: string;

  @ApiPropertyOptional({ example: 'Assignment-based HR systems | TimeSync' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  seoTitle?: string;

  @ApiPropertyOptional({ example: 'Learn how enterprise HR systems preserve workforce history.' })
  @IsOptional()
  @IsString()
  @MaxLength(260)
  seoDescription?: string;

  @ApiPropertyOptional({ example: { series: 'HR Guides' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
