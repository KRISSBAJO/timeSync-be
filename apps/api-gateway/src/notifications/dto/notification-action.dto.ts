import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class NotificationActionDto {
  @ApiPropertyOptional({ example: 'Handled from notification center.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ example: { source: 'notification-center' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
