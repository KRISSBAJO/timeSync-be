import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthTenantDto {
  @ApiProperty({ example: '1ab5ecf2-9f29-4470-af92-8829b37bf4de' })
  id!: string;

  @ApiProperty({ example: 'acme' })
  slug!: string;

  @ApiProperty({ example: 'Acme Health' })
  name!: string;
}

export class AuthIdentityDto {
  @ApiProperty({ example: 'f2c31af7-5fb0-4d27-9307-0c119c174a26' })
  id!: string;

  @ApiProperty({ example: 'jordan@acme.test' })
  email!: string;
}

export class AuthMembershipDto {
  @ApiProperty({ example: '1e65e617-1e74-4e6e-9211-57557864e651' })
  id!: string;

  @ApiProperty({ example: 'TENANT_USER' })
  type!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: false })
  isDefault!: boolean;

  @ApiPropertyOptional({ example: '1ab5ecf2-9f29-4470-af92-8829b37bf4de', nullable: true })
  tenantId!: string | null;
}

export class AuthWorkspaceDto {
  @ApiProperty({ example: '1e65e617-1e74-4e6e-9211-57557864e651' })
  membershipId!: string;

  @ApiPropertyOptional({ example: '1ab5ecf2-9f29-4470-af92-8829b37bf4de', nullable: true })
  tenantId!: string | null;

  @ApiProperty({ example: 'Acme Health Group' })
  displayName!: string;

  @ApiProperty({ example: 'acme-health' })
  slug!: string;

  @ApiProperty({ example: 'TENANT_USER' })
  type!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: true })
  isCurrent!: boolean;

  @ApiProperty({ example: false })
  isDefault!: boolean;
}

export class AuthUserDto {
  @ApiProperty({ example: 'e461520d-d5f8-4a6f-bc3b-c4b407eb7bdf' })
  id!: string;

  @ApiPropertyOptional({ example: 'f2c31af7-5fb0-4d27-9307-0c119c174a26' })
  identityId!: string | null;

  @ApiPropertyOptional({ example: '1e65e617-1e74-4e6e-9211-57557864e651' })
  membershipId!: string | null;

  @ApiProperty({ example: 'admin@timesync.local' })
  email!: string;

  @ApiPropertyOptional({ example: 'admin' })
  username!: string | null;

  @ApiPropertyOptional({ example: null })
  tenantId!: string | null;

  @ApiProperty({ example: 'PLATFORM_ADMIN' })
  type!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: ['SUPER_ADMIN'] })
  roles!: string[];

  @ApiProperty({ example: ['employees.read', 'iam.roles.write'] })
  permissions!: string[];
}

export class AuthResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ type: AuthIdentityDto })
  identity!: AuthIdentityDto;

  @ApiProperty({ type: AuthMembershipDto })
  membership!: AuthMembershipDto;

  @ApiPropertyOptional({ type: AuthTenantDto, nullable: true })
  tenant!: AuthTenantDto | null;

  @ApiProperty({ type: AuthWorkspaceDto, isArray: true })
  workspaces!: AuthWorkspaceDto[];

  @ApiProperty({
    example: '2026-05-16T15:15:00.000Z',
    description: 'Access session expiry.',
  })
  expiresAt!: string;

  @ApiProperty({
    example: '1lKUhP8tQm7e2iZL9ZfnbQ',
    description: 'Also written to the readable csrf_token cookie.',
  })
  csrfToken!: string;
}
