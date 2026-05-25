import { ApiProperty } from '@nestjs/swagger';
import { DemoRequestStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateDemoRequestStatusDto {
  @ApiProperty({ enum: DemoRequestStatus, example: DemoRequestStatus.CONTACTED })
  @IsEnum(DemoRequestStatus)
  status!: DemoRequestStatus;
}
