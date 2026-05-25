import { ApiPropertyOptional } from '@nestjs/swagger';
import { HrArticleReactionType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class HrArticleReactionDto {
  @ApiPropertyOptional({ enum: HrArticleReactionType, default: HrArticleReactionType.LIKE })
  @IsOptional()
  @IsEnum(HrArticleReactionType)
  type?: HrArticleReactionType;
}
