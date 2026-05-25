import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSkillDto {
  @ApiProperty({ example: 'Workforce Planning' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'Functional' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;
}
