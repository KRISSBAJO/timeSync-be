import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListSkillsQueryDto {
  @ApiPropertyOptional({ example: 'planning' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'Functional' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Include platform/global skills alongside tenant-owned skills.',
  })
  @IsOptional()
  @IsBoolean()
  includeGlobal?: boolean = true;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 100;

  @ApiPropertyOptional({ example: 'skill-id-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
