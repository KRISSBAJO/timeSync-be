import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SubmitApprovalRequestDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  workflowId?: string;

  @ApiPropertyOptional({ example: 'EMPLOYEE_TRANSFER' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workflowCode?: string;

  @ApiProperty({ example: 'employees' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  module!: string;

  @ApiPropertyOptional({ example: 'employee.transfer.requested' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  triggerKey?: string;

  @ApiProperty({ example: 'Employee' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  entityType!: string;

  @ApiProperty({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  entityId!: string;

  @ApiProperty({ example: 'Transfer Ada Lovelace to HR Operations' })
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  title!: string;

  @ApiPropertyOptional({ example: 'Requested by workforce planning.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: { proposedState: { organizationNodeId: 'node-id' } } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { source: 'employee-transfer-form' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Create an approved request when no active workflow is found.',
  })
  @IsOptional()
  @IsBoolean()
  allowAutoApprovalWithoutWorkflow?: boolean;
}
