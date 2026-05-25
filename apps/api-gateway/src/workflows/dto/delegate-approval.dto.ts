import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class DelegateApprovalDto {
  @ApiProperty({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsUUID('4')
  toUserId!: string;

  @ApiPropertyOptional({ example: 'Delegating while out of office.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ example: { reasonCode: 'OOO' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
