import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({ example: 'America/Chicago' })
  @IsOptional()
  @IsString()
  defaultTimezone?: string;

  @ApiPropertyOptional({ example: 'en-US' })
  @IsOptional()
  @IsString()
  defaultLocale?: string;

  @ApiPropertyOptional({ example: 'MM/dd/yyyy' })
  @IsOptional()
  @IsString()
  dateFormat?: string;

  @ApiPropertyOptional({ example: 'HH:mm' })
  @IsOptional()
  @IsString()
  timeFormat?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @ApiPropertyOptional({ example: 'ACME-' })
  @IsOptional()
  @IsString()
  employeeNumberPrefix?: string;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  employeeNumberNextSeq?: number;

  @ApiPropertyOptional({ example: { minLength: 12, requireMfaForAdmins: true } })
  @IsOptional()
  @IsObject()
  passwordPolicy?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { accessMinutes: 15, refreshDays: 30 } })
  @IsOptional()
  @IsObject()
  sessionPolicy?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { requireWorkflowForTransfers: true } })
  @IsOptional()
  @IsObject()
  approvalPolicy?: Record<string, unknown>;
}

