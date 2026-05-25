import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleScope } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'HR_ADMIN' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'HR Admin' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Can manage core HR operations.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: RoleScope, default: RoleScope.TENANT })
  @IsOptional()
  @IsEnum(RoleScope)
  scope?: RoleScope;
}

