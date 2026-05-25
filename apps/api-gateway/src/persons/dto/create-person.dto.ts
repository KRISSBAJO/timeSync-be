import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, MaritalStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePersonDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @ApiPropertyOptional({ example: 'Lovelace' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  middleName?: string;

  @ApiProperty({ example: 'Byron' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName!: string;

  @ApiPropertyOptional({ example: 'Ada' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredName?: string;

  @ApiPropertyOptional({ example: '1990-01-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: MaritalStatus })
  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  nationalityId?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photos/person.png' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  photoUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/signatures/person.png' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  signatureUrl?: string;

  @ApiPropertyOptional({ example: 'O+' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloodGroup?: string;

  @ApiPropertyOptional({ example: 'None disclosed' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  disabilityStatus?: string;

  @ApiPropertyOptional({ example: 'Not applicable' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  veteranStatus?: string;

  @ApiPropertyOptional({ example: 'Senior HR operations leader.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  bio?: string;

  @ApiPropertyOptional({ example: { source: 'manual' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

