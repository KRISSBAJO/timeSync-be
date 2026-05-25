import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateHrArticleCommentDto {
  @ApiProperty({ example: 'Jordan Ellis' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @ApiPropertyOptional({ example: 'jordan@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @ApiProperty({ example: 'This guide helped us rethink transfer history.' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  body!: string;
}
