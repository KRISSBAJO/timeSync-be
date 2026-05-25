import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePersonLanguageDto {
  @ApiProperty({ example: 'en' })
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  languageCode!: string;

  @ApiPropertyOptional({ example: 'NATIVE' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  proficiency?: string;
}
