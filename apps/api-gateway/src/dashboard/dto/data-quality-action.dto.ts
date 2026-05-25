import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum DataQualityActionType {
  MARK_REVIEWED = 'MARK_REVIEWED',
  NOTIFY_STEWARDS = 'NOTIFY_STEWARDS',
}

export class DataQualityActionDto {
  @ApiProperty({ enum: DataQualityActionType, example: DataQualityActionType.MARK_REVIEWED })
  @IsEnum(DataQualityActionType)
  action!: DataQualityActionType;

  @ApiProperty({ example: 'employee-primary-fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsString()
  @MaxLength(240)
  issueId!: string;

  @ApiPropertyOptional({ example: 'high' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  severity?: string;

  @ApiProperty({ example: 'Employee has no primary assignment' })
  @IsString()
  @MaxLength(240)
  title!: string;

  @ApiPropertyOptional({ example: 'Employee needs a current primary placement.' })
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  description?: string;

  @ApiProperty({ example: 'Employee' })
  @IsString()
  @MaxLength(120)
  entityType!: string;

  @ApiProperty({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsUUID('4')
  entityId!: string;

  @ApiPropertyOptional({ example: '/workforce?employee=fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  href?: string;

  @ApiPropertyOptional({ example: 'Reviewed during weekly HR data quality sweep.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
