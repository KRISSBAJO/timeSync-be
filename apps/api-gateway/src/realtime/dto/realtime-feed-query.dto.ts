import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RealtimeFeedQueryDto {
  @ApiPropertyOptional({ example: 12, default: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number = 8;

  @ApiPropertyOptional({ example: '2026-05-17T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  since?: string;
}
