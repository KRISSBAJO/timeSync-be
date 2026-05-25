import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleScope } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignUserRoleDto {
  @ApiProperty({ example: 'a71f41b9-3acb-4a28-b7a8-7b737d7c202d' })
  @IsUUID('4')
  roleId!: string;

  @ApiPropertyOptional({ enum: RoleScope, default: RoleScope.TENANT })
  @IsOptional()
  @IsEnum(RoleScope)
  scope?: RoleScope;

  @ApiPropertyOptional({
    example: 'org-node-id',
    description: 'Scope target ID for organization-node, department, team, or similar scopes.',
  })
  @IsOptional()
  @IsString()
  scopeId?: string;

  @ApiPropertyOptional({ example: '2026-05-16T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2027-05-16T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

