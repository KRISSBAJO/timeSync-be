import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDelegationDto {
  @ApiProperty({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsUUID('4')
  fromUserId!: string;

  @ApiProperty({ example: 'a71f41b9-3acb-4a28-b7a8-7b737d7c202d' })
  @IsUUID('4')
  toUserId!: string;

  @ApiPropertyOptional({ example: 'employees' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  module?: string;

  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ example: '2026-06-15T00:00:00.000Z' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'Out of office coverage.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
