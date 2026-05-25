import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AssignFormDto {
  @ApiPropertyOptional({ type: [String], example: ['fbe772b8-6fd8-4192-a168-20bdf45f0081'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  employeeIds?: string[];

  @ApiPropertyOptional({ type: [String], example: ['fbe772b8-6fd8-4192-a168-20bdf45f0081'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  userIds?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allActiveEmployees?: boolean;

  @ApiPropertyOptional({ example: '2026-06-01T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  notifyRecipients?: boolean;

  @ApiPropertyOptional({ example: 'Please complete this form before Friday.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({ example: { audience: 'new hires' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
