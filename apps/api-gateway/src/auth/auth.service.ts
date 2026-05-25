import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InvitationStatus, TenantFeatureStatus, UserStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '@timesync/database';

import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import type { AuthenticatedPrincipal } from './types/authenticated-request';

type RequestMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

type AuthUserWithAccess = Prisma.UserGetPayload<{
  include: {
    identity: true;
    membership: true;
    tenant: {
      include: {
        features: {
          include: {
            platformFeature: true;
          };
        };
      };
    };
    userRoles: {
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true;
              };
            };
          };
        };
      };
    };
  };
}>;

type AuthIdentityContext = NonNullable<AuthUserWithAccess['identity']>;
type AuthMembershipContext = NonNullable<AuthUserWithAccess['membership']>;

type AuthLoginContext = {
  user: AuthUserWithAccess;
  identity: AuthIdentityContext;
  membership: AuthMembershipContext;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async login(dto: LoginDto, metadata: RequestMetadata) {
    const context = await this.resolveLoginContext(dto.email, dto.tenantSlug);
    const { user, identity, membership } = context;
    const passwordHash = identity.passwordHash ?? user.passwordHash;

    if (!passwordHash) {
      await this.recordLogin(user.id, false, metadata, 'PASSWORD_LOGIN_NOT_AVAILABLE', identity.id);
      throw new UnauthorizedException('Invalid email or password.');
    }

    const lockedUntil = identity.lockedUntil ?? user.lockedUntil;
    if (lockedUntil && lockedUntil > new Date()) {
      await this.recordLogin(user.id, false, metadata, 'ACCOUNT_LOCKED', identity.id);
      throw new ForbiddenException('User account is temporarily locked.');
    }

    const passwordMatches = await this.passwordService.verify(passwordHash, dto.password);

    if (!passwordMatches) {
      await this.recordLogin(user.id, false, metadata, 'INVALID_PASSWORD', identity.id);
      throw new UnauthorizedException('Invalid email or password.');
    }

    this.assertIdentityCanAuthenticate(identity);
    this.assertMembershipCanAuthenticate(membership);
    this.assertUserCanAuthenticate(user);

    const issued = await this.prisma.$transaction(async (tx) => {
      const credentials = await this.issueCredentials(
        {
          userId: user.id,
          identityId: identity.id,
          tenantMembershipId: membership.id,
        },
        metadata,
        dto.rememberDevice ?? false,
        tx,
      );
      await this.recordLogin(user.id, true, metadata, undefined, identity.id, tx);

      return credentials;
    });

    return {
      ...issued,
      auth: await this.toAuthResponse(await this.getUserWithAccess(user.id), issued.access.expiresAt),
    };
  }

  async refresh(rawRefreshToken: string | undefined, metadata: RequestMetadata) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    const tokenHash = this.tokenService.hash(rawRefreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: this.userAccessInclude,
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (storedToken.revokedAt || storedToken.expiresAt <= new Date()) {
      await this.revokeAllIdentityCredentials(storedToken.identityId, storedToken.userId);
      throw new UnauthorizedException('Refresh token is expired or revoked.');
    }

    const context = await this.ensureUserIdentityContext(storedToken.user, storedToken.tenantMembershipId);
    this.assertIdentityCanAuthenticate(context.identity);
    this.assertMembershipCanAuthenticate(context.membership);
    this.assertUserCanAuthenticate(context.user);

    const issued = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      return this.issueCredentials(
        {
          userId: context.user.id,
          identityId: context.identity.id,
          tenantMembershipId: context.membership.id,
        },
        metadata,
        false,
        tx,
      );
    });

    return {
      ...issued,
      auth: await this.toAuthResponse(await this.getUserWithAccess(context.user.id), issued.access.expiresAt),
    };
  }

  async acceptInvitation(dto: AcceptInvitationDto) {
    const tokenHash = this.tokenService.hash(dto.token);
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: {
        tenant: true,
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Invitation is invalid or already used.');
    }

    if (invitation.expiresAt <= new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new BadRequestException('Invitation has expired.');
    }

    const metadata = this.asObject(invitation.metadata);
    const linkedUserId = typeof metadata.userId === 'string' ? metadata.userId : undefined;
    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.prisma.user.findFirst({
      where: {
        id: linkedUserId,
        tenantId: invitation.tenantId,
        email: invitation.email,
        deletedAt: null,
      },
      include: this.userAccessInclude,
    });

    if (!user) {
      throw new BadRequestException('Invitation user account is no longer available.');
    }

    await this.prisma.$transaction(async (tx) => {
      const identity = await tx.identity.upsert({
        where: { email: user.email.trim().toLowerCase() },
        create: {
          email: user.email.trim().toLowerCase(),
          passwordHash,
          status: UserStatus.ACTIVE,
          authProvider: user.authProvider,
          emailVerifiedAt: new Date(),
          metadata: {
            createdFromInvitationId: invitation.id,
            tenantId: invitation.tenantId,
          },
        },
        update: {
          passwordHash,
          status: UserStatus.ACTIVE,
          authProvider: user.authProvider,
          emailVerifiedAt: new Date(),
          deletedAt: null,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          identityId: identity.id,
          passwordHash,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          metadata: {
            ...this.asObject(user.metadata),
            invitationAcceptedAt: new Date().toISOString(),
          },
        },
      });

      await tx.tenantMembership.upsert({
        where: {
          userId: user.id,
        },
        create: {
          identityId: identity.id,
          tenantId: invitation.tenantId,
          userId: user.id,
          type: user.type,
          status: UserStatus.ACTIVE,
          isDefault: true,
          metadata: {
            createdFromInvitationId: invitation.id,
            purpose: typeof metadata.purpose === 'string' ? metadata.purpose : 'invitation',
          },
        },
        update: {
          identityId: identity.id,
          tenantId: invitation.tenantId,
          type: user.type,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      });

      for (const invitationRole of invitation.roles) {
        await tx.userRole.upsert({
          where: {
            userId_roleId_scope_scopeId: {
              userId: user.id,
              roleId: invitationRole.roleId,
              scope: invitationRole.role.scope,
              scopeId: '',
            },
          },
          create: {
            userId: user.id,
            roleId: invitationRole.roleId,
            scope: invitationRole.role.scope,
            scopeId: '',
          },
          update: {
            endsAt: null,
          },
        });
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedById: user.id,
          acceptedAt: new Date(),
        },
      });
    });

    return {
      accepted: true,
      email: user.email,
      tenantSlug: invitation.tenant.slug,
    };
  }

  async logout(rawAccessToken?: string, rawRefreshToken?: string) {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      if (rawAccessToken) {
        await tx.session.updateMany({
          where: {
            tokenHash: this.tokenService.hash(rawAccessToken),
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }

      if (rawRefreshToken) {
        await tx.refreshToken.updateMany({
          where: {
            tokenHash: this.tokenService.hash(rawRefreshToken),
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }
    });

    return { loggedOut: true };
  }

  async logoutAll(userId: string, identityId?: string | null) {
    await this.revokeAllIdentityCredentials(identityId, userId);
    return { loggedOut: true };
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      include: { device: true },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.device?.name ?? null,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null,
      isCurrent: session.id === currentSessionId,
      createdAt: session.createdAt.toISOString(),
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { revoked: true };
  }

  async revokeOtherSessions(userId: string, currentSessionId: string, rawCurrentRefreshToken?: string) {
    const now = new Date();
    const currentRefreshTokenHash = rawCurrentRefreshToken
      ? this.tokenService.hash(rawCurrentRefreshToken)
      : undefined;

    const { sessions, refreshTokens } = await this.prisma.$transaction(async (tx) => {
      const revokedSessions = await tx.session.updateMany({
        where: {
          userId,
          id: { not: currentSessionId },
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      const revokedRefreshTokens = currentRefreshTokenHash
        ? await tx.refreshToken.updateMany({
            where: {
              userId,
              revokedAt: null,
              tokenHash: { not: currentRefreshTokenHash },
            },
            data: {
              revokedAt: now,
            },
          })
        : { count: 0 };

      return {
        sessions: revokedSessions,
        refreshTokens: revokedRefreshTokens,
      };
    });

    return {
      revokedSessions: sessions.count,
      revokedRefreshTokens: refreshTokens.count,
    };
  }

  async listWorkspaces(user: AuthenticatedPrincipal) {
    if (!user.identityId) {
      const currentUser = await this.getUserWithAccess(user.id);
      const context = await this.ensureUserIdentityContext(currentUser, user.membershipId);
      return this.listWorkspaceOptions(context.identity.id, context.user.id);
    }

    return this.listWorkspaceOptions(user.identityId, user.id);
  }

  async switchWorkspace(
    actor: AuthenticatedPrincipal,
    membershipId: string,
    metadata: RequestMetadata,
    rawAccessToken?: string,
    rawRefreshToken?: string,
  ) {
    const currentUser = await this.getUserWithAccess(actor.id);
    const currentContext = await this.ensureUserIdentityContext(currentUser, actor.membershipId);

    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        id: membershipId,
        identityId: currentContext.identity.id,
        deletedAt: null,
      },
      include: {
        user: {
          include: this.userAccessInclude,
        },
      },
    });

    if (!membership?.user) {
      throw new ForbiddenException('Workspace membership is not available for this identity.');
    }

    const targetContext = await this.ensureUserIdentityContext(membership.user, membership.id);
    this.assertIdentityCanAuthenticate(targetContext.identity);
    this.assertMembershipCanAuthenticate(targetContext.membership);
    this.assertUserCanAuthenticate(targetContext.user);

    const issued = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      if (rawAccessToken) {
        await tx.session.updateMany({
          where: {
            tokenHash: this.tokenService.hash(rawAccessToken),
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }

      if (rawRefreshToken) {
        await tx.refreshToken.updateMany({
          where: {
            tokenHash: this.tokenService.hash(rawRefreshToken),
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }

      return this.issueCredentials(
        {
          userId: targetContext.user.id,
          identityId: targetContext.identity.id,
          tenantMembershipId: targetContext.membership.id,
        },
        metadata,
        true,
        tx,
      );
    });

    return {
      ...issued,
      auth: await this.toAuthResponse(await this.getUserWithAccess(targetContext.user.id), issued.access.expiresAt),
    };
  }

  async getMe(userId: string) {
    const user = await this.getUserWithAccess(userId);
    return this.toAuthResponse(user, new Date());
  }

  async validateAccessToken(rawAccessToken: string | undefined): Promise<AuthenticatedPrincipal> {
    if (!rawAccessToken) {
      throw new UnauthorizedException('Access token is required.');
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.tokenService.hash(rawAccessToken) },
      include: {
        user: {
          include: this.userAccessInclude,
        },
        tenantMembership: true,
        identity: true,
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Access token is expired or revoked.');
    }

    const context = await this.ensureUserIdentityContext(session.user, session.tenantMembershipId);
    this.assertIdentityCanAuthenticate(context.identity);
    this.assertMembershipCanAuthenticate(context.membership);
    this.assertUserCanAuthenticate(context.user);

    const access = this.buildAccess(context.user);

    return {
      id: context.user.id,
      identityId: context.identity.id,
      membershipId: context.membership.id,
      tenantId: context.user.tenantId,
      email: context.user.email,
      username: context.user.username,
      type: context.user.type,
      status: context.user.status,
      sessionId: session.id,
      roles: access.roles,
      permissions: access.permissions,
      enabledFeatures: context.user.tenant ? this.enabledTenantFeatures(context.user.tenant) : [],
    };
  }

  private async resolveLoginContext(email: string, tenantSlug?: string): Promise<AuthLoginContext> {
    const normalizedEmail = email.trim().toLowerCase();

    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlug.trim().toLowerCase() },
      });

      if (!tenant) {
        throw new UnauthorizedException('Invalid email or password.');
      }

      const tenantUser = await this.prisma.user.findFirst({
        where: {
          tenantId: tenant.id,
          email: normalizedEmail,
          deletedAt: null,
        },
        include: this.userAccessInclude,
      });

      if (!tenantUser) {
        throw new UnauthorizedException('Invalid email or password.');
      }

      return this.ensureUserIdentityContext(tenantUser);
    }

    const identity = await this.prisma.identity.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: {
            deletedAt: null,
            userId: { not: null },
          },
          include: {
            tenant: true,
            user: {
              include: this.userAccessInclude,
            },
          },
          orderBy: [
            { isDefault: 'desc' },
            { lastAccessedAt: 'desc' },
            { createdAt: 'asc' },
          ],
        },
      },
    });

    if (identity) {
      const preferredMembership = this.chooseDefaultMembership(identity.memberships);

      if (preferredMembership?.user) {
        return this.ensureUserIdentityContext(preferredMembership.user, preferredMembership.id);
      }
    }

    const users = await this.prisma.user.findMany({
      where: {
        email: normalizedEmail,
        deletedAt: null,
      },
      include: this.userAccessInclude,
      orderBy: [
        { tenantId: 'asc' },
        { lastLoginAt: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    const platformUser = users.find((user) => user.tenantId === null && user.type === 'PLATFORM_ADMIN');

    if (platformUser) {
      return this.ensureUserIdentityContext(platformUser);
    }

    const tenantUsers = users.filter((user) => user.tenantId !== null);

    if (tenantUsers.length === 1) {
      return this.ensureUserIdentityContext(tenantUsers[0]);
    }

    if (tenantUsers.length > 1) {
      throw new BadRequestException('Choose a tenant workspace to sign in.');
    }

    if (users.length === 0) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    throw new UnauthorizedException('Invalid email or password.');
  }

  private async issueCredentials(
    context: {
      userId: string;
      identityId: string;
      tenantMembershipId: string;
    },
    metadata: RequestMetadata,
    rememberDevice: boolean,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const access = this.tokenService.issueAccessToken();
    const refresh = this.tokenService.issueRefreshToken();
    const csrfToken = this.tokenService.issueCsrfToken();
    const now = new Date();

    const device = await tx.device.create({
      data: {
        userId: context.userId,
        identityId: context.identityId,
        name: this.inferDeviceName(metadata.userAgent),
        fingerprint: this.fingerprint(metadata),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        trustedAt: rememberDevice ? now : undefined,
        lastUsedAt: now,
      },
    });

    await tx.session.create({
      data: {
        userId: context.userId,
        identityId: context.identityId,
        tenantMembershipId: context.tenantMembershipId,
        tokenHash: access.hash,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceId: device.id,
        expiresAt: access.expiresAt,
      },
    });

    await tx.refreshToken.create({
      data: {
        userId: context.userId,
        identityId: context.identityId,
        tenantMembershipId: context.tenantMembershipId,
        tokenHash: refresh.hash,
        expiresAt: refresh.expiresAt,
      },
    });

    await tx.user.update({
      where: { id: context.userId },
      data: { lastLoginAt: now },
    });

    await tx.identity.update({
      where: { id: context.identityId },
      data: { lastLoginAt: now },
    });

    await tx.tenantMembership.update({
      where: { id: context.tenantMembershipId },
      data: { lastAccessedAt: now },
    });

    return { access, refresh, csrfToken };
  }

  private async recordLogin(
    userId: string,
    success: boolean,
    metadata: RequestMetadata,
    reason?: string,
    identityId?: string | null,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    await tx.loginHistory.create({
      data: {
        userId,
        identityId: identityId ?? undefined,
        success,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        reason,
      },
    });
  }

  private async revokeAllIdentityCredentials(identityId: string | null | undefined, fallbackUserId: string) {
    const now = new Date();
    const sessionWhere = identityId
      ? { identityId, revokedAt: null }
      : { userId: fallbackUserId, revokedAt: null };
    const refreshWhere = identityId
      ? { identityId, revokedAt: null }
      : { userId: fallbackUserId, revokedAt: null };

    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: sessionWhere,
        data: { revokedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: refreshWhere,
        data: { revokedAt: now },
      }),
    ]);
  }

  private async getUserWithAccess(userId: string): Promise<AuthUserWithAccess> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: this.userAccessInclude,
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    return user;
  }

  private async ensureUserIdentityContext(
    user: AuthUserWithAccess,
    preferredMembershipId?: string | null,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<AuthLoginContext> {
    const normalizedEmail = user.email.trim().toLowerCase();
    let identity = user.identity;

    if (!identity) {
      identity = await tx.identity.upsert({
        where: { email: normalizedEmail },
        create: {
          email: normalizedEmail,
          passwordHash: user.passwordHash,
          status: user.status,
          authProvider: user.authProvider,
          emailVerifiedAt: user.emailVerifiedAt,
          lastLoginAt: user.lastLoginAt,
          lockedUntil: user.lockedUntil,
          mfaEnabled: user.mfaEnabled,
          mfaSecret: user.mfaSecret,
          metadata: {
            createdFromUserId: user.id,
          },
          deletedAt: user.deletedAt,
        },
        update: {
          passwordHash: user.passwordHash ?? undefined,
          status: user.status === UserStatus.ACTIVE ? UserStatus.ACTIVE : undefined,
          authProvider: user.authProvider,
          emailVerifiedAt: user.emailVerifiedAt ?? undefined,
          lockedUntil: user.lockedUntil ?? undefined,
          deletedAt: user.deletedAt ?? null,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { identityId: identity.id },
      });
    } else if (!identity.passwordHash && user.passwordHash) {
      identity = await tx.identity.update({
        where: { id: identity.id },
        data: {
          passwordHash: user.passwordHash,
          status: user.status === UserStatus.ACTIVE ? UserStatus.ACTIVE : identity.status,
          emailVerifiedAt: user.emailVerifiedAt ?? identity.emailVerifiedAt,
        },
      });
    }

    let membership =
      preferredMembershipId && user.membership?.id === preferredMembershipId
        ? user.membership
        : user.membership;

    if (!membership || (preferredMembershipId && membership.id !== preferredMembershipId)) {
      membership = await tx.tenantMembership.upsert({
        where: { userId: user.id },
        create: {
          identityId: identity.id,
          tenantId: user.tenantId,
          userId: user.id,
          type: user.type,
          status: user.status,
          isDefault: user.tenantId === null || user.status === UserStatus.ACTIVE,
          lastAccessedAt: user.lastLoginAt,
          metadata: {
            createdFromUserId: user.id,
          },
          deletedAt: user.deletedAt,
        },
        update: {
          identityId: identity.id,
          tenantId: user.tenantId,
          type: user.type,
          status: user.status,
          deletedAt: user.deletedAt,
        },
      });
    } else if (
      membership.identityId !== identity.id ||
      membership.status !== user.status ||
      membership.type !== user.type ||
      membership.tenantId !== user.tenantId
    ) {
      membership = await tx.tenantMembership.update({
        where: { id: membership.id },
        data: {
          identityId: identity.id,
          tenantId: user.tenantId,
          type: user.type,
          status: user.status,
          deletedAt: user.deletedAt,
        },
      });
    }

    const freshUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: this.userAccessInclude,
    });

    if (!freshUser) {
      throw new UnauthorizedException('User not found.');
    }

    return {
      user: freshUser,
      identity,
      membership,
    };
  }

  private chooseDefaultMembership(
    memberships: Array<AuthMembershipContext & { user: AuthUserWithAccess | null }>,
  ) {
    const activeMemberships = memberships.filter(
      (membership) =>
        membership.user &&
        !membership.user.deletedAt &&
        membership.status === UserStatus.ACTIVE &&
        membership.user.status === UserStatus.ACTIVE,
    );

    return (
      activeMemberships.find((membership) => membership.type === 'PLATFORM_ADMIN') ??
      activeMemberships.find((membership) => membership.isDefault) ??
      activeMemberships[0] ??
      memberships.find((membership) => membership.user)
    );
  }

  private async listWorkspaceOptions(identityId: string, currentUserId: string) {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: {
        identityId,
        deletedAt: null,
        userId: { not: null },
      },
      include: {
        tenant: true,
        user: {
          include: {
            userRoles: {
              include: {
                role: true,
              },
            },
          },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { lastAccessedAt: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return memberships
      .filter((membership) => membership.user)
      .map((membership) => {
        const roleCodes =
          membership.user?.userRoles
            .filter((userRole) => !userRole.endsAt || userRole.endsAt > new Date())
            .map((userRole) => userRole.role.code)
            .sort() ?? [];

        return {
          membershipId: membership.id,
          userId: membership.userId,
          tenantId: membership.tenantId,
          type: membership.type,
          status: membership.status,
          isDefault: membership.isDefault,
          isCurrent: membership.userId === currentUserId,
          displayName: membership.tenant?.name ?? 'Platform workspace',
          slug: membership.tenant?.slug ?? 'platform',
          tenant: membership.tenant
            ? {
                id: membership.tenant.id,
                slug: membership.tenant.slug,
                name: membership.tenant.name,
                status: membership.tenant.status,
              }
            : null,
          user: membership.user
            ? {
                id: membership.user.id,
                email: membership.user.email,
                username: membership.user.username,
                status: membership.user.status,
                type: membership.user.type,
                roles: roleCodes,
              }
            : null,
          lastAccessedAt: membership.lastAccessedAt?.toISOString() ?? null,
        };
      });
  }

  private async toAuthResponse(user: AuthUserWithAccess, expiresAt: Date) {
    const context = await this.ensureUserIdentityContext(user);
    const access = this.buildAccess(context.user);
    const workspaces = await this.listWorkspaceOptions(context.identity.id, context.user.id);

    return {
      user: {
        id: context.user.id,
        identityId: context.identity.id,
        membershipId: context.membership.id,
        email: context.user.email,
        username: context.user.username,
        tenantId: context.user.tenantId,
        type: context.user.type,
        status: context.user.status,
        roles: access.roles,
        permissions: access.permissions,
      },
      identity: {
        id: context.identity.id,
        email: context.identity.email,
      },
      membership: {
        id: context.membership.id,
        type: context.membership.type,
        status: context.membership.status,
        isDefault: context.membership.isDefault,
        tenantId: context.membership.tenantId,
      },
      tenant: context.user.tenant
        ? {
            id: context.user.tenant.id,
            slug: context.user.tenant.slug,
            name: context.user.tenant.name,
            enabledFeatures: this.enabledTenantFeatures(context.user.tenant),
          }
        : null,
      workspaces,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private buildAccess(user: AuthUserWithAccess) {
    const now = new Date();
    const roles = new Set<string>();
    const permissions = new Set<string>();

    for (const userRole of user.userRoles) {
      if (userRole.startsAt && userRole.startsAt > now) {
        continue;
      }

      if (userRole.endsAt && userRole.endsAt <= now) {
        continue;
      }

      if (!userRole.role.isActive || userRole.role.deletedAt) {
        continue;
      }

      roles.add(userRole.role.code);

      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.code);
      }
    }

    return {
      roles: Array.from(roles).sort(),
      permissions: Array.from(permissions).sort(),
    };
  }

  private assertUserCanAuthenticate(user: Pick<AuthUserWithAccess, 'status' | 'deletedAt'>) {
    if (user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is not active.');
    }
  }

  private assertIdentityCanAuthenticate(identity: Pick<AuthIdentityContext, 'status' | 'deletedAt'>) {
    if (identity.deletedAt || identity.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Global identity is not active.');
    }
  }

  private assertMembershipCanAuthenticate(membership: Pick<AuthMembershipContext, 'status' | 'deletedAt'>) {
    if (membership.deletedAt || membership.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Workspace membership is not active.');
    }
  }

  private inferDeviceName(userAgent?: string): string | undefined {
    if (!userAgent) {
      return undefined;
    }

    if (userAgent.includes('Chrome')) {
      return 'Chrome browser';
    }

    if (userAgent.includes('Firefox')) {
      return 'Firefox browser';
    }

    if (userAgent.includes('Safari')) {
      return 'Safari browser';
    }

    return 'Unknown device';
  }

  private fingerprint(metadata: RequestMetadata): string {
    return this.tokenService.hash(`${metadata.ipAddress ?? 'unknown'}:${metadata.userAgent ?? 'unknown'}`);
  }

  private asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private enabledTenantFeatures(tenant: NonNullable<AuthUserWithAccess['tenant']>) {
    const enabledStatuses = new Set<TenantFeatureStatus>([
      TenantFeatureStatus.ENABLED,
      TenantFeatureStatus.TRIAL,
      TenantFeatureStatus.BETA,
    ]);

    return tenant.features
      .filter((feature) => feature.platformFeature.isActive && enabledStatuses.has(feature.status))
      .map((feature) => feature.platformFeature.code)
      .sort();
  }

  private get userAccessInclude() {
    return {
      identity: true,
      membership: true,
      tenant: {
        include: {
          features: {
            include: {
              platformFeature: true,
            },
          },
        },
      },
      userRoles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    } satisfies Prisma.UserInclude;
  }
}
