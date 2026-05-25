import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateNotificationRecipientDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @ApiPropertyOptional({ example: 'employee@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  destination?: string;

  @ApiPropertyOptional({ example: { name: 'Ada Lovelace', title: 'Transfer Request' } })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}

export class CreateNotificationDto {
  @ApiProperty({ enum: NotificationChannel, example: NotificationChannel.IN_APP })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiPropertyOptional({ example: 'workflow' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  module?: string;

  @ApiPropertyOptional({ example: 'WORKFLOW_APPROVAL_REQUESTED' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  templateCode?: string;

  @ApiPropertyOptional({ example: 'Approval requested' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title?: string;

  @ApiPropertyOptional({ example: 'A transfer request needs your review.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body?: string;

  @ApiPropertyOptional({ example: 'Approval requested: Transfer request' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  subject?: string;

  @ApiPropertyOptional({ example: '2026-05-17T14:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  deliverNow?: boolean;

  @ApiPropertyOptional({ example: { title: 'Transfer request', entityType: 'WorkforceAction' } })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiProperty({ type: [CreateNotificationRecipientDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateNotificationRecipientDto)
  recipients!: CreateNotificationRecipientDto[];
}
