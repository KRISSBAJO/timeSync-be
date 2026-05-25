import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartQaRunDto {
  @ApiProperty({ example: 'backend.smoke.recruitment' })
  @IsString()
  @IsNotEmpty()
  scriptId!: string;

  @ApiPropertyOptional({ example: 'Validate recruitment after permission repair.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

