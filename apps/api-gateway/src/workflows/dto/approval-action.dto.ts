import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApprovalActionDto {
  @ApiPropertyOptional({ example: 'Looks good to proceed.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ example: { source: 'approval-console' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
