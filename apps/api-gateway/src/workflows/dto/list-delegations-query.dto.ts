import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListDelegationsQueryDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  fromUserId?: string;

  @ApiPropertyOptional({ example: 'a71f41b9-3acb-4a28-b7a8-7b737d7c202d' })
  @IsOptional()
  @IsUUID('4')
  toUserId?: string;

  @ApiPropertyOptional({ example: 'employees' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  activeNow?: boolean;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ example: 'delegation-id-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
