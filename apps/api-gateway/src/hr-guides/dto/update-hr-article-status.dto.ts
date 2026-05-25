import { ApiPropertyOptional } from '@nestjs/swagger';
import { HrArticleStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateHrArticleStatusDto {
  @ApiPropertyOptional({ enum: HrArticleStatus })
  @IsEnum(HrArticleStatus)
  status!: HrArticleStatus;

  @ApiPropertyOptional({ example: 'Ready for publishing.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
