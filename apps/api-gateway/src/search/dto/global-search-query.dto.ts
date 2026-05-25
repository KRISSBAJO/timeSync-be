import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GlobalSearchQueryDto {
  @ApiPropertyOptional({ example: 'Ada payroll permit' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 'employees,positions,documents' })
  @IsOptional()
  @IsString()
  types?: string;

  @ApiPropertyOptional({ example: 8, default: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 6;
}
