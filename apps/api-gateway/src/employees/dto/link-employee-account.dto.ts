import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class LinkEmployeeAccountDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({ example: 'employee@acme-health.test' })
  @ValidateIf((dto: LinkEmployeeAccountDto) => !dto.userId)
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: 'acme-employee' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9_.-]+$/)
  username?: string;

  @ApiPropertyOptional({ example: 'EMPLOYEE' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleCode?: string;

  @ApiPropertyOptional({ example: 'ChangeMe123!' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(160)
  temporaryPassword?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  requirePasswordReset?: boolean;
}
