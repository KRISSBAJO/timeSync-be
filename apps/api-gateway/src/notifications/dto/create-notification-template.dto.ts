import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateNotificationTemplateDto {
  @ApiProperty({ example: 'WORKFLOW_APPROVAL_REQUESTED' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Workflow Approval Requested' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiProperty({ enum: NotificationChannel, example: NotificationChannel.IN_APP })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiPropertyOptional({ example: 'Approval requested: {{title}}' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  subject?: string;

  @ApiProperty({ example: '{{actorName}} submitted {{title}} and needs your review.' })
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body!: string;

  @ApiPropertyOptional({ example: { title: 'Approval title', actorName: 'Requester name' } })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
