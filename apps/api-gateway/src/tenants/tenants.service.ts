import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import {
  AuthProvider,
  AuditAction,
  ApprovalRequestStatus,
  EmployeeStatus,
  InvitationStatus,
  NotificationChannel,
  NotificationStatus,
  OutboxStatus,
  PositionStatus,
  RoleScope,
  TenantFeatureStatus,
  TenantStatus,
  UserStatus,
  UserType,
  WorkflowStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import { PasswordService } from '../auth/password.service';
import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { NotificationDeliveryService } from '../notifications/delivery/notification-delivery.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { UpdateTenantBrandingDto } from './dto/update-tenant-branding.dto';
import { UpdateTenantFeatureDto } from './dto/update-tenant-feature.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { UpdateTenantSubscriptionDto } from './dto/update-tenant-subscription.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

const CORE_ENABLED_FEATURES = new Set([
  'WORKFORCE_CORE',
  'ORGANIZATION',
  'POSITIONS',
  'WORKFLOWS',
  'DOCUMENTS',
  'NOTIFICATIONS',
  'ESS',
]);

const TENANT_ROLE_PERMISSION_MAP: Record<string, string[]> = {
  TENANT_ADMIN: [
    'tenants.settings.read',
    'tenants.settings.write',
    'tenants.branding.read',
    'tenants.branding.write',
    'tenants.features.read',
    'tenants.features.write',
    'tenants.subscription.read',
    'iam.users.read',
    'iam.users.write',
    'iam.roles.read',
    'iam.roles.write',
    'iam.permissions.read',
    'organization.read',
    'organization.write',
    'cost-centers.read',
    'cost-centers.write',
    'persons.read',
    'persons.write',
    'persons.sensitive.read',
    'employees.read',
    'employees.write',
    'employees.invite',
    'employees.transfer',
    'employees.suspend',
    'employees.separate',
    'assignments.read',
    'assignments.write',
    'positions.read',
    'positions.write',
    'workforce-actions.read',
    'workforce-actions.write',
    'workflows.read',
    'workflows.write',
    'approvals.read',
    'approvals.process',
    'documents.read',
    'documents.write',
    'documents.verify',
    'notifications.read',
    'notifications.write',
    'forms.read',
    'forms.write',
    'scheduling.read',
    'scheduling.write',
    'scheduling.team.write',
    'scheduling.self',
    'scheduling.overtime.approve',
    'audit.read',
    'activity.read',
    'timeline.read',
    'outbox.read',
    'outbox.process',
    'content.read',
    'content.write',
    'content.publish',
    'dashboard.read',
    'dashboard.write',
    'analytics.read',
    'analytics.write',
  ],
  HR_ADMIN: [
    'tenants.settings.read',
    'tenants.features.read',
    'iam.users.read',
    'organization.read',
    'organization.write',
    'cost-centers.read',
    'cost-centers.write',
    'persons.read',
    'persons.write',
    'persons.sensitive.read',
    'employees.read',
    'employees.write',
    'employees.invite',
    'employees.transfer',
    'employees.suspend',
    'employees.separate',
    'assignments.read',
    'assignments.write',
    'positions.read',
    'positions.write',
    'workforce-actions.read',
    'workforce-actions.write',
    'workflows.read',
    'approvals.read',
    'approvals.process',
    'documents.read',
    'documents.write',
    'documents.verify',
    'notifications.read',
    'forms.read',
    'forms.write',
    'scheduling.read',
    'scheduling.write',
    'scheduling.team.write',
    'scheduling.self',
    'scheduling.overtime.approve',
    'audit.read',
    'activity.read',
    'timeline.read',
    'outbox.read',
    'content.read',
    'content.write',
    'dashboard.read',
    'dashboard.write',
    'analytics.read',
    'analytics.write',
  ],
  MANAGER: [
    'organization.read',
    'persons.read',
    'employees.read',
    'assignments.read',
    'positions.read',
    'workforce-actions.read',
    'approvals.read',
    'approvals.process',
    'documents.read',
    'notifications.read',
    'forms.read',
    'scheduling.team.write',
    'scheduling.self',
    'scheduling.overtime.approve',
    'timeline.read',
    'content.read',
    'dashboard.read',
  ],
  EMPLOYEE: [
    'notifications.read',
    'content.read',
    'dashboard.read',
    'scheduling.self',
  ],
};

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly notificationDelivery: NotificationDeliveryService,
    private readonly config: ConfigService,
  ) {}

  async createTenant(actor: AuthenticatedPrincipal, dto: CreateTenantDto) {
    const inviteFirstAdmin = !dto.adminPassword;
    const invitationToken = inviteFirstAdmin ? this.issueInvitationToken() : null;
    const passwordHash = dto.adminPassword
      ? await this.passwordService.hash(dto.adminPassword)
      : null;
    const platformFeatures = await this.prisma.platformFeature.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    const permissions = await this.prisma.permission.findMany({
      where: {
        tenantId: null,
        code: {
          in: Array.from(new Set(Object.values(TENANT_ROLE_PERMISSION_MAP).flat())),
        },
      },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name.trim(),
          legalName: dto.legalName?.trim(),
          slug: dto.slug.trim().toLowerCase(),
          subdomain: dto.subdomain.trim().toLowerCase(),
          customDomain: dto.customDomain?.trim().toLowerCase(),
          status: dto.status ?? TenantStatus.TRIAL,
          industry: dto.industry,
          sizeBand: dto.sizeBand,
          website: dto.website,
          supportEmail: dto.supportEmail?.trim().toLowerCase(),
          supportPhone: dto.supportPhone,
          countryId: dto.countryId,
          currencyId: dto.currencyId,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });

      await tx.tenantSetting.create({
        data: {
          tenantId: tenant.id,
          defaultTimezone: 'UTC',
          defaultLocale: 'en',
          dateFormat: 'yyyy-MM-dd',
          timeFormat: 'HH:mm',
          fiscalYearStartMonth: 1,
          employeeNumberPrefix: `${tenant.slug.toUpperCase().replaceAll('-', '')}-`,
          employeeNumberNextSeq: 1,
          passwordPolicy: {
            minLength: 12,
            requireUppercase: true,
            requireLowercase: true,
            requireNumber: true,
            requireSymbol: true,
          },
          sessionPolicy: {
            accessMinutes: 15,
            refreshDays: 30,
          },
          approvalPolicy: {
            requireWorkflowForTransfers: true,
          },
        },
      });

      await tx.tenantBranding.create({
        data: {
          tenantId: tenant.id,
          primaryColor: '#0F766E',
          secondaryColor: '#111827',
          accentColor: '#F59E0B',
          fontFamily: 'Inter',
        },
      });

      await tx.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planCode: dto.planCode?.trim() || 'ENTERPRISE_TRIAL',
          planName: dto.planName?.trim() || 'Enterprise Trial',
          status: dto.subscriptionStatus?.trim() || 'TRIAL',
          startsAt: new Date(),
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          userLimit: dto.userLimit ?? 50,
          employeeLimit: dto.employeeLimit ?? 500,
          storageLimitMb: dto.storageLimitMb ?? 10240,
        },
      });

      for (const feature of platformFeatures) {
        const enabled = CORE_ENABLED_FEATURES.has(feature.code);
        await tx.tenantFeature.create({
          data: {
            tenantId: tenant.id,
            platformFeatureId: feature.id,
            status: enabled ? TenantFeatureStatus.ENABLED : TenantFeatureStatus.DISABLED,
            enabledAt: enabled ? new Date() : undefined,
          },
        });
      }

      const roles = await this.createDefaultTenantRoles(tx, tenant.id, permissions);

      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.adminEmail.trim().toLowerCase(),
          username: 'tenant-admin',
          passwordHash,
          type: UserType.TENANT_USER,
          status: inviteFirstAdmin ? UserStatus.INVITED : UserStatus.ACTIVE,
          authProvider: AuthProvider.LOCAL,
          emailVerifiedAt: inviteFirstAdmin ? undefined : new Date(),
        },
      });

      const adminIdentity = await tx.identity.upsert({
        where: { email: adminUser.email },
        create: {
          email: adminUser.email,
          passwordHash,
          status: adminUser.status,
          authProvider: adminUser.authProvider,
          emailVerifiedAt: adminUser.emailVerifiedAt,
          metadata: {
            createdFromTenantId: tenant.id,
            createdFromUserId: adminUser.id,
          },
        },
        update: {
          passwordHash: passwordHash ?? undefined,
          status: adminUser.status === UserStatus.ACTIVE ? UserStatus.ACTIVE : undefined,
          authProvider: adminUser.authProvider,
          emailVerifiedAt: adminUser.emailVerifiedAt ?? undefined,
          deletedAt: null,
        },
      });

      await tx.user.update({
        where: { id: adminUser.id },
        data: { identityId: adminIdentity.id },
      });

      await tx.tenantMembership.upsert({
        where: { userId: adminUser.id },
        create: {
          identityId: adminIdentity.id,
          tenantId: tenant.id,
          userId: adminUser.id,
          type: adminUser.type,
          status: adminUser.status,
          isDefault: true,
          metadata: {
            createdFromTenantProvisioning: true,
            tenantSlug: tenant.slug,
          },
        },
        update: {
          identityId: adminIdentity.id,
          tenantId: tenant.id,
          type: adminUser.type,
          status: adminUser.status,
          deletedAt: null,
        },
      });

      const tenantAdminRole = roles.get('TENANT_ADMIN');
      if (!tenantAdminRole) {
        throw new BadRequestException('Tenant admin role could not be provisioned.');
      }

      let invitation:
        | {
            id: string;
            expiresAt: Date;
          }
        | null = null;

      if (inviteFirstAdmin && invitationToken) {
        const createdInvitation = await tx.invitation.create({
          data: {
            tenantId: tenant.id,
            email: adminUser.email,
            tokenHash: this.hashInvitationToken(invitationToken),
            status: InvitationStatus.PENDING,
            invitedById: actor.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            metadata: {
              userId: adminUser.id,
              purpose: 'tenant-admin-onboarding',
              tenantId: tenant.id,
            },
            roles: {
              create: {
                roleId: tenantAdminRole.id,
              },
            },
          },
          select: {
            id: true,
            expiresAt: true,
          },
        });

        invitation = createdInvitation;
      } else {
        await tx.userRole.create({
          data: {
            userId: adminUser.id,
            roleId: tenantAdminRole.id,
            scope: RoleScope.TENANT,
            scopeId: '',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: actor.id,
          action: AuditAction.CREATE,
          module: 'tenants',
          entityType: 'Tenant',
          entityId: tenant.id,
          after: {
            name: tenant.name,
            slug: tenant.slug,
            subdomain: tenant.subdomain,
            status: tenant.status,
          },
        },
      });

      await tx.outboxMessage.create({
        data: {
          tenantId: tenant.id,
          eventType: 'tenant.created',
          aggregateType: 'Tenant',
          aggregateId: tenant.id,
          payload: {
            tenantId: tenant.id,
            slug: tenant.slug,
            adminUserId: adminUser.id,
          },
        },
      });

      return { tenant, adminUser, invitation };
    });

    let adminInvitationDelivery:
      | {
          status: NotificationStatus;
          failureReason?: string;
        }
      | undefined;

    if (invitationToken && result.invitation) {
      adminInvitationDelivery = await this.sendTenantAdminInvitationEmail({
        tenantId: result.tenant.id,
        tenantName: result.tenant.name,
        tenantSlug: result.tenant.slug,
        adminUserId: result.adminUser.id,
        adminEmail: result.adminUser.email,
        invitationToken,
        invitationExpiresAt: result.invitation.expiresAt,
      });
    }

    return {
      tenant: await this.getPlatformTenant(actor, result.tenant.id),
      adminUserId: result.adminUser.id,
      adminInvitationId: result.invitation?.id,
      adminInvitationDelivery,
    };
  }

  async listPlatformTenants(query: ListTenantsQueryDto) {
    const limit = query.limit ?? 50;
    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      status: query.status,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { slug: { contains: query.search, mode: 'insensitive' } },
            { subdomain: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const tenants = await this.prisma.tenant.findMany({
      where,
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: this.tenantDetailsInclude,
    });
    const hasNextPage = tenants.length > limit;
    const data = hasNextPage ? tenants.slice(0, limit) : tenants;

    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? data.at(-1)?.id : null,
      },
    };
  }

  async getPlatformTenant(_actor: AuthenticatedPrincipal, tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        deletedAt: null,
      },
      include: this.tenantDetailsInclude,
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const [
      totalUsers,
      activeUsers,
      invitedUsers,
      totalEmployees,
      activeEmployees,
      organizationNodes,
      costCenters,
      positions,
      activePositions,
      workflows,
      documents,
      pendingApprovals,
      failedOutbox,
    ] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.user.count({ where: { tenantId, deletedAt: null, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { tenantId, deletedAt: null, status: UserStatus.INVITED } }),
      this.prisma.employee.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.employee.count({ where: { tenantId, deletedAt: null, status: EmployeeStatus.ACTIVE } }),
      this.prisma.organizationNode.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.costCenter.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.position.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.position.count({ where: { tenantId, deletedAt: null, status: PositionStatus.ACTIVE } }),
      this.prisma.workflow.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.document.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.approvalRequest.count({ where: { tenantId, status: ApprovalRequestStatus.PENDING } }),
      this.prisma.outboxMessage.count({ where: { tenantId, status: OutboxStatus.FAILED } }),
    ]);

    return {
      ...tenant,
      platformSummary: {
        totalUsers,
        activeUsers,
        invitedUsers,
        totalEmployees,
        activeEmployees,
        organizationNodes,
        costCenters,
        positions,
        activePositions,
        workflows,
        documents,
        pendingApprovals,
        failedOutbox,
        enabledFeatures: tenant.features.filter((feature) => feature.status === TenantFeatureStatus.ENABLED).length,
      },
    };
  }

  async updateTenant(actor: AuthenticatedPrincipal, tenantId: string, dto: UpdateTenantDto) {
    await this.getPlatformTenant(actor, tenantId);

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: dto.name?.trim(),
        legalName: dto.legalName?.trim(),
        slug: dto.slug?.trim().toLowerCase(),
        subdomain: dto.subdomain?.trim().toLowerCase(),
        customDomain: dto.customDomain?.trim().toLowerCase(),
        status: dto.status,
        industry: dto.industry,
        sizeBand: dto.sizeBand,
        website: dto.website,
        supportEmail: dto.supportEmail?.trim().toLowerCase(),
        supportPhone: dto.supportPhone,
        countryId: dto.countryId,
        currencyId: dto.currencyId,
        updatedById: actor.id,
      },
      include: this.tenantDetailsInclude,
    });
  }

  async setTenantStatus(actor: AuthenticatedPrincipal, tenantId: string, status: TenantStatus) {
    await this.getPlatformTenant(actor, tenantId);

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status,
        updatedById: actor.id,
      },
      include: this.tenantDetailsInclude,
    });
  }

  async getCurrentTenant(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenantActor(actor);
    return this.getTenantById(tenantId);
  }

  async getCurrentTenantOnboarding(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenantActor(actor);
    return this.buildTenantOnboardingChecklist(tenantId);
  }

  async getPlatformTenantOnboarding(actor: AuthenticatedPrincipal, tenantId: string) {
    await this.getPlatformTenant(actor, tenantId);
    return this.buildTenantOnboardingChecklist(tenantId);
  }

  async updateCurrentSettings(actor: AuthenticatedPrincipal, dto: UpdateTenantSettingsDto) {
    const tenantId = this.requireTenantActor(actor);
    const data = this.tenantSettingsData(dto);

    return this.prisma.tenantSetting.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ...data,
      },
      update: data,
    });
  }

  async updateCurrentBranding(actor: AuthenticatedPrincipal, dto: UpdateTenantBrandingDto) {
    const tenantId = this.requireTenantActor(actor);
    const data = this.tenantBrandingData(dto);

    return this.prisma.tenantBranding.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ...data,
      },
      update: data,
    });
  }

  async getCurrentSubscription(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenantActor(actor);

    return this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
    });
  }

  async updateTenantSubscription(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    dto: UpdateTenantSubscriptionDto,
  ) {
    await this.getPlatformTenant(actor, tenantId);

    return this.prisma.tenantSubscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planCode: dto.planCode ?? 'ENTERPRISE',
        planName: dto.planName ?? 'Enterprise',
        status: dto.status ?? 'ACTIVE',
        startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        userLimit: dto.userLimit,
        employeeLimit: dto.employeeLimit,
        storageLimitMb: dto.storageLimitMb,
        metadata: this.toJson(dto.metadata),
      },
      update: {
        planCode: dto.planCode,
        planName: dto.planName,
        status: dto.status,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        userLimit: dto.userLimit,
        employeeLimit: dto.employeeLimit,
        storageLimitMb: dto.storageLimitMb,
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  async listCurrentFeatures(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenantActor(actor);
    return this.listTenantFeatures(tenantId);
  }

  async listPlatformTenantFeatures(actor: AuthenticatedPrincipal, tenantId: string) {
    await this.getPlatformTenant(actor, tenantId);
    return this.listTenantFeatures(tenantId);
  }

  async enableCurrentFeature(
    actor: AuthenticatedPrincipal,
    featureCode: string,
    dto: UpdateTenantFeatureDto,
  ) {
    const tenantId = this.requireTenantActor(actor);
    return this.setTenantFeatureStatus(tenantId, featureCode, TenantFeatureStatus.ENABLED, dto);
  }

  async disableCurrentFeature(actor: AuthenticatedPrincipal, featureCode: string) {
    const tenantId = this.requireTenantActor(actor);
    return this.setTenantFeatureStatus(tenantId, featureCode, TenantFeatureStatus.DISABLED, {});
  }

  async enablePlatformTenantFeature(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    featureCode: string,
    dto: UpdateTenantFeatureDto,
  ) {
    await this.getPlatformTenant(actor, tenantId);
    return this.setTenantFeatureStatus(tenantId, featureCode, TenantFeatureStatus.ENABLED, dto);
  }

  async disablePlatformTenantFeature(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    featureCode: string,
  ) {
    await this.getPlatformTenant(actor, tenantId);
    return this.setTenantFeatureStatus(tenantId, featureCode, TenantFeatureStatus.DISABLED, {});
  }

  private async setTenantFeatureStatus(
    tenantId: string,
    featureCode: string,
    status: TenantFeatureStatus,
    dto: UpdateTenantFeatureDto,
  ) {
    const platformFeature = await this.prisma.platformFeature.findUnique({
      where: { code: featureCode.trim().toUpperCase() },
    });

    if (!platformFeature) {
      throw new NotFoundException('Platform feature not found.');
    }

    return this.prisma.tenantFeature.upsert({
      where: {
        tenantId_platformFeatureId: {
          tenantId,
          platformFeatureId: platformFeature.id,
        },
      },
      create: {
        tenantId,
        platformFeatureId: platformFeature.id,
        status,
        enabledAt: status === TenantFeatureStatus.ENABLED ? new Date() : undefined,
        disabledAt: status === TenantFeatureStatus.DISABLED ? new Date() : undefined,
        trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined,
        limits: this.toJson(dto.limits),
        configuration: this.toJson(dto.configuration),
      },
      update: {
        status,
        enabledAt: status === TenantFeatureStatus.ENABLED ? new Date() : undefined,
        disabledAt: status === TenantFeatureStatus.DISABLED ? new Date() : undefined,
        trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined,
        limits: this.toJson(dto.limits),
        configuration: this.toJson(dto.configuration),
      },
      include: {
        platformFeature: true,
      },
    });
  }

  private async listTenantFeatures(tenantId: string) {
    return this.prisma.tenantFeature.findMany({
      where: { tenantId },
      include: { platformFeature: true },
      orderBy: { platformFeature: { code: 'asc' } },
    });
  }

  private async getTenantById(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        deletedAt: null,
      },
      include: this.tenantDetailsInclude,
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    return tenant;
  }

  private async buildTenantOnboardingChecklist(tenantId: string) {
    const [
      tenant,
      organizationNodes,
      roles,
      activeUsers,
      employees,
      activeWorkflows,
      documentTypes,
      dashboardWidgets,
      enabledFeatures,
    ] = await Promise.all([
      this.getTenantById(tenantId),
      this.prisma.organizationNode.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.role.count({ where: { tenantId, deletedAt: null, isActive: true } }),
      this.prisma.user.count({ where: { tenantId, deletedAt: null, status: UserStatus.ACTIVE } }),
      this.prisma.employee.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.workflow.count({ where: { tenantId, deletedAt: null, status: WorkflowStatus.ACTIVE } }),
      this.prisma.documentType.count({
        where: {
          OR: [{ tenantId: null }, { tenantId }],
        },
      }),
      this.prisma.dashboardWidget.count({ where: { OR: [{ tenantId: null }, { tenantId }], isActive: true } }),
      this.prisma.tenantFeature.count({
        where: {
          tenantId,
          status: {
            in: [TenantFeatureStatus.ENABLED, TenantFeatureStatus.TRIAL, TenantFeatureStatus.BETA],
          },
        },
      }),
    ]);
    const steps = [
      {
        code: 'TENANT_PROFILE',
        title: 'Confirm tenant profile, localization, and subscription',
        complete: Boolean(tenant.settings && tenant.branding && tenant.subscription),
        owner: 'Tenant admin',
        evidence: {
          settings: Boolean(tenant.settings),
          branding: Boolean(tenant.branding),
          subscription: Boolean(tenant.subscription),
        },
      },
      {
        code: 'FEATURES_ENABLED',
        title: 'Enable core workforce modules',
        complete: enabledFeatures >= CORE_ENABLED_FEATURES.size,
        owner: 'Platform admin',
        evidence: {
          enabledFeatures,
          expectedCoreFeatures: CORE_ENABLED_FEATURES.size,
        },
      },
      {
        code: 'ROLES_READY',
        title: 'Verify role and permission templates',
        complete: roles >= Object.keys(TENANT_ROLE_PERMISSION_MAP).length,
        owner: 'Security admin',
        evidence: {
          roles,
          expectedDefaultRoles: Object.keys(TENANT_ROLE_PERMISSION_MAP).length,
        },
      },
      {
        code: 'USERS_READY',
        title: 'Create tenant administrators and invite operators',
        complete: activeUsers > 0,
        owner: 'Tenant admin',
        evidence: {
          activeUsers,
        },
      },
      {
        code: 'ORGANIZATION_READY',
        title: 'Create organization nodes and reporting structure',
        complete: organizationNodes > 0,
        owner: 'HR operations',
        evidence: {
          organizationNodes,
        },
      },
      {
        code: 'WORKFORCE_READY',
        title: 'Load employees and assignment history',
        complete: employees > 0,
        owner: 'HR operations',
        evidence: {
          employees,
        },
      },
      {
        code: 'WORKFLOWS_READY',
        title: 'Activate approval workflows',
        complete: activeWorkflows > 0,
        owner: 'Workflow steward',
        evidence: {
          activeWorkflows,
        },
      },
      {
        code: 'COMPLIANCE_READY',
        title: 'Review document types and compliance queues',
        complete: documentTypes > 0,
        owner: 'Compliance admin',
        evidence: {
          documentTypes,
        },
      },
      {
        code: 'DASHBOARD_READY',
        title: 'Confirm dashboards and operating widgets',
        complete: dashboardWidgets > 0,
        owner: 'Executive admin',
        evidence: {
          dashboardWidgets,
        },
      },
    ];
    const completed = steps.filter((step) => step.complete).length;

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
      },
      completionPercent: Math.round((completed / steps.length) * 100),
      completed,
      total: steps.length,
      steps,
      nextBestActions: steps
        .filter((step) => !step.complete)
        .slice(0, 3)
        .map((step) => ({
          code: step.code,
          title: step.title,
          owner: step.owner,
        })),
      generatedAt: new Date().toISOString(),
    };
  }

  private async createDefaultTenantRoles(
    tx: Prisma.TransactionClient,
    tenantId: string,
    permissions: Array<{ id: string; code: string }>,
  ) {
    const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
    const roles = new Map<string, { id: string }>();

    for (const [code, permissionCodes] of Object.entries(TENANT_ROLE_PERMISSION_MAP)) {
      const role = await tx.role.create({
        data: {
          tenantId,
          code,
          name: this.roleNameFromCode(code),
          description: `Default ${this.roleNameFromCode(code)} role.`,
          scope: RoleScope.TENANT,
          isSystem: true,
          isActive: true,
        },
      });
      roles.set(code, role);

      const rolePermissions = permissionCodes
        .map((permissionCode) => permissionByCode.get(permissionCode))
        .filter((permissionId): permissionId is string => Boolean(permissionId))
        .map((permissionId) => ({
          roleId: role.id,
          permissionId,
        }));

      if (rolePermissions.length > 0) {
        await tx.rolePermission.createMany({
          data: rolePermissions,
          skipDuplicates: true,
        });
      }

      await tx.rolePermission.deleteMany({
        where: {
          roleId: role.id,
          permissionId: {
            notIn: rolePermissions.map((rolePermission) => rolePermission.permissionId),
          },
        },
      });
    }

    return roles;
  }

  private roleNameFromCode(code: string) {
    return code
      .split('_')
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' ');
  }

  private tenantSettingsData(dto: UpdateTenantSettingsDto) {
    return {
      defaultTimezone: dto.defaultTimezone,
      defaultLocale: dto.defaultLocale,
      dateFormat: dto.dateFormat,
      timeFormat: dto.timeFormat,
      fiscalYearStartMonth: dto.fiscalYearStartMonth,
      employeeNumberPrefix: dto.employeeNumberPrefix,
      employeeNumberNextSeq: dto.employeeNumberNextSeq,
      passwordPolicy: this.toJson(dto.passwordPolicy),
      sessionPolicy: this.toJson(dto.sessionPolicy),
      approvalPolicy: this.toJson(dto.approvalPolicy),
    };
  }

  private tenantBrandingData(dto: UpdateTenantBrandingDto) {
    return {
      logoUrl: dto.logoUrl,
      faviconUrl: dto.faviconUrl,
      primaryColor: dto.primaryColor,
      secondaryColor: dto.secondaryColor,
      accentColor: dto.accentColor,
      fontFamily: dto.fontFamily,
      emailHeaderUrl: dto.emailHeaderUrl,
      customCss: dto.customCss,
      metadata: this.toJson(dto.metadata),
    };
  }

  private async sendTenantAdminInvitationEmail(input: {
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    adminUserId: string;
    adminEmail: string;
    invitationToken: string;
    invitationExpiresAt: Date;
  }) {
    const setupUrl = this.invitationUrl(input.invitationToken);
    const title = `Set up your TimeSync tenant administrator access`;
    const body = [
      `Hello,`,
      `A TimeSync platform operator has provisioned ${input.tenantName} and invited you as the first tenant administrator.`,
      `Use this secure link to set your password and activate the workspace:`,
      setupUrl,
      `Tenant workspace: ${input.tenantSlug}`,
      `Administrator email: ${input.adminEmail}`,
      `This invitation expires on ${input.invitationExpiresAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC.`,
      `After setup, sign in with your email and tenant slug ${input.tenantSlug}.`,
    ].join('\n\n');

    const notification = await this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        channel: NotificationChannel.EMAIL,
        title,
        body,
        status: NotificationStatus.PENDING,
        templateCode: 'TENANT_ADMIN_INVITED',
        data: {
          module: 'tenants',
          purpose: 'tenant-admin-onboarding',
          invitationExpiresAt: input.invitationExpiresAt.toISOString(),
        },
        recipients: {
          create: {
            userId: input.adminUserId,
            destination: input.adminEmail,
            status: NotificationStatus.PENDING,
          },
        },
      },
      include: {
        recipients: true,
      },
    });

    const recipient = notification.recipients[0];
    const delivery = await this.notificationDelivery.deliver({ notification, recipient });

    await this.prisma.$transaction(async (tx) => {
      await tx.notificationRecipient.update({
        where: { id: recipient.id },
        data: {
          status: delivery.status,
          deliveredAt: this.isSuccessfulNotificationDelivery(delivery.status) ? new Date() : undefined,
          failureReason: delivery.failureReason,
        },
      });

      await tx.notification.update({
        where: { id: notification.id },
        data: {
          status: delivery.status,
          sentAt: new Date(),
          data: {
            ...(notification.data && typeof notification.data === 'object' && !Array.isArray(notification.data)
              ? (notification.data as Record<string, unknown>)
              : {}),
            deliveryStatus: delivery.status,
            deliveryFailureReason: delivery.failureReason,
            providerMessageId: delivery.providerMessageId,
          },
        },
      });
    });

    return {
      status: delivery.status,
      failureReason: delivery.failureReason,
    };
  }

  private invitationUrl(token: string) {
    const frontendUrl = this.config.get<string>('app.frontendUrl', 'http://localhost:3000');
    const url = new URL('/accept-invitation', frontendUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private issueInvitationToken() {
    return randomBytes(32).toString('base64url');
  }

  private hashInvitationToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private isSuccessfulNotificationDelivery(status: NotificationStatus) {
    const successfulStatuses: NotificationStatus[] = [
      NotificationStatus.SENT,
      NotificationStatus.DELIVERED,
      NotificationStatus.READ,
    ];

    return successfulStatuses.includes(status);
  }

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private requireTenantActor(actor: AuthenticatedPrincipal): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant context is required.');
    }

    return actor.tenantId;
  }

  private get tenantDetailsInclude() {
    return {
      country: true,
      currency: true,
      settings: true,
      branding: true,
      subscription: true,
      features: {
        include: {
          platformFeature: true,
        },
        orderBy: {
          platformFeature: {
            code: 'asc',
          },
        },
      },
    } satisfies Prisma.TenantInclude;
  }
}
