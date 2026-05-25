import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class NotificationPreferenceInputDto {
  @ApiProperty({ enum: NotificationChannel, example: NotificationChannel.EMAIL })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty({ example: 'workflows' })
  @IsString()
  @MaxLength(120)
  module!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({
    example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081',
    description: 'Only notification writers may update preferences for another user.',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiProperty({ type: [NotificationPreferenceInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceInputDto)
  preferences!: NotificationPreferenceInputDto[];
}

export class ListNotificationPreferencesQueryDto {
  @ApiPropertyOptional({
    example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081',
    description: 'Only notification writers may inspect preferences for another user.',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ example: 'workflows' })
  @IsOptional()
  @IsString()
  module?: string;
}
