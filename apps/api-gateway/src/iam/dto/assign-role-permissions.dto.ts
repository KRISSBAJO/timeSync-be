import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignRolePermissionsDto {
  @ApiPropertyOptional({
    example: ['employees.read', 'employees.write'],
    description: 'Permission codes to attach to the role.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionCodes?: string[];

  @ApiPropertyOptional({
    example: ['06a8247a-532d-49a0-84b9-379223a16308'],
    description: 'Permission IDs to attach to the role.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}

