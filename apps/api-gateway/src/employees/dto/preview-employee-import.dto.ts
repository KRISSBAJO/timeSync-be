import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PreviewEmployeeImportDto {
  @ApiProperty({
    description: 'CSV content with headers such as firstName,lastName,email,employeeNumber,employmentType,status,hireDate.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2_000_000)
  csv!: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = true;
}

export class CommitEmployeeImportDto extends PreviewEmployeeImportDto {
  @ApiPropertyOptional({ example: { batchName: 'May onboarding wave' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
