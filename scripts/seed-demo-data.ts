import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import {
  ApprovalRequestStatus,
  ApprovalActionType,
  AssignmentType,
  AuditAction,
  AuthProvider,
  DocumentVerificationStatus,
  DocumentVisibility,
  EmployeeLifecyclePlanType,
  EmployeeLifecycleTaskOwnerType,
  EmployeeLifecycleTaskPriority,
  EmployeeLifecycleTemplateStatus,
  EmployeeAvailabilityStatus,
  EmployeeStatus,
  EmploymentType,
  LeaveBlackoutSeverity,
  LeaveCalendarDayType,
  LeaveLedgerEntryType,
  LeavePolicyStatus,
  LeaveRequestStatus,
  LeaveTypeUnit,
  NotificationChannel,
  NotificationStatus,
  OpenShiftStatus,
  OvertimeApprovalMode,
  OvertimePolicyMode,
  OrganizationNodeType,
  OutboxStatus,
  PersonDocumentType,
  PositionStatus,
  Prisma,
  PrismaClient,
  RecruitmentApplicationStatus,
  RecruitmentCandidateStatus,
  RecruitmentControlStatus,
  RecruitmentEmploymentType,
  RecruitmentInterviewStatus,
  RecruitmentOfferStatus,
  RecruitmentRequisitionStatus,
  RecruitmentStageType,
  RecruitmentWorkMode,
  ScheduleAssignmentSource,
  ScheduleAssignmentStatus,
  SchedulePolicyStatus,
  ScheduleStatus,
  ScheduleWeekStart,
  ShiftStatus,
  RoleScope,
  TenantFeatureStatus,
  TenantStatus,
  TimelineEventType,
  UserStatus,
  UserType,
  WorkforceLeadershipRole,
  WorkforceActionStatus,
  WorkforceActionType,
  WorkflowStatus,
  WorkflowStepType,
  type Employee,
  type OrganizationNode,
  type Permission,
  type Position,
  type Role,
  type User,
} from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed demo data.');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const demoTenantSlug = process.env.DEMO_TENANT_SLUG?.trim() || 'acme-health';
const demoPassword = process.env.DEMO_PASSWORD || 'DemoPass123!';
const effectiveFrom = new Date('2026-01-01T00:00:00.000Z');

const platformFeatures = [
  ['WORKFORCE_CORE', 'Workforce Core'],
  ['ORGANIZATION', 'Organization Structure'],
  ['POSITIONS', 'Position Management'],
  ['WORKFLOWS', 'Workflow Approvals'],
  ['DOCUMENTS', 'Document Management'],
  ['NOTIFICATIONS', 'Notifications'],
  ['FORMS', 'Forms and Surveys'],
  ['SCHEDULING', 'Scheduling and Overtime'],
  ['ANALYTICS', 'Analytics'],
  ['ESS', 'Employee Self Service'],
  ['PAYROLL', 'Payroll'],
  ['ATTENDANCE', 'Attendance'],
  ['LEAVE', 'Leave Management'],
  ['RECRUITMENT', 'Recruitment'],
  ['PERFORMANCE', 'Performance Management'],
  ['LMS', 'Learning Management'],
  ['EXPENSES', 'Expenses'],
  ['ASSET_MANAGEMENT', 'Asset Management'],
] as const;

const permissionDefinitions = [
  ['tenants.settings.read', 'Read Tenant Settings', 'tenants'],
  ['tenants.settings.write', 'Write Tenant Settings', 'tenants'],
  ['tenants.branding.read', 'Read Tenant Branding', 'tenants'],
  ['tenants.branding.write', 'Write Tenant Branding', 'tenants'],
  ['tenants.features.read', 'Read Tenant Features', 'tenants'],
  ['tenants.features.write', 'Write Tenant Features', 'tenants'],
  ['tenants.subscription.read', 'Read Tenant Subscription', 'tenants'],
  ['tenants.subscription.write', 'Write Tenant Subscription', 'tenants'],
  ['iam.users.read', 'Read Users', 'iam'],
  ['iam.users.write', 'Write Users', 'iam'],
  ['iam.roles.read', 'Read Roles', 'iam'],
  ['iam.roles.write', 'Write Roles', 'iam'],
  ['iam.permissions.read', 'Read Permissions', 'iam'],
  ['organization.read', 'Read Organization', 'organization'],
  ['organization.write', 'Write Organization', 'organization'],
  ['cost-centers.read', 'Read Cost Centers', 'organization'],
  ['cost-centers.write', 'Write Cost Centers', 'organization'],
  ['persons.read', 'Read Persons', 'persons'],
  ['persons.write', 'Write Persons', 'persons'],
  ['persons.sensitive.read', 'Read Sensitive Person Data', 'persons'],
  ['employees.read', 'Read Employees', 'employees'],
  ['employees.write', 'Write Employees', 'employees'],
  ['employees.invite', 'Invite Employees', 'employees'],
  ['employees.transfer', 'Transfer Employees', 'employees'],
  ['employees.suspend', 'Suspend Employees', 'employees'],
  ['employees.separate', 'Separate Employees', 'employees'],
  ['assignments.read', 'Read Assignments', 'workforce'],
  ['assignments.write', 'Write Assignments', 'workforce'],
  ['positions.read', 'Read Positions', 'positions'],
  ['positions.write', 'Write Positions', 'positions'],
  ['workforce-actions.read', 'Read Workforce Actions', 'workforce'],
  ['workforce-actions.write', 'Write Workforce Actions', 'workforce'],
  ['workflows.read', 'Read Workflows', 'workflows'],
  ['workflows.write', 'Write Workflows', 'workflows'],
  ['approvals.read', 'Read Approvals', 'workflows'],
  ['approvals.process', 'Process Approvals', 'workflows'],
  ['documents.read', 'Read Documents', 'documents'],
  ['documents.write', 'Write Documents', 'documents'],
  ['documents.verify', 'Verify Documents', 'documents'],
  ['notifications.read', 'Read Notifications', 'notifications'],
  ['notifications.write', 'Write Notifications', 'notifications'],
  ['forms.read', 'Read Forms', 'forms'],
  ['forms.write', 'Write Forms', 'forms'],
  ['scheduling.read', 'Read Scheduling', 'scheduling'],
  ['scheduling.write', 'Write Scheduling', 'scheduling'],
  ['scheduling.team.write', 'Manage Team Scheduling', 'scheduling'],
  ['scheduling.self', 'Self-Service Scheduling', 'scheduling'],
  ['scheduling.overtime.approve', 'Approve Overtime', 'scheduling'],
  ['attendance.write', 'Write Attendance', 'attendance'],
  ['attendance.team.write', 'Manage Team Attendance', 'attendance'],
  ['attendance.self', 'Self-Service Attendance', 'attendance'],
  ['attendance.controls.write', 'Manage Attendance Controls', 'attendance'],
  ['attendance.reports.read', 'Read Attendance Reports', 'attendance'],
  ['attendance.exceptions.approve', 'Approve Attendance Exceptions', 'attendance'],
  ['attendance.timesheets.approve', 'Approve Timesheets', 'attendance'],
  ['leave.self', 'Self-Service Leave', 'leave'],
  ['leave.team.read', 'Read Team Leave', 'leave'],
  ['leave.team.write', 'Manage Team Leave', 'leave'],
  ['leave.approve', 'Approve Leave', 'leave'],
  ['leave.policy.write', 'Manage Leave Policies', 'leave'],
  ['leave.reports.read', 'Read Leave Reports', 'leave'],
  ['recruitment.read', 'Read Recruitment', 'recruitment'],
  ['recruitment.write', 'Manage Recruitment', 'recruitment'],
  ['recruitment.approve', 'Approve Recruitment', 'recruitment'],
  ['recruitment.interview', 'Submit Recruitment Feedback', 'recruitment'],
  ['recruitment.offer.write', 'Manage Recruitment Offers', 'recruitment'],
  ['recruitment.reports.read', 'Read Recruitment Reports', 'recruitment'],
  ['audit.read', 'Read Audit Logs', 'audit'],
  ['activity.read', 'Read Activity Logs', 'audit'],
  ['timeline.read', 'Read Timeline', 'audit'],
  ['outbox.read', 'Read Outbox Messages', 'audit'],
  ['outbox.process', 'Process Outbox Messages', 'audit'],
  ['content.read', 'Read HR Guides', 'content'],
  ['content.write', 'Write HR Guides', 'content'],
  ['content.publish', 'Publish HR Guides', 'content'],
  ['dashboard.read', 'Read Dashboard', 'dashboard'],
  ['dashboard.write', 'Write Dashboard', 'dashboard'],
  ['analytics.read', 'Read Analytics', 'analytics'],
  ['analytics.write', 'Write Analytics', 'analytics'],
] as const;

const tenantRolePermissions: Record<string, string[]> = {
  TENANT_ADMIN: permissionDefinitions.map(([code]) => code),
  HR_ADMIN: [
    'tenants.settings.read',
    'tenants.branding.read',
    'tenants.features.read',
    'tenants.subscription.read',
    'iam.users.read',
    'iam.roles.read',
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
    'attendance.write',
    'attendance.team.write',
    'attendance.self',
    'attendance.controls.write',
    'attendance.reports.read',
    'attendance.exceptions.approve',
    'attendance.timesheets.approve',
    'leave.self',
    'leave.team.read',
    'leave.team.write',
    'leave.approve',
    'leave.policy.write',
    'leave.reports.read',
    'recruitment.read',
    'recruitment.write',
    'recruitment.approve',
    'recruitment.interview',
    'recruitment.offer.write',
    'recruitment.reports.read',
    'audit.read',
    'activity.read',
    'timeline.read',
    'content.read',
    'content.write',
    'dashboard.read',
    'dashboard.write',
    'analytics.read',
    'analytics.write',
  ],
  MANAGER: [
    'organization.read',
    'cost-centers.read',
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
    'attendance.team.write',
    'attendance.self',
    'attendance.reports.read',
    'attendance.exceptions.approve',
    'attendance.timesheets.approve',
    'leave.self',
    'leave.team.read',
    'leave.team.write',
    'leave.approve',
    'leave.reports.read',
    'recruitment.read',
    'recruitment.interview',
    'recruitment.approve',
    'timeline.read',
    'content.read',
    'dashboard.read',
  ],
  EMPLOYEE: [
    'notifications.read',
    'content.read',
    'dashboard.read',
    'scheduling.self',
    'attendance.self',
    'leave.self',
  ],
};

const demoUsers = [
  {
    roleCode: 'TENANT_ADMIN',
    email: 'admin@acme-health.test',
    username: 'acme-admin',
    employeeNumber: 'ACME-0001',
    firstName: 'Morgan',
    lastName: 'Admin',
    title: 'Tenant Administrator',
    employmentType: EmploymentType.FULL_TIME,
  },
  {
    roleCode: 'HR_ADMIN',
    email: 'hr@acme-health.test',
    username: 'acme-hr',
    employeeNumber: 'ACME-0002',
    firstName: 'Priya',
    lastName: 'Shah',
    title: 'People Operations Lead',
    employmentType: EmploymentType.FULL_TIME,
  },
  {
    roleCode: 'MANAGER',
    email: 'manager@acme-health.test',
    username: 'acme-manager',
    employeeNumber: 'ACME-0003',
    firstName: 'Elena',
    lastName: 'Brooks',
    title: 'Care Team Manager',
    employmentType: EmploymentType.FULL_TIME,
  },
  {
    roleCode: 'EMPLOYEE',
    email: 'employee@acme-health.test',
    username: 'acme-employee',
    employeeNumber: 'ACME-0004',
    firstName: 'Jordan',
    lastName: 'Lee',
    title: 'Care Specialist',
    employmentType: EmploymentType.FULL_TIME,
  },
] as const;

type DemoUserBundle = {
  user: User;
  employee: Employee;
  role: Role;
};

async function ensureReferenceData() {
  const usd = await prisma.currency.upsert({
    where: { code: 'USD' },
    create: { code: 'USD', name: 'United States Dollar', symbol: '$' },
    update: { name: 'United States Dollar', symbol: '$', isActive: true },
  });

  const country = await prisma.country.upsert({
    where: { iso2: 'US' },
    create: {
      name: 'United States',
      iso2: 'US',
      iso3: 'USA',
      phoneCode: '+1',
      defaultLocale: 'en-US',
      defaultTimezone: 'America/Chicago',
      currencyId: usd.id,
    },
    update: {
      name: 'United States',
      iso3: 'USA',
      phoneCode: '+1',
      defaultLocale: 'en-US',
      defaultTimezone: 'America/Chicago',
      currencyId: usd.id,
      isActive: true,
    },
  });

  const state = await prisma.state.upsert({
    where: { countryId_name: { countryId: country.id, name: 'Illinois' } },
    create: { countryId: country.id, name: 'Illinois', code: 'IL' },
    update: { code: 'IL', isActive: true },
  });

  const city = await prisma.city.upsert({
    where: { countryId_stateId_name: { countryId: country.id, stateId: state.id, name: 'Chicago' } },
    create: { countryId: country.id, stateId: state.id, name: 'Chicago' },
    update: { isActive: true },
  });

  await prisma.language.upsert({
    where: { code: 'en' },
    create: { code: 'en', name: 'English' },
    update: { name: 'English', isActive: true },
  });

  await prisma.timezone.upsert({
    where: { name: 'America/Chicago' },
    create: { name: 'America/Chicago', offset: 'UTC-06:00' },
    update: { offset: 'UTC-06:00', isActive: true },
  });

  return { country, currency: usd, state, city };
}

async function ensurePlatformFeatures() {
  for (const [code, name] of platformFeatures) {
    await prisma.platformFeature.upsert({
      where: { code },
      create: { code, name, isActive: true },
      update: { name, isActive: true },
    });
  }
}

async function ensureGlobalPermissions(): Promise<Map<string, Permission>> {
  const permissionByCode = new Map<string, Permission>();

  for (const [code, name, module] of permissionDefinitions) {
    const existing = await prisma.permission.findFirst({
      where: { tenantId: null, code },
    });

    const permission = existing
      ? await prisma.permission.update({
          where: { id: existing.id },
          data: { name, module, isSystem: true },
        })
      : await prisma.permission.create({
          data: { code, name, module, isSystem: true },
        });

    permissionByCode.set(code, permission);
  }

  return permissionByCode;
}

async function ensureTenant(reference: Awaited<ReturnType<typeof ensureReferenceData>>) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: demoTenantSlug },
    create: {
      name: 'Acme Health Group',
      legalName: 'Acme Health Group LLC',
      slug: demoTenantSlug,
      subdomain: demoTenantSlug,
      customDomain: null,
      status: TenantStatus.ACTIVE,
      industry: 'Healthcare',
      sizeBand: '500-1000',
      registrationNo: 'ACME-HG-2026',
      taxId: 'DEMO-TAX-0001',
      website: 'https://acme-health.test',
      supportEmail: 'support@acme-health.test',
      supportPhone: '+1-312-555-0100',
      countryId: reference.country.id,
      currencyId: reference.currency.id,
      metadata: {
        demo: true,
        scenario: 'enterprise-workforce-os',
      },
    },
    update: {
      name: 'Acme Health Group',
      legalName: 'Acme Health Group LLC',
      subdomain: demoTenantSlug,
      status: TenantStatus.ACTIVE,
      industry: 'Healthcare',
      sizeBand: '500-1000',
      supportEmail: 'support@acme-health.test',
      supportPhone: '+1-312-555-0100',
      countryId: reference.country.id,
      currencyId: reference.currency.id,
      deletedAt: null,
      metadata: {
        demo: true,
        scenario: 'enterprise-workforce-os',
      },
    },
  });

  await prisma.tenantSetting.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      defaultTimezone: 'America/Chicago',
      defaultLocale: 'en-US',
      dateFormat: 'MM/dd/yyyy',
      timeFormat: 'HH:mm',
      fiscalYearStartMonth: 1,
      employeeNumberPrefix: 'ACME',
      employeeNumberNextSeq: 5,
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumber: true,
        requireSymbol: true,
      },
      sessionPolicy: {
        accessTokenTtlMinutes: 15,
        refreshTokenTtlDays: 30,
        concurrentSessions: 5,
      },
      approvalPolicy: {
        requireWorkflowForLifecycleActions: true,
        requireReasonForRejections: true,
      },
    },
    update: {
      defaultTimezone: 'America/Chicago',
      defaultLocale: 'en-US',
      dateFormat: 'MM/dd/yyyy',
      timeFormat: 'HH:mm',
      fiscalYearStartMonth: 1,
      employeeNumberPrefix: 'ACME',
      employeeNumberNextSeq: 5,
    },
  });

  await prisma.tenantBranding.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      logoUrl: 'https://assets.acme-health.test/logo.svg',
      faviconUrl: 'https://assets.acme-health.test/favicon.ico',
      primaryColor: '#1f6f8b',
      secondaryColor: '#2f4858',
      accentColor: '#f59f00',
      fontFamily: 'Inter',
      emailHeaderUrl: 'https://assets.acme-health.test/email-header.png',
    },
    update: {
      primaryColor: '#1f6f8b',
      secondaryColor: '#2f4858',
      accentColor: '#f59f00',
      fontFamily: 'Inter',
    },
  });

  await prisma.tenantSubscription.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      planCode: 'ENTERPRISE',
      planName: 'Enterprise WorkforceOS',
      status: 'ACTIVE',
      startsAt: effectiveFrom,
      userLimit: 1000,
      employeeLimit: 5000,
      storageLimitMb: 512000,
      metadata: {
        demo: true,
        includedModules: Array.from(new Set(platformFeatures.map(([code]) => code))),
      },
    },
    update: {
      planCode: 'ENTERPRISE',
      planName: 'Enterprise WorkforceOS',
      status: 'ACTIVE',
      userLimit: 1000,
      employeeLimit: 5000,
      storageLimitMb: 512000,
    },
  });

  return tenant;
}

async function ensureTenantFeatures(tenantId: string) {
  const enabled = new Set([
    'WORKFORCE_CORE',
    'ORGANIZATION',
    'POSITIONS',
    'WORKFLOWS',
    'DOCUMENTS',
    'NOTIFICATIONS',
    'FORMS',
    'SCHEDULING',
    'ATTENDANCE',
    'LEAVE',
    'RECRUITMENT',
    'ANALYTICS',
    'ESS',
  ]);
  const features = await prisma.platformFeature.findMany({
    where: { code: { in: platformFeatures.map(([code]) => code) } },
  });

  for (const feature of features) {
    const isEnabled = enabled.has(feature.code);

    await prisma.tenantFeature.upsert({
      where: {
        tenantId_platformFeatureId: {
          tenantId,
          platformFeatureId: feature.id,
        },
      },
      create: {
        tenantId,
        platformFeatureId: feature.id,
        status: isEnabled ? TenantFeatureStatus.ENABLED : TenantFeatureStatus.DISABLED,
        enabledAt: isEnabled ? new Date() : null,
        disabledAt: isEnabled ? null : new Date(),
        limits: feature.code === 'ANALYTICS' ? { snapshotRetentionDays: 365 } : undefined,
        configuration: {
          demo: true,
          navigationOrder: platformFeatures.findIndex(([code]) => code === feature.code) + 1,
        },
      },
      update: {
        status: isEnabled ? TenantFeatureStatus.ENABLED : TenantFeatureStatus.DISABLED,
        enabledAt: isEnabled ? new Date() : null,
        disabledAt: isEnabled ? null : new Date(),
        configuration: {
          demo: true,
          navigationOrder: platformFeatures.findIndex(([code]) => code === feature.code) + 1,
        },
      },
    });
  }
}

async function ensureTenantRoles(
  tenantId: string,
  permissionByCode: Map<string, Permission>,
): Promise<Map<string, Role>> {
  const roleNames: Record<string, string> = {
    TENANT_ADMIN: 'Tenant Admin',
    HR_ADMIN: 'HR Admin',
    MANAGER: 'Manager',
    EMPLOYEE: 'Employee',
  };
  const roles = new Map<string, Role>();

  for (const [code, permissionCodes] of Object.entries(tenantRolePermissions)) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId, code } },
      create: {
        tenantId,
        code,
        name: roleNames[code] ?? code,
        scope: RoleScope.TENANT,
        isSystem: true,
        isActive: true,
        description: `Demo ${roleNames[code] ?? code} role.`,
      },
      update: {
        name: roleNames[code] ?? code,
        scope: RoleScope.TENANT,
        isSystem: true,
        isActive: true,
        deletedAt: null,
      },
    });

    roles.set(code, role);
    const resolvedPermissionIds: string[] = [];

    for (const permissionCode of permissionCodes) {
      const permission = permissionByCode.get(permissionCode);

      if (!permission) {
        continue;
      }

      resolvedPermissionIds.push(permission.id);

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
        update: {},
      });
    }

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: {
          notIn: resolvedPermissionIds,
        },
      },
    });
  }

  return roles;
}

async function hashDemoPassword() {
  return argon2.hash(demoPassword, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

async function ensureUsersPeopleAndEmployees(
  tenantId: string,
  roles: Map<string, Role>,
  countryId: string,
): Promise<Map<string, DemoUserBundle>> {
  const passwordHash = await hashDemoPassword();
  const bundles = new Map<string, DemoUserBundle>();

  for (const demoUser of demoUsers) {
    const role = roles.get(demoUser.roleCode);

    if (!role) {
      throw new Error(`Missing role ${demoUser.roleCode}`);
    }

    const user = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId,
          email: demoUser.email,
        },
      },
      create: {
        tenantId,
        email: demoUser.email,
        username: demoUser.username,
        passwordHash,
        type: UserType.TENANT_USER,
        status: UserStatus.ACTIVE,
        authProvider: AuthProvider.LOCAL,
        emailVerifiedAt: new Date(),
        metadata: {
          demo: true,
          persona: demoUser.roleCode,
        },
      },
      update: {
        username: demoUser.username,
        passwordHash,
        status: UserStatus.ACTIVE,
        type: UserType.TENANT_USER,
        authProvider: AuthProvider.LOCAL,
        deletedAt: null,
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId_scope_scopeId: {
          userId: user.id,
          roleId: role.id,
          scope: RoleScope.TENANT,
          scopeId: '',
        },
      },
      create: {
        userId: user.id,
        roleId: role.id,
        scope: RoleScope.TENANT,
        scopeId: '',
      },
      update: {
        endsAt: null,
      },
    });

    const person = await prisma.person.upsert({
      where: { userId: user.id },
      create: {
        tenantId,
        userId: user.id,
        firstName: demoUser.firstName,
        lastName: demoUser.lastName,
        preferredName: demoUser.firstName,
        nationalityId: countryId,
        bio: `${demoUser.title} in the Acme Health Group demo tenant.`,
        metadata: {
          demo: true,
          persona: demoUser.roleCode,
        },
      },
      update: {
        firstName: demoUser.firstName,
        lastName: demoUser.lastName,
        preferredName: demoUser.firstName,
        nationalityId: countryId,
        deletedAt: null,
        bio: `${demoUser.title} in the Acme Health Group demo tenant.`,
      },
    });

    const employee = await prisma.employee.upsert({
      where: {
        tenantId_employeeNumber: {
          tenantId,
          employeeNumber: demoUser.employeeNumber,
        },
      },
      create: {
        tenantId,
        personId: person.id,
        userId: user.id,
        employeeNumber: demoUser.employeeNumber,
        status: EmployeeStatus.ACTIVE,
        employmentType: demoUser.employmentType,
        hireDate: effectiveFrom,
        confirmationDate: new Date('2026-04-01T00:00:00.000Z'),
        source: 'Demo workforce seed',
        metadata: {
          demo: true,
          title: demoUser.title,
        },
      },
      update: {
        personId: person.id,
        userId: user.id,
        status: EmployeeStatus.ACTIVE,
        employmentType: demoUser.employmentType,
        hireDate: effectiveFrom,
        confirmationDate: new Date('2026-04-01T00:00:00.000Z'),
        endDate: null,
        separationReason: null,
        deletedAt: null,
        metadata: {
          demo: true,
          title: demoUser.title,
        },
      },
    });

    await ensurePersonDetails(person.id, demoUser.email, countryId);

    bundles.set(demoUser.roleCode, { user, employee, role });
  }

  return bundles;
}

async function ensurePersonDetails(personId: string, email: string, countryId: string) {
  await ensurePrimaryPersonContact(personId, 'email', email);
  await ensurePrimaryPersonContact(personId, 'phone', '+1-312-555-0199');

  const address = await prisma.personAddress.findFirst({
    where: { personId, type: 'WORK' },
  });
  const addressData = {
    type: 'WORK',
    line1: '100 Workforce Plaza',
    line2: 'Suite 800',
    city: 'Chicago',
    state: 'IL',
    postalCode: '60601',
    countryId,
    isPrimary: true,
  };

  if (address) {
    await prisma.personAddress.update({
      where: { id: address.id },
      data: addressData,
    });
  } else {
    await prisma.personAddress.create({
      data: { personId, ...addressData },
    });
  }

  await prisma.personLanguage.upsert({
    where: {
      personId_languageCode: {
        personId,
        languageCode: 'en',
      },
    },
    create: {
      personId,
      languageCode: 'en',
      proficiency: 'NATIVE',
    },
    update: {
      proficiency: 'NATIVE',
    },
  });
}

async function ensurePrimaryPersonContact(personId: string, type: string, value: string) {
  const contact = await prisma.personContact.findFirst({
    where: { personId, type, value },
  });

  if (contact) {
    await prisma.personContact.update({
      where: { id: contact.id },
      data: { isPrimary: true, verifiedAt: new Date() },
    });
  } else {
    await prisma.personContact.create({
      data: {
        personId,
        type,
        value,
        isPrimary: true,
        verifiedAt: new Date(),
      },
    });
  }
}

async function ensureOrganization(
  tenantId: string,
  reference: Awaited<ReturnType<typeof ensureReferenceData>>,
): Promise<Map<string, OrganizationNode>> {
  const nodes = new Map<string, OrganizationNode>();

  const company = await ensureOrganizationNode(tenantId, {
    code: 'ACME',
    name: 'Acme Health Group',
    type: OrganizationNodeType.COMPANY,
    countryId: reference.country.id,
    stateId: reference.state.id,
    cityId: reference.city.id,
  });
  nodes.set(company.code, company);

  const region = await ensureOrganizationNode(tenantId, {
    code: 'US-CENTRAL',
    name: 'US Central Region',
    type: OrganizationNodeType.REGION,
    parentId: company.id,
    countryId: reference.country.id,
  });
  nodes.set(region.code, region);

  const branch = await ensureOrganizationNode(tenantId, {
    code: 'CHI-MED',
    name: 'Chicago Medical Operations',
    type: OrganizationNodeType.BRANCH,
    parentId: region.id,
    countryId: reference.country.id,
    stateId: reference.state.id,
    cityId: reference.city.id,
  });
  nodes.set(branch.code, branch);

  const division = await ensureOrganizationNode(tenantId, {
    code: 'OPS',
    name: 'Operations Division',
    type: OrganizationNodeType.DIVISION,
    parentId: branch.id,
  });
  nodes.set(division.code, division);

  const people = await ensureOrganizationNode(tenantId, {
    code: 'PEOPLE',
    name: 'People Operations',
    type: OrganizationNodeType.DEPARTMENT,
    parentId: division.id,
  });
  nodes.set(people.code, people);

  const care = await ensureOrganizationNode(tenantId, {
    code: 'CARE',
    name: 'Care Coordination Team',
    type: OrganizationNodeType.TEAM,
    parentId: division.id,
  });
  nodes.set(care.code, care);

  return nodes;
}

async function ensureOrganizationNode(
  tenantId: string,
  data: {
    code: string;
    name: string;
    type: OrganizationNodeType;
    parentId?: string;
    countryId?: string;
    stateId?: string;
    cityId?: string;
  },
) {
  return prisma.organizationNode.upsert({
    where: {
      tenantId_code: {
        tenantId,
        code: data.code,
      },
    },
    create: {
      tenantId,
      code: data.code,
      name: data.name,
      type: data.type,
      parentId: data.parentId,
      countryId: data.countryId,
      stateId: data.stateId,
      cityId: data.cityId,
      address: data.cityId
        ? {
            line1: '100 Workforce Plaza',
            city: 'Chicago',
            state: 'IL',
            postalCode: '60601',
          }
        : undefined,
      isActive: true,
      metadata: { demo: true },
    },
    update: {
      name: data.name,
      type: data.type,
      parentId: data.parentId,
      countryId: data.countryId,
      stateId: data.stateId,
      cityId: data.cityId,
      isActive: true,
      deletedAt: null,
      metadata: { demo: true },
    },
  });
}

async function ensureCostCenter(tenantId: string, code: string, name: string, organizationNodeId: string) {
  return prisma.costCenter.upsert({
    where: { tenantId_code: { tenantId, code } },
    create: {
      tenantId,
      code,
      name,
      organizationNodeId,
      description: `${name} demo cost center.`,
      metadata: { demo: true },
    },
    update: {
      name,
      organizationNodeId,
      isActive: true,
      deletedAt: null,
      metadata: { demo: true },
    },
  });
}

async function ensurePositions(
  tenantId: string,
  nodes: Map<string, OrganizationNode>,
): Promise<Map<string, Position>> {
  const peopleNode = requireNode(nodes, 'PEOPLE');
  const careNode = requireNode(nodes, 'CARE');
  const peopleCostCenter = await ensureCostCenter(tenantId, 'CC-PEOPLE', 'People Operations', peopleNode.id);
  const careCostCenter = await ensureCostCenter(tenantId, 'CC-CARE', 'Care Coordination', careNode.id);

  const gradeG7 = await prisma.positionGrade.upsert({
    where: { tenantId_code: { tenantId, code: 'G7' } },
    create: { tenantId, code: 'G7', name: 'Senior Leadership', rank: 7, metadata: { demo: true } },
    update: { name: 'Senior Leadership', rank: 7, deletedAt: null },
  });
  const gradeG5 = await prisma.positionGrade.upsert({
    where: { tenantId_code: { tenantId, code: 'G5' } },
    create: { tenantId, code: 'G5', name: 'Professional', rank: 5, metadata: { demo: true } },
    update: { name: 'Professional', rank: 5, deletedAt: null },
  });
  const levelL3 = await prisma.positionLevel.upsert({
    where: { tenantId_code: { tenantId, code: 'L3' } },
    create: { tenantId, code: 'L3', name: 'Lead', rank: 3, metadata: { demo: true } },
    update: { name: 'Lead', rank: 3, deletedAt: null },
  });
  const levelL2 = await prisma.positionLevel.upsert({
    where: { tenantId_code: { tenantId, code: 'L2' } },
    create: { tenantId, code: 'L2', name: 'Specialist', rank: 2, metadata: { demo: true } },
    update: { name: 'Specialist', rank: 2, deletedAt: null },
  });

  const positions = new Map<string, Position>();
  const hrLead = await ensurePosition(tenantId, {
    code: 'POS-HR-LEAD',
    title: 'People Operations Lead',
    organizationNodeId: peopleNode.id,
    costCenterId: peopleCostCenter.id,
    gradeId: gradeG7.id,
    levelId: levelL3.id,
    budgetedHeadcount: 1,
    isCritical: true,
  });
  positions.set(hrLead.code, hrLead);

  const careManager = await ensurePosition(tenantId, {
    code: 'POS-CARE-MGR',
    title: 'Care Team Manager',
    organizationNodeId: careNode.id,
    costCenterId: careCostCenter.id,
    gradeId: gradeG7.id,
    levelId: levelL3.id,
    budgetedHeadcount: 1,
    isCritical: true,
    reportsToPositionId: hrLead.id,
  });
  positions.set(careManager.code, careManager);

  const careSpecialist = await ensurePosition(tenantId, {
    code: 'POS-CARE-SPEC',
    title: 'Care Specialist',
    organizationNodeId: careNode.id,
    costCenterId: careCostCenter.id,
    gradeId: gradeG5.id,
    levelId: levelL2.id,
    budgetedHeadcount: 8,
    reportsToPositionId: careManager.id,
  });
  positions.set(careSpecialist.code, careSpecialist);

  await ensurePositionSkills(tenantId, positions);

  return positions;
}

async function ensurePosition(
  tenantId: string,
  data: {
    code: string;
    title: string;
    organizationNodeId: string;
    costCenterId: string;
    gradeId: string;
    levelId: string;
    budgetedHeadcount: number;
    isCritical?: boolean;
    reportsToPositionId?: string;
  },
) {
  return prisma.position.upsert({
    where: { tenantId_code: { tenantId, code: data.code } },
    create: {
      tenantId,
      code: data.code,
      title: data.title,
      status: PositionStatus.ACTIVE,
      organizationNodeId: data.organizationNodeId,
      costCenterId: data.costCenterId,
      gradeId: data.gradeId,
      levelId: data.levelId,
      reportsToPositionId: data.reportsToPositionId,
      budgetedHeadcount: data.budgetedHeadcount,
      isCritical: data.isCritical ?? false,
      metadata: { demo: true },
    },
    update: {
      title: data.title,
      status: PositionStatus.ACTIVE,
      organizationNodeId: data.organizationNodeId,
      costCenterId: data.costCenterId,
      gradeId: data.gradeId,
      levelId: data.levelId,
      reportsToPositionId: data.reportsToPositionId,
      budgetedHeadcount: data.budgetedHeadcount,
      isCritical: data.isCritical ?? false,
      deletedAt: null,
      metadata: { demo: true },
    },
  });
}

async function ensurePositionSkills(tenantId: string, positions: Map<string, Position>) {
  const skills = await Promise.all([
    ensureSkill(tenantId, 'People Operations', 'Functional'),
    ensureSkill(tenantId, 'Care Coordination', 'Functional'),
    ensureSkill(tenantId, 'Compliance Management', 'Compliance'),
  ]);
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const skillMatrix = [
    ['POS-HR-LEAD', 'People Operations'],
    ['POS-HR-LEAD', 'Compliance Management'],
    ['POS-CARE-MGR', 'Care Coordination'],
    ['POS-CARE-MGR', 'Compliance Management'],
    ['POS-CARE-SPEC', 'Care Coordination'],
  ] as const;

  for (const [positionCode, skillName] of skillMatrix) {
    const position = positions.get(positionCode);
    const skill = byName.get(skillName);

    if (!position || !skill) {
      continue;
    }

    await prisma.positionSkill.upsert({
      where: {
        positionId_skillId: {
          positionId: position.id,
          skillId: skill.id,
        },
      },
      create: {
        positionId: position.id,
        skillId: skill.id,
        required: true,
        minimumProficiency: 'INTERMEDIATE',
      },
      update: {
        required: true,
        minimumProficiency: 'INTERMEDIATE',
      },
    });
  }
}

async function ensureSkill(tenantId: string, name: string, category: string) {
  return prisma.skill.upsert({
    where: { tenantId_name: { tenantId, name } },
    create: { tenantId, name, category },
    update: { category },
  });
}

async function ensureAssignments(
  tenantId: string,
  nodes: Map<string, OrganizationNode>,
  positions: Map<string, Position>,
  bundles: Map<string, DemoUserBundle>,
) {
  const peopleNode = requireNode(nodes, 'PEOPLE');
  const careNode = requireNode(nodes, 'CARE');
  const peopleCostCenter = await prisma.costCenter.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code: 'CC-PEOPLE' } },
  });
  const careCostCenter = await prisma.costCenter.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code: 'CC-CARE' } },
  });
  const hrLead = requirePosition(positions, 'POS-HR-LEAD');
  const careManagerPosition = requirePosition(positions, 'POS-CARE-MGR');
  const careSpecialist = requirePosition(positions, 'POS-CARE-SPEC');
  const hrAdmin = requireBundle(bundles, 'HR_ADMIN');
  const manager = requireBundle(bundles, 'MANAGER');

  await ensureLeadershipDesignation(
    tenantId,
    hrAdmin.employee,
    WorkforceLeadershipRole.MANAGER,
    peopleNode.id,
    'Demo people operations manager eligibility',
  );
  await ensureLeadershipDesignation(
    tenantId,
    hrAdmin.employee,
    WorkforceLeadershipRole.DEPARTMENT_HEAD,
    peopleNode.id,
    'Demo people department head eligibility',
  );
  await ensureLeadershipDesignation(
    tenantId,
    manager.employee,
    WorkforceLeadershipRole.MANAGER,
    careNode.id,
    'Demo care manager eligibility',
  );
  await ensureLeadershipDesignation(
    tenantId,
    manager.employee,
    WorkforceLeadershipRole.SUPERVISOR,
    careNode.id,
    'Demo care supervisor eligibility',
  );
  await ensureLeadershipDesignation(
    tenantId,
    manager.employee,
    WorkforceLeadershipRole.UNIT_HEAD,
    careNode.id,
    'Demo care unit head eligibility',
  );

  await ensureEmployeeAssignment(tenantId, requireBundle(bundles, 'TENANT_ADMIN').employee, {
    positionId: hrLead.id,
    organizationNodeId: peopleNode.id,
    costCenterId: peopleCostCenter.id,
    managerEmployeeId: hrAdmin.employee.id,
    reason: 'Demo tenant administration assignment',
  });

  await ensureEmployeeAssignment(tenantId, hrAdmin.employee, {
    positionId: hrLead.id,
    organizationNodeId: peopleNode.id,
    costCenterId: peopleCostCenter.id,
    reason: 'Demo people operations assignment',
  });

  await ensureEmployeeAssignment(tenantId, manager.employee, {
    positionId: careManagerPosition.id,
    organizationNodeId: careNode.id,
    costCenterId: careCostCenter.id,
    managerEmployeeId: hrAdmin.employee.id,
    reason: 'Demo care manager assignment',
  });

  await ensureEmployeeAssignment(tenantId, requireBundle(bundles, 'EMPLOYEE').employee, {
    positionId: careSpecialist.id,
    organizationNodeId: careNode.id,
    costCenterId: careCostCenter.id,
    managerEmployeeId: manager.employee.id,
    supervisorEmployeeId: manager.employee.id,
    unitHeadEmployeeId: manager.employee.id,
    reason: 'Demo care specialist assignment',
  });
}

async function ensureLeadershipDesignation(
  tenantId: string,
  employee: Employee,
  role: WorkforceLeadershipRole,
  organizationNodeId: string | null,
  reason: string,
) {
  const existing = await prisma.employeeLeadershipDesignation.findFirst({
    where: {
      tenantId,
      employeeId: employee.id,
      role,
      organizationNodeId,
    },
  });

  const data = {
    tenantId,
    employeeId: employee.id,
    role,
    organizationNodeId,
    startsAt: effectiveFrom,
    endsAt: null,
    isActive: true,
    reason,
    metadata: { demo: true },
  };

  if (existing) {
    await prisma.employeeLeadershipDesignation.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.employeeLeadershipDesignation.create({ data });
  }
}

async function ensureEmployeeAssignment(
  tenantId: string,
  employee: Employee,
  data: {
    positionId: string;
    organizationNodeId: string;
    costCenterId: string;
    managerEmployeeId?: string;
    supervisorEmployeeId?: string;
    unitHeadEmployeeId?: string;
    reason: string;
  },
) {
  const existing = await prisma.employeeAssignment.findFirst({
    where: {
      tenantId,
      employeeId: employee.id,
      type: AssignmentType.PRIMARY,
      effectiveTo: null,
    },
  });

  const assignmentData = {
    tenantId,
    employeeId: employee.id,
    type: AssignmentType.PRIMARY,
    positionId: data.positionId,
    organizationNodeId: data.organizationNodeId,
    costCenterId: data.costCenterId,
    managerEmployeeId: data.managerEmployeeId,
    supervisorEmployeeId: data.supervisorEmployeeId,
    unitHeadEmployeeId: data.unitHeadEmployeeId,
    effectiveFrom,
    effectiveTo: null,
    isPrimary: true,
    reason: data.reason,
    metadata: { demo: true },
  };

  if (existing) {
    await prisma.employeeAssignment.update({
      where: { id: existing.id },
      data: assignmentData,
    });
  } else {
    await prisma.employeeAssignment.create({
      data: assignmentData,
    });
  }
}

async function ensureLifecycleTemplates(tenantId: string, bundles: Map<string, DemoUserBundle>) {
  const hrAdmin = requireBundle(bundles, 'HR_ADMIN');
  const templates = [
    {
      code: 'STANDARD_ONBOARDING',
      name: 'Standard employee onboarding',
      type: EmployeeLifecyclePlanType.ONBOARDING,
      targetDays: 14,
      description: 'Core first-week onboarding controls for employees, managers, HR, IT, and finance.',
      tasks: [
        ['Verify profile and emergency contacts', EmployeeLifecycleTaskOwnerType.EMPLOYEE, EmployeeLifecycleTaskPriority.NORMAL, 1, 'Profile readiness'],
        ['Confirm assignment and manager', EmployeeLifecycleTaskOwnerType.HR, EmployeeLifecycleTaskPriority.HIGH, 1, 'Assignment'],
        ['Prepare systems access', EmployeeLifecycleTaskOwnerType.IT, EmployeeLifecycleTaskPriority.HIGH, 2, 'Access'],
        ['Verify payout and statutory records', EmployeeLifecycleTaskOwnerType.FINANCE, EmployeeLifecycleTaskPriority.HIGH, 5, 'Pay readiness'],
        ['Complete manager check-in', EmployeeLifecycleTaskOwnerType.MANAGER, EmployeeLifecycleTaskPriority.NORMAL, 7, 'Manager readiness'],
      ],
    },
    {
      code: 'STANDARD_OFFBOARDING',
      name: 'Standard offboarding clearance',
      type: EmployeeLifecyclePlanType.OFFBOARDING,
      targetDays: 10,
      description: 'Exit controls for access removal, asset recovery, final documents, finance clearance, and knowledge transfer.',
      tasks: [
        ['Confirm final working date and exit notes', EmployeeLifecycleTaskOwnerType.HR, EmployeeLifecycleTaskPriority.HIGH, 0, 'Exit governance'],
        ['Revoke systems access', EmployeeLifecycleTaskOwnerType.IT, EmployeeLifecycleTaskPriority.CRITICAL, 1, 'Access'],
        ['Recover assigned assets', EmployeeLifecycleTaskOwnerType.IT, EmployeeLifecycleTaskPriority.HIGH, 2, 'Assets'],
        ['Complete final finance review', EmployeeLifecycleTaskOwnerType.FINANCE, EmployeeLifecycleTaskPriority.HIGH, 3, 'Finance'],
        ['Complete handover and knowledge transfer', EmployeeLifecycleTaskOwnerType.MANAGER, EmployeeLifecycleTaskPriority.HIGH, 3, 'Knowledge transfer'],
      ],
    },
    {
      code: 'REHIRE_READINESS',
      name: 'Rehire readiness review',
      type: EmployeeLifecyclePlanType.REHIRE,
      targetDays: 7,
      description: 'Review alumni status, eligibility, records, assignments, and updated compliance before rehire.',
      tasks: [
        ['Review alumni and rehire eligibility', EmployeeLifecycleTaskOwnerType.HR, EmployeeLifecycleTaskPriority.HIGH, 0, 'Alumni review'],
        ['Refresh statutory and payout records', EmployeeLifecycleTaskOwnerType.FINANCE, EmployeeLifecycleTaskPriority.HIGH, 2, 'Pay readiness'],
        ['Approve assignment and reporting line', EmployeeLifecycleTaskOwnerType.MANAGER, EmployeeLifecycleTaskPriority.NORMAL, 3, 'Assignment'],
      ],
    },
  ] as const;

  for (const templateInput of templates) {
    const template = await prisma.employeeLifecycleTemplate.upsert({
      where: {
        tenantId_code: {
          tenantId,
          code: templateInput.code,
        },
      },
      create: {
        tenantId,
        code: templateInput.code,
        name: templateInput.name,
        type: templateInput.type,
        status: EmployeeLifecycleTemplateStatus.ACTIVE,
        targetDays: templateInput.targetDays,
        description: templateInput.description,
        createdById: hrAdmin.user.id,
        updatedById: hrAdmin.user.id,
        metadata: { demo: true },
      },
      update: {
        name: templateInput.name,
        type: templateInput.type,
        status: EmployeeLifecycleTemplateStatus.ACTIVE,
        targetDays: templateInput.targetDays,
        description: templateInput.description,
        updatedById: hrAdmin.user.id,
        deletedAt: null,
        metadata: { demo: true },
      },
    });

    await prisma.employeeLifecycleTemplateTask.deleteMany({
      where: { templateId: template.id },
    });

    await prisma.employeeLifecycleTemplateTask.createMany({
      data: templateInput.tasks.map(([title, ownerType, priority, dueOffsetDays, category], index) => ({
        templateId: template.id,
        title,
        ownerType,
        priority,
        dueOffsetDays,
        category,
        sortOrder: index + 1,
        requiresDocument: false,
        metadata: { demo: true },
      })),
    });
  }
}

async function ensureWorkflow(tenantId: string, roles: Map<string, Role>) {
  const workflow = await prisma.workflow.upsert({
    where: { tenantId_code: { tenantId, code: 'EMPLOYEE_LIFECYCLE' } },
    create: {
      tenantId,
      code: 'EMPLOYEE_LIFECYCLE',
      name: 'Employee Lifecycle Change',
      description: 'Demo lifecycle workflow for hiring, transfer, promotion, and separation actions.',
      module: 'employees',
      status: WorkflowStatus.ACTIVE,
      triggerKey: 'employee.lifecycle.change',
      conditions: { demo: true, appliesTo: ['TRANSFER', 'PROMOTION', 'SEPARATION'] },
      metadata: { demo: true },
    },
    update: {
      name: 'Employee Lifecycle Change',
      description: 'Demo lifecycle workflow for hiring, transfer, promotion, and separation actions.',
      module: 'employees',
      status: WorkflowStatus.ACTIVE,
      triggerKey: 'employee.lifecycle.change',
      conditions: { demo: true, appliesTo: ['TRANSFER', 'PROMOTION', 'SEPARATION'] },
      deletedAt: null,
      metadata: { demo: true },
    },
  });

  await prisma.workflowStep.upsert({
    where: { workflowId_stepOrder: { workflowId: workflow.id, stepOrder: 1 } },
    create: {
      workflowId: workflow.id,
      stepOrder: 1,
      name: 'HR review',
      type: WorkflowStepType.REVIEW,
      approverRoleId: roles.get('HR_ADMIN')?.id,
      isRequired: true,
      allowDelegation: true,
      slaHours: 24,
      metadata: { demo: true },
    },
    update: {
      name: 'HR review',
      type: WorkflowStepType.REVIEW,
      approverRoleId: roles.get('HR_ADMIN')?.id,
      isRequired: true,
      allowDelegation: true,
      slaHours: 24,
      metadata: { demo: true },
    },
  });

  await prisma.workflowStep.upsert({
    where: { workflowId_stepOrder: { workflowId: workflow.id, stepOrder: 2 } },
    create: {
      workflowId: workflow.id,
      stepOrder: 2,
      name: 'Manager approval',
      type: WorkflowStepType.APPROVAL,
      approverRoleId: roles.get('MANAGER')?.id,
      isRequired: true,
      allowDelegation: true,
      slaHours: 48,
      metadata: { demo: true },
    },
    update: {
      name: 'Manager approval',
      type: WorkflowStepType.APPROVAL,
      approverRoleId: roles.get('MANAGER')?.id,
      isRequired: true,
      allowDelegation: true,
      slaHours: 48,
      metadata: { demo: true },
    },
  });

  return workflow;
}

async function ensureLeaveDemoData(
  tenantId: string,
  roles: Map<string, Role>,
  bundles: Map<string, DemoUserBundle>,
) {
  const leaveWorkflow = await prisma.workflow.upsert({
    where: { tenantId_code: { tenantId, code: 'LEAVE_STANDARD' } },
    create: {
      tenantId,
      code: 'LEAVE_STANDARD',
      name: 'Standard Leave Approval',
      description: 'Employee leave requests route first to the manager, then to HR for final review.',
      module: 'leave',
      status: WorkflowStatus.ACTIVE,
      triggerKey: 'leave.request.submitted',
      conditions: { demo: true, appliesTo: ['PTO', 'SICK'] },
      metadata: { demo: true, template: true, stages: ['manager', 'hr'] },
    },
    update: {
      name: 'Standard Leave Approval',
      description: 'Employee leave requests route first to the manager, then to HR for final review.',
      module: 'leave',
      status: WorkflowStatus.ACTIVE,
      triggerKey: 'leave.request.submitted',
      deletedAt: null,
      conditions: { demo: true, appliesTo: ['PTO', 'SICK'] },
      metadata: { demo: true, template: true, stages: ['manager', 'hr'] },
    },
  });

  const managerStep = await prisma.workflowStep.upsert({
    where: { workflowId_stepOrder: { workflowId: leaveWorkflow.id, stepOrder: 1 } },
    create: {
      workflowId: leaveWorkflow.id,
      stepOrder: 1,
      name: 'Manager approval',
      type: WorkflowStepType.APPROVAL,
      approverExpression: { expression: 'employee.manager' },
      isRequired: true,
      allowDelegation: true,
      slaHours: 24,
      metadata: { demo: true },
    },
    update: {
      name: 'Manager approval',
      type: WorkflowStepType.APPROVAL,
      approverUserId: null,
      approverRoleId: null,
      approverExpression: { expression: 'employee.manager' },
      isRequired: true,
      allowDelegation: true,
      slaHours: 24,
      metadata: { demo: true },
    },
  });

  const hrStep = await prisma.workflowStep.upsert({
    where: { workflowId_stepOrder: { workflowId: leaveWorkflow.id, stepOrder: 2 } },
    create: {
      workflowId: leaveWorkflow.id,
      stepOrder: 2,
      name: 'HR final review',
      type: WorkflowStepType.REVIEW,
      approverRoleId: roles.get('HR_ADMIN')?.id,
      isRequired: true,
      allowDelegation: true,
      slaHours: 48,
      metadata: { demo: true },
    },
    update: {
      name: 'HR final review',
      type: WorkflowStepType.REVIEW,
      approverRoleId: roles.get('HR_ADMIN')?.id,
      approverExpression: null,
      isRequired: true,
      allowDelegation: true,
      slaHours: 48,
      metadata: { demo: true },
    },
  });

  const ptoType = await prisma.leaveType.upsert({
    where: { tenantId_code: { tenantId, code: 'PTO' } },
    create: {
      tenantId,
      code: 'PTO',
      name: 'Paid Time Off',
      description: 'General vacation and personal time tracked in hours.',
      category: 'PTO',
      unit: LeaveTypeUnit.DAYS,
      status: LeavePolicyStatus.ACTIVE,
      paid: true,
      color: '#4b22e8',
      metadata: { demo: true },
    },
    update: {
      name: 'Paid Time Off',
      description: 'General vacation and personal time tracked in hours.',
      category: 'PTO',
      unit: LeaveTypeUnit.DAYS,
      status: LeavePolicyStatus.ACTIVE,
      paid: true,
      requiresDocumentation: false,
      color: '#4b22e8',
      deletedAt: null,
      metadata: { demo: true },
    },
  });

  const sickType = await prisma.leaveType.upsert({
    where: { tenantId_code: { tenantId, code: 'SICK' } },
    create: {
      tenantId,
      code: 'SICK',
      name: 'Sick Leave',
      description: 'Medical leave with optional supporting documentation.',
      category: 'SICK',
      unit: LeaveTypeUnit.DAYS,
      status: LeavePolicyStatus.ACTIVE,
      paid: true,
      requiresDocumentation: true,
      color: '#0a8f61',
      metadata: { demo: true },
    },
    update: {
      name: 'Sick Leave',
      description: 'Medical leave with optional supporting documentation.',
      category: 'SICK',
      unit: LeaveTypeUnit.DAYS,
      status: LeavePolicyStatus.ACTIVE,
      paid: true,
      requiresDocumentation: true,
      color: '#0a8f61',
      deletedAt: null,
      metadata: { demo: true },
    },
  });

  const ptoPolicy = await prisma.leavePolicy.upsert({
    where: { tenantId_code: { tenantId, code: 'PTO_STANDARD' } },
    create: {
      tenantId,
      leaveTypeId: ptoType.id,
      code: 'PTO_STANDARD',
      name: 'Standard PTO Policy',
      description: 'Fifteen paid days per year with manager and HR approval.',
      status: LeavePolicyStatus.ACTIVE,
      effectiveFrom,
      annualAllowanceMinutes: 15 * 8 * 60,
      accrualMethod: 'ANNUAL_GRANT',
      carryoverLimitMinutes: 5 * 8 * 60,
      minimumRequestMinutes: 60,
      maximumRequestMinutes: 10 * 8 * 60,
      requiresApproval: true,
      workflowCode: leaveWorkflow.code,
      workflowTriggerKey: 'leave.request.submitted',
      metadata: { demo: true },
    },
    update: {
      leaveTypeId: ptoType.id,
      name: 'Standard PTO Policy',
      description: 'Fifteen paid days per year with manager and HR approval.',
      status: LeavePolicyStatus.ACTIVE,
      effectiveFrom,
      annualAllowanceMinutes: 15 * 8 * 60,
      accrualMethod: 'ANNUAL_GRANT',
      carryoverLimitMinutes: 5 * 8 * 60,
      minimumRequestMinutes: 60,
      maximumRequestMinutes: 10 * 8 * 60,
      requiresApproval: true,
      workflowCode: leaveWorkflow.code,
      workflowTriggerKey: 'leave.request.submitted',
      deletedAt: null,
      metadata: { demo: true },
    },
  });

  const sickPolicy = await prisma.leavePolicy.upsert({
    where: { tenantId_code: { tenantId, code: 'SICK_STANDARD' } },
    create: {
      tenantId,
      leaveTypeId: sickType.id,
      code: 'SICK_STANDARD',
      name: 'Standard Sick Leave Policy',
      description: 'Five paid sick days per year with documented evidence.',
      status: LeavePolicyStatus.ACTIVE,
      effectiveFrom,
      annualAllowanceMinutes: 5 * 8 * 60,
      accrualMethod: 'ANNUAL_GRANT',
      minimumRequestMinutes: 60,
      maximumRequestMinutes: 5 * 8 * 60,
      requiresApproval: true,
      workflowCode: leaveWorkflow.code,
      workflowTriggerKey: 'leave.request.submitted',
      metadata: { demo: true },
    },
    update: {
      leaveTypeId: sickType.id,
      name: 'Standard Sick Leave Policy',
      description: 'Five paid sick days per year with documented evidence.',
      status: LeavePolicyStatus.ACTIVE,
      effectiveFrom,
      annualAllowanceMinutes: 5 * 8 * 60,
      accrualMethod: 'ANNUAL_GRANT',
      minimumRequestMinutes: 60,
      maximumRequestMinutes: 5 * 8 * 60,
      requiresApproval: true,
      workflowCode: leaveWorkflow.code,
      workflowTriggerKey: 'leave.request.submitted',
      deletedAt: null,
      metadata: { demo: true },
    },
  });

  const leaveRules = [
    { type: ptoType, policy: ptoPolicy, code: 'PTO_MANAGER_HR' },
    { type: sickType, policy: sickPolicy, code: 'SICK_MANAGER_HR' },
  ] as const;

  for (const { type, policy, code } of leaveRules) {
    await prisma.leaveApprovalRule.upsert({
      where: { tenantId_code: { tenantId, code } },
      create: {
        tenantId,
        leaveTypeId: type.id,
        policyId: policy.id,
        workflowId: leaveWorkflow.id,
        code,
        name: `${type.name} manager and HR approval`,
        status: LeavePolicyStatus.ACTIVE,
        priority: 200,
        triggerKey: 'leave.request.submitted',
        metadata: { demo: true },
      },
      update: {
        leaveTypeId: type.id,
        policyId: policy.id,
        workflowId: leaveWorkflow.id,
        workflowCode: null,
        name: `${type.name} manager and HR approval`,
        status: LeavePolicyStatus.ACTIVE,
        priority: 200,
        triggerKey: 'leave.request.submitted',
        deletedAt: null,
        metadata: { demo: true },
      },
    });
  }

  await prisma.leaveCalendar.updateMany({
    where: { tenantId, isDefault: true, code: { not: 'US_STANDARD_LEAVE' } },
    data: { isDefault: false },
  });

  const leaveCalendar = await prisma.leaveCalendar.upsert({
    where: { tenantId_code: { tenantId, code: 'US_STANDARD_LEAVE' } },
    create: {
      tenantId,
      code: 'US_STANDARD_LEAVE',
      name: 'US Standard Leave Calendar',
      description: 'Demo Monday-Friday leave calendar with payroll blackout controls.',
      timezone: 'America/Chicago',
      status: LeavePolicyStatus.ACTIVE,
      isDefault: true,
      workWeekdays: [1, 2, 3, 4, 5],
      defaultWorkdayMinutes: 8 * 60,
      countryCode: 'US',
      regionCode: 'IL',
      metadata: { demo: true },
    },
    update: {
      name: 'US Standard Leave Calendar',
      description: 'Demo Monday-Friday leave calendar with payroll blackout controls.',
      timezone: 'America/Chicago',
      status: LeavePolicyStatus.ACTIVE,
      isDefault: true,
      workWeekdays: [1, 2, 3, 4, 5],
      defaultWorkdayMinutes: 8 * 60,
      countryCode: 'US',
      regionCode: 'IL',
      deletedAt: null,
      metadata: { demo: true },
    },
  });

  await prisma.leaveCalendarDay.upsert({
    where: { calendarId_date: { calendarId: leaveCalendar.id, date: new Date('2026-05-25T00:00:00.000Z') } },
    create: {
      tenantId,
      calendarId: leaveCalendar.id,
      date: new Date('2026-05-25T00:00:00.000Z'),
      name: 'Memorial Day',
      type: LeaveCalendarDayType.HOLIDAY,
      paid: true,
      workdayMinutes: 0,
      metadata: { demo: true },
    },
    update: {
      name: 'Memorial Day',
      type: LeaveCalendarDayType.HOLIDAY,
      paid: true,
      workdayMinutes: 0,
      metadata: { demo: true },
    },
  });

  await prisma.leaveBlackoutWindow.upsert({
    where: { tenantId_code: { tenantId, code: 'PAYROLL_CLOSE_MAY_2026' } },
    create: {
      tenantId,
      calendarId: leaveCalendar.id,
      code: 'PAYROLL_CLOSE_MAY_2026',
      name: 'May payroll close',
      description: 'Demo warning window for payroll close staffing review.',
      startsAt: new Date('2026-05-28T00:00:00.000Z'),
      endsAt: new Date('2026-05-31T23:59:59.999Z'),
      severity: LeaveBlackoutSeverity.WARN,
      status: LeavePolicyStatus.ACTIVE,
      metadata: { demo: true },
    },
    update: {
      calendarId: leaveCalendar.id,
      name: 'May payroll close',
      description: 'Demo warning window for payroll close staffing review.',
      startsAt: new Date('2026-05-28T00:00:00.000Z'),
      endsAt: new Date('2026-05-31T23:59:59.999Z'),
      severity: LeaveBlackoutSeverity.WARN,
      status: LeavePolicyStatus.ACTIVE,
      deletedAt: null,
      metadata: { demo: true },
    },
  });

  for (const bundle of bundles.values()) {
    await ensureLeaveBalance(tenantId, bundle, ptoType.id, ptoPolicy.id, 15 * 8 * 60, 'Opening PTO balance for the 2026 demo year.');
    await ensureLeaveBalance(tenantId, bundle, sickType.id, sickPolicy.id, 5 * 8 * 60, 'Opening sick leave balance for the 2026 demo year.');
  }

  await ensureDemoPendingLeaveRequest({
    tenantId,
    workflowId: leaveWorkflow.id,
    managerStepId: managerStep.id,
    hrStepId: hrStep.id,
    employee: requireBundle(bundles, 'EMPLOYEE'),
    manager: requireBundle(bundles, 'MANAGER'),
    hrRoleId: roles.get('HR_ADMIN')?.id,
    leaveTypeId: ptoType.id,
    policyId: ptoPolicy.id,
    calendarId: leaveCalendar.id,
  });
}

async function ensureRecruitmentDemoData(
  tenantId: string,
  roles: Map<string, Role>,
  bundles: Map<string, DemoUserBundle>,
  positions: Map<string, Position>,
) {
  const hrAdmin = requireBundle(bundles, 'HR_ADMIN');
  const manager = requireBundle(bundles, 'MANAGER');
  const careSpecialist = positions.get('POS-CARE-SPEC');
  const hrLead = positions.get('POS-HR-LEAD');

  const requisitionWorkflow = await prisma.workflow.upsert({
    where: { tenantId_code: { tenantId, code: 'RECRUITMENT_REQUISITION_APPROVAL' } },
    create: {
      tenantId,
      code: 'RECRUITMENT_REQUISITION_APPROVAL',
      name: 'Recruitment Requisition Approval',
      description: 'Hiring requests route through HR intake and manager approval before opening.',
      module: 'recruitment',
      status: WorkflowStatus.ACTIVE,
      triggerKey: 'recruitment.requisition.submitted',
      conditions: { demo: true, appliesTo: ['REQUISITION'] },
      metadata: { demo: true, template: true, stages: ['hr', 'manager'] },
    },
    update: {
      name: 'Recruitment Requisition Approval',
      description: 'Hiring requests route through HR intake and manager approval before opening.',
      module: 'recruitment',
      status: WorkflowStatus.ACTIVE,
      triggerKey: 'recruitment.requisition.submitted',
      deletedAt: null,
      conditions: { demo: true, appliesTo: ['REQUISITION'] },
      metadata: { demo: true, template: true, stages: ['hr', 'manager'] },
    },
  });

  const requisitionHrStep = await prisma.workflowStep.upsert({
    where: { workflowId_stepOrder: { workflowId: requisitionWorkflow.id, stepOrder: 1 } },
    create: {
      workflowId: requisitionWorkflow.id,
      stepOrder: 1,
      name: 'HR intake review',
      type: WorkflowStepType.REVIEW,
      approverRoleId: roles.get('HR_ADMIN')?.id,
      isRequired: true,
      allowDelegation: true,
      slaHours: 24,
      metadata: { demo: true },
    },
    update: {
      name: 'HR intake review',
      type: WorkflowStepType.REVIEW,
      approverRoleId: roles.get('HR_ADMIN')?.id,
      approverExpression: null,
      isRequired: true,
      allowDelegation: true,
      slaHours: 24,
      metadata: { demo: true },
    },
  });

  const requisitionManagerStep = await prisma.workflowStep.upsert({
    where: { workflowId_stepOrder: { workflowId: requisitionWorkflow.id, stepOrder: 2 } },
    create: {
      workflowId: requisitionWorkflow.id,
      stepOrder: 2,
      name: 'Hiring manager approval',
      type: WorkflowStepType.APPROVAL,
      approverRoleId: roles.get('MANAGER')?.id,
      isRequired: true,
      allowDelegation: true,
      slaHours: 48,
      metadata: { demo: true },
    },
    update: {
      name: 'Hiring manager approval',
      type: WorkflowStepType.APPROVAL,
      approverRoleId: roles.get('MANAGER')?.id,
      approverExpression: null,
      isRequired: true,
      allowDelegation: true,
      slaHours: 48,
      metadata: { demo: true },
    },
  });

  const offerWorkflow = await prisma.workflow.upsert({
    where: { tenantId_code: { tenantId, code: 'RECRUITMENT_OFFER_APPROVAL' } },
    create: {
      tenantId,
      code: 'RECRUITMENT_OFFER_APPROVAL',
      name: 'Recruitment Offer Approval',
      description: 'Offer packages route to HR and tenant administration before extension.',
      module: 'recruitment',
      status: WorkflowStatus.ACTIVE,
      triggerKey: 'recruitment.offer.submitted',
      conditions: { demo: true, appliesTo: ['OFFER'] },
      metadata: { demo: true, template: true, stages: ['hr', 'tenant-admin'] },
    },
    update: {
      name: 'Recruitment Offer Approval',
      description: 'Offer packages route to HR and tenant administration before extension.',
      module: 'recruitment',
      status: WorkflowStatus.ACTIVE,
      triggerKey: 'recruitment.offer.submitted',
      deletedAt: null,
      conditions: { demo: true, appliesTo: ['OFFER'] },
      metadata: { demo: true, template: true, stages: ['hr', 'tenant-admin'] },
    },
  });

  const offerHrStep = await prisma.workflowStep.upsert({
    where: { workflowId_stepOrder: { workflowId: offerWorkflow.id, stepOrder: 1 } },
    create: {
      workflowId: offerWorkflow.id,
      stepOrder: 1,
      name: 'HR compensation review',
      type: WorkflowStepType.REVIEW,
      approverRoleId: roles.get('HR_ADMIN')?.id,
      isRequired: true,
      allowDelegation: true,
      slaHours: 24,
      metadata: { demo: true },
    },
    update: {
      name: 'HR compensation review',
      type: WorkflowStepType.REVIEW,
      approverRoleId: roles.get('HR_ADMIN')?.id,
      approverExpression: null,
      isRequired: true,
      allowDelegation: true,
      slaHours: 24,
      metadata: { demo: true },
    },
  });

  const offerAdminStep = await prisma.workflowStep.upsert({
    where: { workflowId_stepOrder: { workflowId: offerWorkflow.id, stepOrder: 2 } },
    create: {
      workflowId: offerWorkflow.id,
      stepOrder: 2,
      name: 'Tenant admin approval',
      type: WorkflowStepType.APPROVAL,
      approverRoleId: roles.get('TENANT_ADMIN')?.id,
      isRequired: true,
      allowDelegation: true,
      slaHours: 48,
      metadata: { demo: true },
    },
    update: {
      name: 'Tenant admin approval',
      type: WorkflowStepType.APPROVAL,
      approverRoleId: roles.get('TENANT_ADMIN')?.id,
      approverExpression: null,
      isRequired: true,
      allowDelegation: true,
      slaHours: 48,
      metadata: { demo: true },
    },
  });

  await prisma.recruitmentApprovalRule.upsert({
    where: { tenantId_code: { tenantId, code: 'STANDARD_REQUISITION_APPROVAL' } },
    create: {
      tenantId,
      workflowId: requisitionWorkflow.id,
      code: 'STANDARD_REQUISITION_APPROVAL',
      name: 'Standard requisition workflow',
      status: RecruitmentControlStatus.ACTIVE,
      priority: 200,
      triggerKey: 'recruitment.requisition.submitted',
      metadata: { demo: true },
    },
    update: {
      workflowId: requisitionWorkflow.id,
      workflowCode: null,
      name: 'Standard requisition workflow',
      status: RecruitmentControlStatus.ACTIVE,
      priority: 200,
      triggerKey: 'recruitment.requisition.submitted',
      deletedAt: null,
      metadata: { demo: true },
    },
  });

  await prisma.recruitmentApprovalRule.upsert({
    where: { tenantId_code: { tenantId, code: 'STANDARD_OFFER_APPROVAL' } },
    create: {
      tenantId,
      workflowId: offerWorkflow.id,
      code: 'STANDARD_OFFER_APPROVAL',
      name: 'Standard offer workflow',
      status: RecruitmentControlStatus.ACTIVE,
      priority: 200,
      triggerKey: 'recruitment.offer.submitted',
      metadata: { demo: true },
    },
    update: {
      workflowId: offerWorkflow.id,
      workflowCode: null,
      name: 'Standard offer workflow',
      status: RecruitmentControlStatus.ACTIVE,
      priority: 200,
      triggerKey: 'recruitment.offer.submitted',
      deletedAt: null,
      metadata: { demo: true },
    },
  });

  const careReq = await ensureRecruitmentRequisition({
    tenantId,
    code: 'REQ-CARE-SPEC-2026',
    title: 'Care Specialist',
    positionId: careSpecialist?.id,
    hiringManagerId: manager.employee.id,
    recruiterId: hrAdmin.employee.id,
    departmentName: 'Care Coordination',
    locationName: 'Chicago, IL',
    headcount: 3,
    status: RecruitmentRequisitionStatus.OPEN,
    employmentType: RecruitmentEmploymentType.FULL_TIME,
    workMode: RecruitmentWorkMode.HYBRID,
    priority: 82,
    targetStartDate: new Date('2026-06-15T00:00:00.000Z'),
    salaryMinCents: 5200000,
    salaryMaxCents: 6800000,
    description: 'Support care operations with scheduling, patient coordination, and service follow-through.',
    requirements: 'Customer care experience, scheduling literacy, and comfort working in a healthcare operations environment.',
    createdById: hrAdmin.user.id,
    submittedById: hrAdmin.user.id,
    decidedById: manager.user.id,
    submittedAt: new Date('2026-05-10T14:00:00.000Z'),
    decidedAt: new Date('2026-05-11T16:00:00.000Z'),
    openedAt: new Date('2026-05-12T13:00:00.000Z'),
  });

  const pendingReq = await ensureRecruitmentRequisition({
    tenantId,
    code: 'REQ-PEOPLE-OPS-2026',
    title: 'People Operations Coordinator',
    positionId: hrLead?.id,
    hiringManagerId: hrAdmin.employee.id,
    recruiterId: hrAdmin.employee.id,
    departmentName: 'People Operations',
    locationName: 'Remote',
    headcount: 1,
    status: RecruitmentRequisitionStatus.SUBMITTED,
    employmentType: RecruitmentEmploymentType.FULL_TIME,
    workMode: RecruitmentWorkMode.REMOTE,
    priority: 64,
    targetStartDate: new Date('2026-07-01T00:00:00.000Z'),
    salaryMinCents: 6000000,
    salaryMaxCents: 7600000,
    description: 'Coordinate hiring operations, employee documentation, and onboarding readiness.',
    requirements: 'HR operations background, ATS coordination, and strong internal communication.',
    createdById: hrAdmin.user.id,
    submittedById: hrAdmin.user.id,
    submittedAt: new Date('2026-05-22T15:00:00.000Z'),
  });

  await ensureRecruitmentApprovalRequest({
    tenantId,
    workflowId: requisitionWorkflow.id,
    submittedById: hrAdmin.user.id,
    entityType: 'RecruitmentRequisition',
    entityId: pendingReq.id,
    title: `Requisition ${pendingReq.code}`,
    description: pendingReq.description ?? pendingReq.title,
    module: 'recruitment',
    source: 'recruitment.requisition',
    payload: {
      requisitionId: pendingReq.id,
      code: pendingReq.code,
      headcount: pendingReq.headcount,
      employmentType: pendingReq.employmentType,
    },
    steps: [
      { stepOrder: 1, name: 'HR intake review', assignedUserId: hrAdmin.user.id, assignedRoleId: roles.get('HR_ADMIN')?.id, workflowStepId: requisitionHrStep.id },
      { stepOrder: 2, name: 'Hiring manager approval', assignedUserId: manager.user.id, assignedRoleId: roles.get('MANAGER')?.id, workflowStepId: requisitionManagerStep.id },
    ],
  }).then(async (approval) => {
    await prisma.recruitmentRequisition.update({
      where: { id: pendingReq.id },
      data: { approvalRequestId: approval.id },
    });
  });

  const avery = await ensureRecruitmentCandidate({
    tenantId,
    firstName: 'Avery',
    lastName: 'Stone',
    email: 'avery.stone@example.com',
    phone: '+1-312-555-0141',
    source: 'Referral',
    currentEmployer: 'CareBridge',
    currentTitle: 'Patient Coordinator',
    locationName: 'Chicago, IL',
    tags: ['referral', 'healthcare'],
  });

  const mateo = await ensureRecruitmentCandidate({
    tenantId,
    firstName: 'Mateo',
    lastName: 'Rivera',
    email: 'mateo.rivera@example.com',
    phone: '+1-773-555-0177',
    source: 'LinkedIn',
    currentEmployer: 'Northside Clinic',
    currentTitle: 'Scheduling Lead',
    locationName: 'Oak Park, IL',
    tags: ['experienced', 'scheduling'],
  });

  const priya = await ensureRecruitmentCandidate({
    tenantId,
    firstName: 'Priya',
    lastName: 'Nair',
    email: 'priya.nair@example.com',
    phone: '+1-630-555-0118',
    source: 'Indeed',
    currentEmployer: 'Community Health Partners',
    currentTitle: 'Care Assistant',
    locationName: 'Naperville, IL',
    tags: ['screening', 'operations'],
  });

  const stages = await prisma.recruitmentPipelineStage.findMany({
    where: { tenantId, requisitionId: careReq.id },
  });
  const stageByType = new Map(stages.map((stage) => [stage.type, stage]));

  const averyApp = await ensureRecruitmentApplication({
    tenantId,
    candidateId: avery.id,
    requisitionId: careReq.id,
    currentStageId: stageByType.get(RecruitmentStageType.INTERVIEW)?.id,
    status: RecruitmentApplicationStatus.INTERVIEW,
    source: avery.source ?? 'Referral',
    appliedAt: new Date('2026-05-15T15:30:00.000Z'),
    score: 82,
  });

  const mateoApp = await ensureRecruitmentApplication({
    tenantId,
    candidateId: mateo.id,
    requisitionId: careReq.id,
    currentStageId: stageByType.get(RecruitmentStageType.OFFER)?.id,
    status: RecruitmentApplicationStatus.OFFER,
    source: mateo.source ?? 'LinkedIn',
    appliedAt: new Date('2026-05-13T16:00:00.000Z'),
    score: 91,
  });

  await ensureRecruitmentApplication({
    tenantId,
    candidateId: priya.id,
    requisitionId: careReq.id,
    currentStageId: stageByType.get(RecruitmentStageType.SCREENING)?.id,
    status: RecruitmentApplicationStatus.SCREENING,
    source: priya.source ?? 'Indeed',
    appliedAt: new Date('2026-05-18T17:00:00.000Z'),
    score: 74,
  });

  await ensureRecruitmentInterview({
    tenantId,
    applicationId: averyApp.id,
    stageId: stageByType.get(RecruitmentStageType.INTERVIEW)?.id,
    scheduledStartAt: new Date('2026-05-27T16:00:00.000Z'),
    scheduledEndAt: new Date('2026-05-27T17:00:00.000Z'),
    timezone: 'America/Chicago',
    locationName: 'Video panel',
    meetingUrl: 'https://meet.acme-health.test/recruiting/avery-stone',
    status: RecruitmentInterviewStatus.SCHEDULED,
    interviewerIds: [manager.employee.id, hrAdmin.employee.id],
    notes: 'Panel interview for care operations scenario questions.',
  });

  const offer = await ensureRecruitmentOffer({
    tenantId,
    applicationId: mateoApp.id,
    status: RecruitmentOfferStatus.SUBMITTED,
    basePayCents: 6600000,
    currencyCode: 'USD',
    startDate: new Date('2026-06-22T00:00:00.000Z'),
    expiresAt: new Date('2026-06-05T23:59:59.000Z'),
    decisionNote: 'Competitive offer based on scheduling leadership experience.',
    submittedById: hrAdmin.user.id,
    submittedAt: new Date('2026-05-24T14:00:00.000Z'),
  });

  await ensureRecruitmentApprovalRequest({
    tenantId,
    workflowId: offerWorkflow.id,
    submittedById: hrAdmin.user.id,
    entityType: 'RecruitmentOffer',
    entityId: offer.id,
    title: `Offer for ${careReq.title}`,
    description: offer.decisionNote ?? 'Offer approval requested.',
    module: 'recruitment',
    source: 'recruitment.offer',
    payload: {
      offerId: offer.id,
      applicationId: offer.applicationId,
      basePayCents: offer.basePayCents,
      startDate: offer.startDate?.toISOString(),
    },
    steps: [
      { stepOrder: 1, name: 'HR compensation review', assignedUserId: hrAdmin.user.id, assignedRoleId: roles.get('HR_ADMIN')?.id, workflowStepId: offerHrStep.id },
      { stepOrder: 2, name: 'Tenant admin approval', assignedRoleId: roles.get('TENANT_ADMIN')?.id, workflowStepId: offerAdminStep.id },
    ],
  }).then(async (approval) => {
    await prisma.recruitmentOffer.update({
      where: { id: offer.id },
      data: { approvalRequestId: approval.id },
    });
  });
}

async function ensureApprovalScenario(
  tenantId: string,
  workflowId: string,
  bundles: Map<string, DemoUserBundle>,
  roles: Map<string, Role>,
) {
  const employee = requireBundle(bundles, 'EMPLOYEE').employee;
  const hrAdmin = requireBundle(bundles, 'HR_ADMIN');
  const manager = requireBundle(bundles, 'MANAGER');
  const title = 'Demo transfer approval for Jordan Lee';
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      tenantId,
      entityType: 'Employee',
      entityId: employee.id,
      title,
    },
  });

  const payload = {
    demo: true,
    action: WorkforceActionType.TRANSFER,
    employeeNumber: employee.employeeNumber,
    from: 'Care Coordination Team',
    to: 'People Operations',
  };

  const request = existing
    ? await prisma.approvalRequest.update({
        where: { id: existing.id },
        data: {
          workflowId,
          module: 'employees',
          status: ApprovalRequestStatus.PENDING,
          submittedById: hrAdmin.user.id,
          submittedAt: new Date(),
          completedAt: null,
          payload,
          metadata: { demo: true },
        },
      })
    : await prisma.approvalRequest.create({
        data: {
          tenantId,
          workflowId,
          module: 'employees',
          entityType: 'Employee',
          entityId: employee.id,
          title,
          description: 'Demo pending transfer approval used by frontend approval queues.',
          status: ApprovalRequestStatus.PENDING,
          submittedById: hrAdmin.user.id,
          submittedAt: new Date(),
          payload,
          metadata: { demo: true },
        },
      });

  await ensureApprovalStep(request.id, 1, 'HR review', hrAdmin.user.id, roles.get('HR_ADMIN')?.id);
  await ensureApprovalStep(request.id, 2, 'Manager approval', manager.user.id, roles.get('MANAGER')?.id);

  await ensureWorkforceAction(tenantId, employee, request.id, hrAdmin.user.id);

  return request;
}

async function ensureApprovalStep(
  approvalRequestId: string,
  stepOrder: number,
  name: string,
  assignedUserId?: string,
  assignedRoleId?: string,
  workflowStepId?: string,
) {
  const existing = await prisma.approvalStepInstance.findFirst({
    where: { approvalRequestId, stepOrder },
  });
  const data = {
    workflowStepId,
    stepOrder,
    name,
    assignedUserId,
    assignedRoleId,
    status: ApprovalRequestStatus.PENDING,
    dueAt: new Date(Date.now() + stepOrder * 24 * 60 * 60 * 1000),
    completedAt: null,
    metadata: { demo: true },
  };

  if (existing) {
    await prisma.approvalStepInstance.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.approvalStepInstance.create({
      data: { approvalRequestId, ...data },
    });
  }
}

async function ensureWorkforceAction(
  tenantId: string,
  employee: Employee,
  workflowRequestId: string,
  initiatedById: string,
) {
  const existing = await prisma.workforceAction.findFirst({
    where: {
      tenantId,
      employeeId: employee.id,
      type: WorkforceActionType.TRANSFER,
      workflowRequestId,
    },
  });
  const state = {
    fromOrganizationNode: 'Care Coordination Team',
    toOrganizationNode: 'People Operations',
    effectiveDate: '2026-06-01',
  };
  const data = {
    type: WorkforceActionType.TRANSFER,
    status: WorkforceActionStatus.PENDING_APPROVAL,
    effectiveDate: new Date('2026-06-01T00:00:00.000Z'),
    reason: 'Demo cross-functional transfer request',
    previousState: { organizationNode: state.fromOrganizationNode },
    proposedState: { organizationNode: state.toOrganizationNode },
    finalState: Prisma.JsonNull,
    workflowRequestId,
    initiatedById,
    completedAt: null,
    metadata: { demo: true },
  };

  const action = existing
    ? await prisma.workforceAction.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.workforceAction.create({
        data: {
          tenantId,
          employeeId: employee.id,
          ...data,
        },
      });

  const history = await prisma.workforceActionHistory.findFirst({
    where: {
      workforceActionId: action.id,
      status: WorkforceActionStatus.PENDING_APPROVAL,
    },
  });

  if (!history) {
    await prisma.workforceActionHistory.create({
      data: {
        workforceActionId: action.id,
        status: WorkforceActionStatus.PENDING_APPROVAL,
        note: 'Demo transfer submitted for approval.',
        actorUserId: initiatedById,
        snapshot: state,
      },
    });
  }
}

async function ensureDocumentsAndCompliance(tenantId: string, bundles: Map<string, DemoUserBundle>) {
  const documentType = await prisma.documentType.upsert({
    where: { tenantId_code: { tenantId, code: 'COMPLIANCE_LICENSE' } },
    create: {
      tenantId,
      code: 'COMPLIANCE_LICENSE',
      name: 'Compliance License',
      requiresExpiry: true,
      requiresVerification: true,
      metadata: { demo: true },
    },
    update: {
      name: 'Compliance License',
      requiresExpiry: true,
      requiresVerification: true,
      metadata: { demo: true },
    },
  });
  const employee = requireBundle(bundles, 'EMPLOYEE').employee;
  const hrAdmin = requireBundle(bundles, 'HR_ADMIN').user;
  const title = 'Jordan Lee Compliance License';
  const existing = await prisma.document.findFirst({
    where: {
      tenantId,
      employeeId: employee.id,
      title,
    },
  });
  const document = existing
    ? await prisma.document.update({
        where: { id: existing.id },
        data: {
          documentTypeId: documentType.id,
          visibility: DocumentVisibility.HR_ONLY,
          verificationStatus: DocumentVerificationStatus.PENDING,
          expiresAt: new Date('2026-08-31T00:00:00.000Z'),
          createdById: hrAdmin.id,
          deletedAt: null,
          metadata: { demo: true, complianceRisk: 'EXPIRING_SOON' },
        },
      })
    : await prisma.document.create({
        data: {
          tenantId,
          employeeId: employee.id,
          documentTypeId: documentType.id,
          title,
          description: 'Demo expiring compliance document for dashboard risk cards.',
          visibility: DocumentVisibility.HR_ONLY,
          verificationStatus: DocumentVerificationStatus.PENDING,
          expiresAt: new Date('2026-08-31T00:00:00.000Z'),
          createdById: hrAdmin.id,
          metadata: { demo: true, complianceRisk: 'EXPIRING_SOON' },
        },
      });

  const version = await prisma.documentVersion.upsert({
    where: {
      documentId_versionNo: {
        documentId: document.id,
        versionNo: 1,
      },
    },
    create: {
      documentId: document.id,
      versionNo: 1,
      fileName: 'jordan-lee-compliance-license.pdf',
      fileUrl: 'demo://documents/jordan-lee-compliance-license.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 128000,
      checksum: 'demo-checksum-jordan-license-v1',
      uploadedById: hrAdmin.id,
      metadata: { demo: true },
    },
    update: {
      fileName: 'jordan-lee-compliance-license.pdf',
      fileUrl: 'demo://documents/jordan-lee-compliance-license.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 128000,
      checksum: 'demo-checksum-jordan-license-v1',
      uploadedById: hrAdmin.id,
      metadata: { demo: true },
    },
  });

  await prisma.document.update({
    where: { id: document.id },
    data: { currentVersionId: version.id },
  });
}

async function ensureNotifications(tenantId: string, bundles: Map<string, DemoUserBundle>) {
  const notification = await ensureNotification(tenantId);

  for (const roleCode of ['HR_ADMIN', 'MANAGER', 'EMPLOYEE'] as const) {
    const bundle = requireBundle(bundles, roleCode);
    const recipient = await prisma.notificationRecipient.findFirst({
      where: {
        notificationId: notification.id,
        userId: bundle.user.id,
      },
    });

    if (recipient) {
      await prisma.notificationRecipient.update({
        where: { id: recipient.id },
        data: {
          status: roleCode === 'EMPLOYEE' ? NotificationStatus.READ : NotificationStatus.DELIVERED,
          readAt: roleCode === 'EMPLOYEE' ? new Date() : null,
          deliveredAt: new Date(),
        },
      });
    } else {
      await prisma.notificationRecipient.create({
        data: {
          notificationId: notification.id,
          userId: bundle.user.id,
          employeeId: bundle.employee.id,
          destination: bundle.user.email,
          status: roleCode === 'EMPLOYEE' ? NotificationStatus.READ : NotificationStatus.DELIVERED,
          readAt: roleCode === 'EMPLOYEE' ? new Date() : null,
          deliveredAt: new Date(),
        },
      });
    }

    await prisma.notificationPreference.upsert({
      where: {
        userId_channel_module: {
          userId: bundle.user.id,
          channel: NotificationChannel.IN_APP,
          module: 'employees',
        },
      },
      create: {
        userId: bundle.user.id,
        channel: NotificationChannel.IN_APP,
        module: 'employees',
        enabled: true,
      },
      update: { enabled: true },
    });
  }
}

async function ensureNotification(tenantId: string) {
  const existing = await prisma.notification.findFirst({
    where: {
      tenantId,
      templateCode: 'WORKFLOW_APPROVAL_REQUESTED',
      title: 'Demo transfer approval awaiting review',
    },
  });

  if (existing) {
    return prisma.notification.update({
      where: { id: existing.id },
      data: {
        channel: NotificationChannel.IN_APP,
        body: 'Jordan Lee has a pending transfer approval for frontend queue testing.',
        status: NotificationStatus.DELIVERED,
        data: { demo: true, route: '/approvals' },
      },
    });
  }

  return prisma.notification.create({
    data: {
      tenantId,
      channel: NotificationChannel.IN_APP,
      title: 'Demo transfer approval awaiting review',
      body: 'Jordan Lee has a pending transfer approval for frontend queue testing.',
      status: NotificationStatus.DELIVERED,
      templateCode: 'WORKFLOW_APPROVAL_REQUESTED',
      data: { demo: true, route: '/approvals' },
      sentAt: new Date(),
    },
  });
}

async function ensureAnalyticsAndHistory(
  tenantId: string,
  bundles: Map<string, DemoUserBundle>,
  approvalRequestId: string,
) {
  const admin = requireBundle(bundles, 'TENANT_ADMIN').user;
  const employee = requireBundle(bundles, 'EMPLOYEE').employee;
  const snapshotValue = {
    demo: true,
    workforce: {
      activeEmployees: 4,
      pendingApprovals: 1,
      openPositions: 5,
      complianceRisks: 1,
    },
    healthScore: 91,
  };

  const existingSnapshot = await prisma.analyticsSnapshot.findFirst({
    where: {
      tenantId,
      key: 'EXECUTIVE_OVERVIEW',
      period: 'LAST_30_DAYS',
    },
  });

  if (existingSnapshot) {
    await prisma.analyticsSnapshot.update({
      where: { id: existingSnapshot.id },
      data: { value: snapshotValue },
    });
  } else {
    await prisma.analyticsSnapshot.create({
      data: {
        tenantId,
        key: 'EXECUTIVE_OVERVIEW',
        value: snapshotValue,
        period: 'LAST_30_DAYS',
      },
    });
  }

  await ensureDashboardWidget(tenantId, 'EXECUTIVE_OVERVIEW', 'Executive Overview', 'dashboard');
  await ensureDashboardWidget(tenantId, 'COMPLIANCE_RISK_QUEUE', 'Compliance Risk Queue', 'dashboard');

  const timeline = await prisma.timelineEvent.findFirst({
    where: {
      tenantId,
      employeeId: employee.id,
      type: TimelineEventType.WORKFLOW_SUBMITTED,
      entityType: 'ApprovalRequest',
      entityId: approvalRequestId,
    },
  });

  if (!timeline) {
    await prisma.timelineEvent.create({
      data: {
        tenantId,
        employeeId: employee.id,
        actorUserId: admin.id,
        type: TimelineEventType.WORKFLOW_SUBMITTED,
        title: 'Demo transfer approval submitted',
        description: 'Seeded frontend readiness transfer approval.',
        entityType: 'ApprovalRequest',
        entityId: approvalRequestId,
        data: { demo: true },
      },
    });
  }

  const audit = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      action: AuditAction.CREATE,
      module: 'demo',
      entityType: 'Tenant',
      entityId: tenantId,
    },
  });

  if (!audit) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: admin.id,
        action: AuditAction.CREATE,
        module: 'demo',
        entityType: 'Tenant',
        entityId: tenantId,
        after: { demoTenantSlug },
        metadata: { demo: true },
      },
    });
  }

  const activity = await prisma.activityLog.findFirst({
    where: {
      tenantId,
      module: 'demo',
      message: 'Enterprise demo data refreshed.',
    },
  });

  if (!activity) {
    await prisma.activityLog.create({
      data: {
        tenantId,
        userId: admin.id,
        module: 'demo',
        message: 'Enterprise demo data refreshed.',
        metadata: { demo: true },
      },
    });
  }

  const outbox = await prisma.outboxMessage.findFirst({
    where: {
      tenantId,
      eventType: 'demo.tenant.ready',
      aggregateType: 'Tenant',
      aggregateId: tenantId,
    },
  });

  if (outbox) {
    await prisma.outboxMessage.update({
      where: { id: outbox.id },
      data: {
        status: OutboxStatus.PENDING,
        attempts: 0,
        payload: { demo: true, tenantSlug: demoTenantSlug },
        availableAt: new Date(),
        processedAt: null,
        failedAt: null,
        lastError: null,
      },
    });
  } else {
    await prisma.outboxMessage.create({
      data: {
        tenantId,
        eventType: 'demo.tenant.ready',
        aggregateType: 'Tenant',
        aggregateId: tenantId,
        payload: { demo: true, tenantSlug: demoTenantSlug },
        headers: { source: 'scripts/seed-demo-data.ts' },
      },
    });
  }
}

async function ensureDashboardWidget(tenantId: string, code: string, name: string, module: string) {
  await prisma.dashboardWidget.upsert({
    where: { tenantId_code: { tenantId, code } },
    create: {
      tenantId,
      code,
      name,
      module,
      config: { demo: true },
      isActive: true,
    },
    update: {
      name,
      module,
      config: { demo: true },
      isActive: true,
    },
  });
}

async function ensurePersonComplianceArtifacts(
  tenantId: string,
  bundles: Map<string, DemoUserBundle>,
) {
  const employee = requireBundle(bundles, 'EMPLOYEE');
  const person = await prisma.person.findUniqueOrThrow({
    where: { userId: employee.user.id },
  });
  const existingIdentity = await prisma.personIdentityDocument.findFirst({
    where: {
      personId: person.id,
      type: PersonDocumentType.WORK_PERMIT,
      documentNumber: 'DEMO-WP-2026-0004',
    },
  });

  if (existingIdentity) {
    await prisma.personIdentityDocument.update({
      where: { id: existingIdentity.id },
      data: {
        expiresAt: new Date('2026-08-31T00:00:00.000Z'),
        fileUrl: 'demo://identity-documents/jordan-work-permit.pdf',
        metadata: { demo: true, tenantId },
      },
    });
  } else {
    await prisma.personIdentityDocument.create({
      data: {
        personId: person.id,
        type: PersonDocumentType.WORK_PERMIT,
        documentNumber: 'DEMO-WP-2026-0004',
        issuingCountry: 'US',
        issuedAt: new Date('2025-09-01T00:00:00.000Z'),
        expiresAt: new Date('2026-08-31T00:00:00.000Z'),
        fileUrl: 'demo://identity-documents/jordan-work-permit.pdf',
        metadata: { demo: true, tenantId },
      },
    });
  }
}

async function ensureSchedulingDemoData(
  tenantId: string,
  nodes: Map<string, OrganizationNode>,
  positions: Map<string, Position>,
  bundles: Map<string, DemoUserBundle>,
) {
  const careNode = requireNode(nodes, 'CARE');
  const carePosition = requirePosition(positions, 'POS-CARE-SPEC');
  const manager = requireBundle(bundles, 'MANAGER');
  const employee = requireBundle(bundles, 'EMPLOYEE');
  const careCostCenter = await prisma.costCenter.findUnique({
    where: { tenantId_code: { tenantId, code: 'CC-CARE' } },
  });

  const policy = await prisma.schedulePolicy.upsert({
    where: { tenantId_code: { tenantId, code: 'ACME_STANDARD_CARE' } },
    create: {
      tenantId,
      code: 'ACME_STANDARD_CARE',
      name: 'Acme standard care scheduling policy',
      description: 'Standard shift planning with manager-approved overtime and employee open-shift pickup.',
      status: SchedulePolicyStatus.ACTIVE,
      timezone: 'America/Chicago',
      weekStartsOn: ScheduleWeekStart.MONDAY,
      standardHoursPerDay: 8,
      standardHoursPerWeek: 40,
      overtimeMode: OvertimePolicyMode.DAILY_AND_WEEKLY,
      overtimeApprovalMode: OvertimeApprovalMode.MANAGER,
      overtimeMultiplier: 1.5,
      allowSelfScheduling: false,
      allowOpenShiftPickup: true,
      allowManagerAssignment: true,
      allowHrAssignment: true,
      maxConsecutiveDays: 6,
      minRestHours: 10,
      metadata: { demo: true },
    },
    update: {
      status: SchedulePolicyStatus.ACTIVE,
      timezone: 'America/Chicago',
      overtimeMode: OvertimePolicyMode.DAILY_AND_WEEKLY,
      overtimeApprovalMode: OvertimeApprovalMode.MANAGER,
      allowOpenShiftPickup: true,
      allowManagerAssignment: true,
      allowHrAssignment: true,
      deletedAt: null,
      metadata: { demo: true },
    },
  });

  await prisma.schedulePolicy.updateMany({
    where: { tenantId, id: { not: policy.id }, status: SchedulePolicyStatus.ACTIVE },
    data: { status: SchedulePolicyStatus.ARCHIVED },
  });

  const dayShift = await ensureDemoShift(tenantId, {
    code: 'CARE_DAY_0800_1600',
    name: 'Care day shift',
    startTime: '08:00',
    endTime: '16:00',
    color: '#3820d7',
  });
  const eveningShift = await ensureDemoShift(tenantId, {
    code: 'CARE_EVENING_1400_2200',
    name: 'Care evening shift',
    startTime: '14:00',
    endTime: '22:00',
    color: '#12a66a',
  });
  await ensureDemoShift(tenantId, {
    code: 'CARE_NIGHT_2200_0600',
    name: 'Care night shift',
    startTime: '22:00',
    endTime: '06:00',
    color: '#11143a',
  });

  const period = await prisma.schedulePeriod.upsert({
    where: { tenantId_code: { tenantId, code: 'MAY_2026_WEEK_3' } },
    create: {
      tenantId,
      code: 'MAY_2026_WEEK_3',
      name: 'May 2026 week 3',
      startsOn: new Date('2026-05-18T00:00:00.000Z'),
      endsOn: new Date('2026-05-24T23:59:59.000Z'),
      timezone: 'America/Chicago',
      status: ScheduleStatus.PUBLISHED,
      createdById: manager.user.id,
      publishedById: manager.user.id,
      publishedAt: new Date('2026-05-17T13:00:00.000Z'),
      metadata: { demo: true },
    },
    update: {
      name: 'May 2026 week 3',
      status: ScheduleStatus.PUBLISHED,
      publishedAt: new Date('2026-05-17T13:00:00.000Z'),
      deletedAt: null,
      metadata: { demo: true },
    },
  });

  await ensureDemoScheduleAssignment({
    tenantId,
    scheduleId: period.id,
    employeeId: employee.employee.id,
    shiftId: dayShift.id,
    policyId: policy.id,
    organizationNodeId: careNode.id,
    costCenterId: careCostCenter?.id,
    positionId: carePosition.id,
    managerEmployeeId: manager.employee.id,
    assignedById: manager.user.id,
    workDate: new Date('2026-05-19T00:00:00.000Z'),
    startsAt: new Date('2026-05-19T13:00:00.000Z'),
    endsAt: new Date('2026-05-19T21:00:00.000Z'),
  });

  await prisma.openShift.upsert({
    where: { id: 'demo-open-shift-care-evening-20260520' },
    create: {
      id: 'demo-open-shift-care-evening-20260520',
      tenantId,
      scheduleId: period.id,
      shiftId: eveningShift.id,
      policyId: policy.id,
      organizationNodeId: careNode.id,
      costCenterId: careCostCenter?.id,
      positionId: carePosition.id,
      workDate: new Date('2026-05-20T00:00:00.000Z'),
      startsAt: new Date('2026-05-20T19:00:00.000Z'),
      endsAt: new Date('2026-05-21T03:00:00.000Z'),
      breakMinutes: 30,
      timezone: 'America/Chicago',
      locationName: 'Chicago Medical Operations',
      requiredHeadcount: 2,
      claimedHeadcount: 0,
      status: OpenShiftStatus.OPEN,
      pickupRequiresApproval: true,
      publishedAt: new Date('2026-05-18T12:00:00.000Z'),
      createdById: manager.user.id,
      notes: 'Evening coverage gap for care coordination.',
      metadata: { demo: true },
    },
    update: {
      status: OpenShiftStatus.OPEN,
      requiredHeadcount: 2,
      pickupRequiresApproval: true,
      notes: 'Evening coverage gap for care coordination.',
      metadata: { demo: true },
    },
  });

  await prisma.employeeAvailability.upsert({
    where: { id: 'demo-employee-availability-jordan-20260521' },
    create: {
      id: 'demo-employee-availability-jordan-20260521',
      tenantId,
      employeeId: employee.employee.id,
      date: new Date('2026-05-21T00:00:00.000Z'),
      startsAt: new Date('2026-05-21T13:00:00.000Z'),
      endsAt: new Date('2026-05-21T21:00:00.000Z'),
      timezone: 'America/Chicago',
      status: EmployeeAvailabilityStatus.PREFERRED,
      reason: 'Prefers standard care coverage window.',
      createdById: employee.user.id,
      metadata: { demo: true },
    },
    update: {
      startsAt: new Date('2026-05-21T13:00:00.000Z'),
      endsAt: new Date('2026-05-21T21:00:00.000Z'),
      status: EmployeeAvailabilityStatus.PREFERRED,
      reason: 'Prefers standard care coverage window.',
      metadata: { demo: true },
    },
  });
}

async function ensureDemoShift(
  tenantId: string,
  data: { code: string; name: string; startTime: string; endTime: string; color: string },
) {
  const durationMinutes = shiftDurationMinutes(data.startTime, data.endTime);

  return prisma.workShift.upsert({
    where: { tenantId_code: { tenantId, code: data.code } },
    create: {
      tenantId,
      code: data.code,
      name: data.name,
      status: ShiftStatus.ACTIVE,
      startTime: data.startTime,
      endTime: data.endTime,
      durationMinutes,
      breakMinutes: 30,
      paidBreak: false,
      crossesMidnight: data.endTime <= data.startTime,
      timezone: 'America/Chicago',
      color: data.color,
      isOvertimeEligible: true,
      requiresApproval: false,
      minHeadcount: 1,
      maxHeadcount: 8,
      metadata: { demo: true },
    },
    update: {
      name: data.name,
      status: ShiftStatus.ACTIVE,
      startTime: data.startTime,
      endTime: data.endTime,
      durationMinutes,
      crossesMidnight: data.endTime <= data.startTime,
      deletedAt: null,
      metadata: { demo: true },
    },
  });
}

async function ensureDemoScheduleAssignment(data: {
  tenantId: string;
  scheduleId: string;
  employeeId: string;
  shiftId: string;
  policyId: string;
  organizationNodeId: string;
  costCenterId?: string;
  positionId: string;
  managerEmployeeId: string;
  assignedById: string;
  workDate: Date;
  startsAt: Date;
  endsAt: Date;
}) {
  const existing = await prisma.scheduleAssignment.findFirst({
    where: {
      tenantId: data.tenantId,
      employeeId: data.employeeId,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
    },
  });

  const payload = {
    scheduleId: data.scheduleId,
    shiftId: data.shiftId,
    policyId: data.policyId,
    organizationNodeId: data.organizationNodeId,
    costCenterId: data.costCenterId,
    positionId: data.positionId,
    managerEmployeeId: data.managerEmployeeId,
    assignedById: data.assignedById,
    source: ScheduleAssignmentSource.MANAGER,
    status: ScheduleAssignmentStatus.ASSIGNED,
    workDate: data.workDate,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    breakMinutes: 30,
    timezone: 'America/Chicago',
    locationName: 'Chicago Medical Operations',
    metadata: { demo: true },
  };

  if (existing) {
    await prisma.scheduleAssignment.update({
      where: { id: existing.id },
      data: payload,
    });
    return;
  }

  await prisma.scheduleAssignment.create({
    data: {
      tenantId: data.tenantId,
      employeeId: data.employeeId,
      ...payload,
    },
  });
}

function shiftDurationMinutes(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;
  return end - start;
}

async function ensureLeaveBalance(
  tenantId: string,
  bundle: DemoUserBundle,
  leaveTypeId: string,
  policyId: string,
  minutes: number,
  reason: string,
) {
  const balance = await prisma.leaveBalance.upsert({
    where: {
      tenantId_employeeId_leaveTypeId: {
        tenantId,
        employeeId: bundle.employee.id,
        leaveTypeId,
      },
    },
    create: {
      tenantId,
      employeeId: bundle.employee.id,
      leaveTypeId,
      policyId,
      balanceMinutes: minutes,
      accruedMinutes: minutes,
      usedMinutes: 0,
      pendingMinutes: 0,
      asOfDate: effectiveFrom,
      metadata: { demo: true },
    },
    update: {
      policyId,
      balanceMinutes: minutes,
      accruedMinutes: minutes,
      usedMinutes: 0,
      pendingMinutes: 0,
      asOfDate: effectiveFrom,
      metadata: { demo: true },
    },
  });

  const opening = await prisma.leaveLedgerEntry.findFirst({
    where: {
      tenantId,
      employeeId: bundle.employee.id,
      leaveTypeId,
      balanceId: balance.id,
      type: LeaveLedgerEntryType.OPENING_BALANCE,
    },
  });

  if (opening) {
    await prisma.leaveLedgerEntry.update({
      where: { id: opening.id },
      data: {
        minutes,
        reason,
        actorUserId: bundle.user.id,
        effectiveAt: effectiveFrom,
        metadata: { demo: true },
      },
    });
  } else {
    await prisma.leaveLedgerEntry.create({
      data: {
        tenantId,
        employeeId: bundle.employee.id,
        leaveTypeId,
        balanceId: balance.id,
        type: LeaveLedgerEntryType.OPENING_BALANCE,
        minutes,
        reason,
        actorUserId: bundle.user.id,
        effectiveAt: effectiveFrom,
        metadata: { demo: true },
      },
    });
  }

  return balance;
}

async function ensureDemoPendingLeaveRequest(input: {
  tenantId: string;
  workflowId: string;
  managerStepId: string;
  hrStepId: string;
  employee: DemoUserBundle;
  manager: DemoUserBundle;
  hrRoleId?: string;
  leaveTypeId: string;
  policyId: string;
  calendarId: string;
}) {
  const startAt = new Date('2026-06-02T14:00:00.000Z');
  const endAt = new Date('2026-06-02T22:00:00.000Z');
  const requestedMinutes = 8 * 60;
  const balance = await prisma.leaveBalance.findFirstOrThrow({
    where: {
      tenantId: input.tenantId,
      employeeId: input.employee.employee.id,
      leaveTypeId: input.leaveTypeId,
    },
  });

  const payload = {
    policyId: input.policyId,
    calendarId: input.calendarId,
    status: LeaveRequestStatus.PENDING_APPROVAL,
    startAt,
    endAt,
    requestedMinutes,
    businessMinutes: requestedMinutes,
    paidMinutes: requestedMinutes,
    unpaidMinutes: 0,
    reason: 'Planned family appointment.',
    notes: 'Demo request showing manager then HR approval routing.',
    submittedById: input.employee.user.id,
    submittedAt: new Date('2026-05-20T15:00:00.000Z'),
    decidedById: null,
    decidedAt: null,
    cancelledAt: null,
    balanceSnapshot: {
      balanceId: balance.id,
      balanceMinutes: balance.balanceMinutes,
      pendingMinutes: requestedMinutes,
    },
    workflowSnapshot: {
      workflowId: input.workflowId,
      workflowCode: 'LEAVE_STANDARD',
      triggerKey: 'leave.request.submitted',
      source: 'demo-seed',
    },
    calendarSnapshot: {
      calendarId: input.calendarId,
      calendarCode: 'US_STANDARD_LEAVE',
      calendarName: 'US Standard Leave Calendar',
      businessMinutes: requestedMinutes,
      warnings: [],
      blockers: [],
      days: [
        {
          date: '2026-06-02',
          weekday: 2,
          type: 'WORKDAY',
          isWorkingDay: true,
          workdayMinutes: requestedMinutes,
          requestedOverlapMinutes: requestedMinutes,
          countedMinutes: requestedMinutes,
        },
      ],
      blackouts: [],
    },
    coverageSnapshot: {
      riskLevel: 'MEDIUM',
      warnings: ['2026-06-02 coverage is medium risk after this leave request.'],
      conflicts: [],
      rows: [
        {
          date: '2026-06-02',
          weekday: 2,
          scheduledHeadcount: 1,
          approvedLeaveCount: 0,
          pendingLeaveCount: 0,
          requestedEmployeeScheduled: true,
          minimumHeadcount: 1,
          projectedHeadcount: 0,
          ruleCount: 1,
          riskLevel: 'MEDIUM',
        },
      ],
      generatedAt: new Date('2026-05-20T15:00:00.000Z').toISOString(),
    },
    metadata: { demo: true, coverageRiskLevel: 'MEDIUM' },
    deletedAt: null,
  };

  const existingRequest = await prisma.leaveRequest.findFirst({
    where: {
      tenantId: input.tenantId,
      employeeId: input.employee.employee.id,
      leaveTypeId: input.leaveTypeId,
      startAt,
      endAt,
    },
  });

  const request = existingRequest
    ? await prisma.leaveRequest.update({
        where: { id: existingRequest.id },
        data: payload,
      })
    : await prisma.leaveRequest.create({
        data: {
          tenantId: input.tenantId,
          employeeId: input.employee.employee.id,
          leaveTypeId: input.leaveTypeId,
          ...payload,
        },
      });

  await prisma.leaveBalance.update({
    where: { id: balance.id },
    data: { pendingMinutes: requestedMinutes },
  });

  const requestedLedger = await prisma.leaveLedgerEntry.findFirst({
    where: {
      tenantId: input.tenantId,
      requestId: request.id,
      type: LeaveLedgerEntryType.REQUESTED,
    },
  });
  const requestedLedgerData = {
    tenantId: input.tenantId,
    employeeId: input.employee.employee.id,
    leaveTypeId: input.leaveTypeId,
    balanceId: balance.id,
    requestId: request.id,
    type: LeaveLedgerEntryType.REQUESTED,
    minutes: -requestedMinutes,
    reason: 'Planned family appointment.',
    actorUserId: input.employee.user.id,
    effectiveAt: new Date('2026-05-20T15:00:00.000Z'),
    metadata: { demo: true },
  };
  if (requestedLedger) {
    await prisma.leaveLedgerEntry.update({
      where: { id: requestedLedger.id },
      data: requestedLedgerData,
    });
  } else {
    await prisma.leaveLedgerEntry.create({ data: requestedLedgerData });
  }

  const approval = await ensureLeaveApprovalRequest(input.tenantId, input.workflowId, input.employee.user.id, request.id);
  await prisma.leaveRequest.update({
    where: { id: request.id },
    data: { approvalRequestId: approval.id },
  });

  await ensureApprovalStep(approval.id, 1, 'Manager approval', input.manager.user.id, undefined, input.managerStepId);
  await ensureApprovalStep(approval.id, 2, 'HR final review', undefined, input.hrRoleId, input.hrStepId);
}

async function ensureLeaveApprovalRequest(
  tenantId: string,
  workflowId: string,
  submittedById: string,
  leaveRequestId: string,
) {
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      tenantId,
      module: 'leave',
      entityType: 'LeaveRequest',
      entityId: leaveRequestId,
    },
  });
  const payload = {
    workflowId,
    module: 'leave',
    entityType: 'LeaveRequest',
    entityId: leaveRequestId,
    title: 'Paid Time Off request',
    description: 'Planned family appointment.',
    status: ApprovalRequestStatus.PENDING,
    submittedById,
    submittedAt: new Date('2026-05-20T15:00:00.000Z'),
    completedAt: null,
    payload: {
      leaveRequestId,
      requestedMinutes: 8 * 60,
      startAt: '2026-06-02T14:00:00.000Z',
      endAt: '2026-06-02T22:00:00.000Z',
    },
    metadata: { demo: true, source: 'leave.request' },
  };

  const approval = existing
    ? await prisma.approvalRequest.update({
        where: { id: existing.id },
        data: payload,
      })
    : await prisma.approvalRequest.create({
        data: {
          tenantId,
          ...payload,
        },
      });

  const submitted = await prisma.approvalAction.findFirst({
    where: {
      approvalRequestId: approval.id,
      action: ApprovalActionType.SUBMITTED,
    },
  });

  if (!submitted) {
    await prisma.approvalAction.create({
      data: {
        approvalRequestId: approval.id,
        actorUserId: submittedById,
        action: ApprovalActionType.SUBMITTED,
        comment: 'Demo leave request submitted for approval.',
        metadata: { demo: true },
      },
    });
  }

  return approval;
}

async function ensureRecruitmentRequisition(data: {
  tenantId: string;
  code: string;
  title: string;
  positionId?: string;
  hiringManagerId?: string;
  recruiterId?: string;
  departmentName: string;
  locationName: string;
  headcount: number;
  status: RecruitmentRequisitionStatus;
  employmentType: RecruitmentEmploymentType;
  workMode: RecruitmentWorkMode;
  priority: number;
  targetStartDate: Date;
  salaryMinCents: number;
  salaryMaxCents: number;
  description: string;
  requirements: string;
  createdById: string;
  submittedById?: string;
  decidedById?: string;
  submittedAt?: Date;
  decidedAt?: Date;
  openedAt?: Date;
}) {
  const payload = {
    positionId: data.positionId,
    hiringManagerId: data.hiringManagerId,
    recruiterId: data.recruiterId,
    title: data.title,
    departmentName: data.departmentName,
    locationName: data.locationName,
    headcount: data.headcount,
    status: data.status,
    employmentType: data.employmentType,
    workMode: data.workMode,
    priority: data.priority,
    targetStartDate: data.targetStartDate,
    openedAt: data.openedAt,
    closedAt: data.status === RecruitmentRequisitionStatus.CLOSED ? new Date() : null,
    salaryMinCents: data.salaryMinCents,
    salaryMaxCents: data.salaryMaxCents,
    currencyCode: 'USD',
    description: data.description,
    requirements: data.requirements,
    createdById: data.createdById,
    submittedById: data.submittedById,
    decidedById: data.decidedById,
    submittedAt: data.submittedAt,
    decidedAt: data.decidedAt,
    workflowSnapshot: data.submittedAt
      ? {
          workflowCode: 'RECRUITMENT_REQUISITION_APPROVAL',
          triggerKey: 'recruitment.requisition.submitted',
          source: 'demo-seed',
        }
      : undefined,
    metadata: { demo: true },
    deletedAt: null,
  };

  const requisition = await prisma.recruitmentRequisition.upsert({
    where: { tenantId_code: { tenantId: data.tenantId, code: data.code } },
    create: {
      tenantId: data.tenantId,
      code: data.code,
      ...payload,
    },
    update: payload,
  });

  const stages = [
    { name: 'Applied', type: RecruitmentStageType.APPLIED, sequence: 10, isTerminal: false },
    { name: 'Screening', type: RecruitmentStageType.SCREENING, sequence: 20, isTerminal: false },
    { name: 'Interview', type: RecruitmentStageType.INTERVIEW, sequence: 30, isTerminal: false },
    { name: 'Offer', type: RecruitmentStageType.OFFER, sequence: 40, isTerminal: false },
    { name: 'Hired', type: RecruitmentStageType.HIRED, sequence: 50, isTerminal: true },
    { name: 'Rejected', type: RecruitmentStageType.REJECTED, sequence: 60, isTerminal: true },
  ];

  for (const stage of stages) {
    await prisma.recruitmentPipelineStage.upsert({
      where: {
        requisitionId_sequence: {
          requisitionId: requisition.id,
          sequence: stage.sequence,
        },
      },
      create: {
        tenantId: data.tenantId,
        requisitionId: requisition.id,
        name: stage.name,
        type: stage.type,
        sequence: stage.sequence,
        isTerminal: stage.isTerminal,
        metadata: { demo: true },
      },
      update: {
        name: stage.name,
        type: stage.type,
        isTerminal: stage.isTerminal,
        metadata: { demo: true },
      },
    });
  }

  return requisition;
}

async function ensureRecruitmentCandidate(data: {
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  currentEmployer: string;
  currentTitle: string;
  locationName: string;
  tags: string[];
}) {
  return prisma.recruitmentCandidate.upsert({
    where: { tenantId_email: { tenantId: data.tenantId, email: data.email } },
    create: {
      tenantId: data.tenantId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      source: data.source,
      status: RecruitmentCandidateStatus.ACTIVE,
      currentEmployer: data.currentEmployer,
      currentTitle: data.currentTitle,
      locationName: data.locationName,
      tags: data.tags,
      metadata: { demo: true },
    },
    update: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      source: data.source,
      status: RecruitmentCandidateStatus.ACTIVE,
      currentEmployer: data.currentEmployer,
      currentTitle: data.currentTitle,
      locationName: data.locationName,
      tags: data.tags,
      deletedAt: null,
      metadata: { demo: true },
    },
  });
}

async function ensureRecruitmentApplication(data: {
  tenantId: string;
  candidateId: string;
  requisitionId: string;
  currentStageId?: string;
  status: RecruitmentApplicationStatus;
  source: string;
  appliedAt: Date;
  score: number;
}) {
  return prisma.recruitmentApplication.upsert({
    where: {
      candidateId_requisitionId: {
        candidateId: data.candidateId,
        requisitionId: data.requisitionId,
      },
    },
    create: {
      tenantId: data.tenantId,
      candidateId: data.candidateId,
      requisitionId: data.requisitionId,
      currentStageId: data.currentStageId,
      status: data.status,
      source: data.source,
      appliedAt: data.appliedAt,
      lastActivityAt: data.appliedAt,
      score: data.score,
      metadata: { demo: true },
    },
    update: {
      currentStageId: data.currentStageId,
      status: data.status,
      source: data.source,
      appliedAt: data.appliedAt,
      lastActivityAt: data.appliedAt,
      score: data.score,
      rejectedAt: data.status === RecruitmentApplicationStatus.REJECTED ? new Date() : null,
      hiredAt: data.status === RecruitmentApplicationStatus.HIRED ? new Date() : null,
      deletedAt: null,
      metadata: { demo: true },
    },
  });
}

async function ensureRecruitmentInterview(data: {
  tenantId: string;
  applicationId: string;
  stageId?: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  timezone: string;
  locationName: string;
  meetingUrl: string;
  status: RecruitmentInterviewStatus;
  interviewerIds: string[];
  notes: string;
}) {
  const existing = await prisma.recruitmentInterview.findFirst({
    where: {
      tenantId: data.tenantId,
      applicationId: data.applicationId,
      scheduledStartAt: data.scheduledStartAt,
    },
  });
  const payload = {
    stageId: data.stageId,
    scheduledStartAt: data.scheduledStartAt,
    scheduledEndAt: data.scheduledEndAt,
    timezone: data.timezone,
    locationName: data.locationName,
    meetingUrl: data.meetingUrl,
    status: data.status,
    interviewerIds: data.interviewerIds,
    notes: data.notes,
    deletedAt: null,
    metadata: { demo: true },
  };

  return existing
    ? prisma.recruitmentInterview.update({ where: { id: existing.id }, data: payload })
    : prisma.recruitmentInterview.create({
        data: {
          tenantId: data.tenantId,
          applicationId: data.applicationId,
          ...payload,
        },
      });
}

async function ensureRecruitmentOffer(data: {
  tenantId: string;
  applicationId: string;
  status: RecruitmentOfferStatus;
  basePayCents: number;
  currencyCode: string;
  startDate: Date;
  expiresAt: Date;
  decisionNote: string;
  submittedById: string;
  submittedAt: Date;
}) {
  const existing = await prisma.recruitmentOffer.findFirst({
    where: { tenantId: data.tenantId, applicationId: data.applicationId },
  });
  const payload = {
    status: data.status,
    basePayCents: data.basePayCents,
    currencyCode: data.currencyCode,
    startDate: data.startDate,
    expiresAt: data.expiresAt,
    decisionNote: data.decisionNote,
    submittedById: data.submittedById,
    submittedAt: data.submittedAt,
    workflowSnapshot: {
      workflowCode: 'RECRUITMENT_OFFER_APPROVAL',
      triggerKey: 'recruitment.offer.submitted',
      source: 'demo-seed',
    },
    deletedAt: null,
    metadata: { demo: true },
  };

  return existing
    ? prisma.recruitmentOffer.update({ where: { id: existing.id }, data: payload })
    : prisma.recruitmentOffer.create({
        data: {
          tenantId: data.tenantId,
          applicationId: data.applicationId,
          ...payload,
        },
      });
}

async function ensureRecruitmentApprovalRequest(input: {
  tenantId: string;
  workflowId: string;
  submittedById: string;
  module: string;
  entityType: string;
  entityId: string;
  title: string;
  description: string;
  source: string;
  payload: Prisma.InputJsonValue;
  steps: Array<{
    stepOrder: number;
    name: string;
    assignedUserId?: string;
    assignedRoleId?: string;
    workflowStepId?: string;
  }>;
}) {
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      tenantId: input.tenantId,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
    },
  });
  const payload = {
    workflowId: input.workflowId,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    description: input.description,
    status: ApprovalRequestStatus.PENDING,
    submittedById: input.submittedById,
    submittedAt: new Date('2026-05-24T14:00:00.000Z'),
    completedAt: null,
    payload: input.payload,
    metadata: { demo: true, source: input.source },
  };

  const approval = existing
    ? await prisma.approvalRequest.update({ where: { id: existing.id }, data: payload })
    : await prisma.approvalRequest.create({
        data: {
          tenantId: input.tenantId,
          ...payload,
        },
      });

  for (const step of input.steps) {
    await ensureApprovalStep(
      approval.id,
      step.stepOrder,
      step.name,
      step.assignedUserId,
      step.assignedRoleId,
      step.workflowStepId,
    );
  }

  const submitted = await prisma.approvalAction.findFirst({
    where: { approvalRequestId: approval.id, action: ApprovalActionType.SUBMITTED },
  });
  if (!submitted) {
    await prisma.approvalAction.create({
      data: {
        approvalRequestId: approval.id,
        actorUserId: input.submittedById,
        action: ApprovalActionType.SUBMITTED,
        comment: `${input.title} submitted for approval.`,
        metadata: { demo: true },
      },
    });
  }

  return approval;
}

function requireBundle(bundles: Map<string, DemoUserBundle>, roleCode: string): DemoUserBundle {
  const bundle = bundles.get(roleCode);

  if (!bundle) {
    throw new Error(`Missing demo bundle ${roleCode}`);
  }

  return bundle;
}

function requireNode(nodes: Map<string, OrganizationNode>, code: string): OrganizationNode {
  const node = nodes.get(code);

  if (!node) {
    throw new Error(`Missing organization node ${code}`);
  }

  return node;
}

function requirePosition(positions: Map<string, Position>, code: string): Position {
  const position = positions.get(code);

  if (!position) {
    throw new Error(`Missing position ${code}`);
  }

  return position;
}

async function main() {
  await ensurePlatformFeatures();
  const reference = await ensureReferenceData();
  const permissionByCode = await ensureGlobalPermissions();
  const tenant = await ensureTenant(reference);
  await ensureTenantFeatures(tenant.id);
  const roles = await ensureTenantRoles(tenant.id, permissionByCode);
  const bundles = await ensureUsersPeopleAndEmployees(tenant.id, roles, reference.country.id);
  const nodes = await ensureOrganization(tenant.id, reference);
  const positions = await ensurePositions(tenant.id, nodes);
  await ensureAssignments(tenant.id, nodes, positions, bundles);
  await ensureSchedulingDemoData(tenant.id, nodes, positions, bundles);
  await ensureLifecycleTemplates(tenant.id, bundles);
  const workflow = await ensureWorkflow(tenant.id, roles);
  await ensureLeaveDemoData(tenant.id, roles, bundles);
  await ensureRecruitmentDemoData(tenant.id, roles, bundles, positions);
  const approval = await ensureApprovalScenario(tenant.id, workflow.id, bundles, roles);
  await ensureDocumentsAndCompliance(tenant.id, bundles);
  await ensureNotifications(tenant.id, bundles);
  await ensurePersonComplianceArtifacts(tenant.id, bundles);
  await ensureAnalyticsAndHistory(tenant.id, bundles, approval.id);

  console.log(`Demo seed complete for tenant "${tenant.slug}".`);
  console.log('Demo users: admin@acme-health.test, hr@acme-health.test, manager@acme-health.test, employee@acme-health.test');
  console.log('Demo password: DemoPass123! (override with DEMO_PASSWORD for local runs).');
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
