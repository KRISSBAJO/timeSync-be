import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({ example: '83e9880c-756c-4326-9d1a-4bcf61b5f885' })
  id!: string;

  @ApiPropertyOptional({ example: 'Chrome on Windows' })
  deviceName!: string | null;

  @ApiPropertyOptional({ example: '127.0.0.1' })
  ipAddress!: string | null;

  @ApiPropertyOptional({ example: 'Mozilla/5.0...' })
  userAgent!: string | null;

  @ApiProperty({ example: '2026-05-16T15:15:00.000Z' })
  expiresAt!: string;

  @ApiPropertyOptional({ example: null })
  revokedAt!: string | null;

  @ApiProperty({ example: true })
  isCurrent!: boolean;

  @ApiProperty({ example: '2026-05-16T15:00:00.000Z' })
  createdAt!: string;
}
