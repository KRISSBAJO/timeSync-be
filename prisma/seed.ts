import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import {
  HrArticleAuthorType,
  HrArticleCommentStatus,
  HrArticleStatus,
  HrArticleVisibility,
  NotificationChannel,
  PrismaClient,
  RoleScope,
  UserStatus,
  UserType,
  type Permission,
  type Role,
} from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database.');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

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

const permissions = [
  ['platform.tenants.manage', 'Manage Tenants', 'platform'],
  ['platform.features.manage', 'Manage Platform Features', 'platform'],
  ['platform.settings.manage', 'Manage Platform Settings', 'platform'],
  ['platform.audit.read', 'Read Platform Audit', 'platform'],
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
  ['attendance.read', 'Read Attendance', 'attendance'],
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
  ['qa.read', 'Read QA Console', 'qa'],
  ['qa.run', 'Run QA Scripts', 'qa'],
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

const currencies = [
  ['USD', 'United States Dollar', '$'],
  ['NGN', 'Nigerian Naira', '₦'],
  ['GBP', 'British Pound', '£'],
  ['EUR', 'Euro', '€'],
  ['CAD', 'Canadian Dollar', '$'],
  ['INR', 'Indian Rupee', '₹'],
] as const;

const countries = [
  ['United States', 'US', 'USA', '+1', 'en-US', 'America/Chicago', 'USD'],
  ['Nigeria', 'NG', 'NGA', '+234', 'en-NG', 'Africa/Lagos', 'NGN'],
  ['United Kingdom', 'GB', 'GBR', '+44', 'en-GB', 'Europe/London', 'GBP'],
  ['Canada', 'CA', 'CAN', '+1', 'en-CA', 'America/Toronto', 'CAD'],
  ['India', 'IN', 'IND', '+91', 'en-IN', 'Asia/Kolkata', 'INR'],
] as const;

const languages = [
  ['en', 'English'],
  ['fr', 'French'],
  ['es', 'Spanish'],
  ['ar', 'Arabic'],
  ['hi', 'Hindi'],
] as const;

const timezones = [
  ['America/Chicago', 'UTC-06:00'],
  ['America/New_York', 'UTC-05:00'],
  ['America/Los_Angeles', 'UTC-08:00'],
  ['Africa/Lagos', 'UTC+01:00'],
  ['Europe/London', 'UTC+00:00'],
  ['Asia/Kolkata', 'UTC+05:30'],
] as const;

const globalDocumentTypes = [
  ['OFFER_LETTER', 'Offer Letter', false, false],
  ['EMPLOYMENT_CONTRACT', 'Employment Contract', false, false],
  ['NATIONAL_ID', 'National ID', true, true],
  ['PASSPORT', 'Passport', true, true],
  ['WORK_PERMIT', 'Work Permit', true, true],
  ['CERTIFICATION', 'Certification', true, true],
] as const;

const dashboardWidgets = [
  ['WORKFORCE_HEADCOUNT', 'Workforce Headcount', 'dashboard'],
  ['PENDING_APPROVALS', 'Pending Approvals', 'dashboard'],
  ['NEW_HIRES', 'New Hires', 'dashboard'],
  ['SEPARATIONS', 'Separations', 'dashboard'],
  ['POSITION_VACANCIES', 'Position Vacancies', 'dashboard'],
  ['WORKFORCE_HEALTH_SCORE', 'Workforce Health Score', 'dashboard'],
  ['DOCUMENT_COMPLIANCE', 'Document Compliance', 'dashboard'],
  ['OUTBOX_HEALTH', 'Outbox Health', 'dashboard'],
  ['EMPLOYEE_ASSIGNMENT_RISKS', 'Employee Assignment Risks', 'dashboard'],
  ['ACTIVE_SESSIONS', 'Active Sessions', 'dashboard'],
  ['ORG_DISTRIBUTION', 'Organization Distribution', 'analytics'],
  ['HEADCOUNT_TREND', 'Headcount Trend', 'analytics'],
  ['POSITION_CONTROL', 'Position Control', 'analytics'],
] as const;

const notificationTemplates = [
  [
    'USER_INVITED',
    'User Invited',
    NotificationChannel.EMAIL,
    'You have been invited to TimeSync HR',
    'Hello {{name}}, you have been invited to join {{tenantName}} on TimeSync HR.',
  ],
  [
    'WORKFLOW_APPROVAL_REQUESTED',
    'Workflow Approval Requested',
    NotificationChannel.IN_APP,
    'Approval requested: {{title}}',
    '{{actorName}} submitted {{title}} and needs your review.',
  ],
  [
    'WORKFLOW_APPROVED',
    'Workflow Approved',
    NotificationChannel.IN_APP,
    'Approved: {{title}}',
    '{{title}} has been approved.',
  ],
  [
    'DOCUMENT_EXPIRING',
    'Document Expiring',
    NotificationChannel.EMAIL,
    'Document expiring: {{documentTitle}}',
    '{{documentTitle}} expires on {{expiresAt}}. Please review the employee document record.',
  ],
  [
    'EMPLOYEE_LIFECYCLE_UPDATED',
    'Employee Lifecycle Updated',
    NotificationChannel.IN_APP,
    'Employee status changed: {{employeeName}}',
    '{{employeeName}} is now {{status}}.',
  ],
  [
    'FORM_ASSIGNED',
    'Form Assigned',
    NotificationChannel.IN_APP,
    'Form assigned: {{formTitle}}',
    'A workforce form is ready for your response.',
  ],
  [
    'LEAVE_REQUEST_SUBMITTED',
    'Leave Request Submitted',
    NotificationChannel.IN_APP,
    'Leave request submitted: {{employeeName}}',
    '{{employeeName}} submitted {{leaveType}} from {{startDate}} to {{endDate}}.',
  ],
  [
    'LEAVE_REQUEST_APPROVED',
    'Leave Request Approved',
    NotificationChannel.IN_APP,
    'Leave approved: {{leaveType}}',
    'Your {{leaveType}} request from {{startDate}} to {{endDate}} has been approved.',
  ],
  [
    'LEAVE_REQUEST_REJECTED',
    'Leave Request Rejected',
    NotificationChannel.IN_APP,
    'Leave rejected: {{leaveType}}',
    'Your {{leaveType}} request from {{startDate}} to {{endDate}} was rejected.',
  ],
] as const;

const existingTenantRolePermissionAugments: Record<string, string[]> = {
  TENANT_ADMIN: permissions
    .map(([code]) => code)
    .filter((code) => !code.startsWith('platform.')),
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
    'attendance.read',
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
    'dashboard.read',
    'dashboard.write',
    'analytics.read',
    'analytics.write',
    'content.read',
    'content.write',
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
    'dashboard.read',
    'content.read',
  ],
  EMPLOYEE: ['dashboard.read', 'notifications.read', 'content.read', 'scheduling.self', 'attendance.self', 'leave.self'],
};

const hrGuideCategories = [
  [
    'workforce-architecture',
    'Workforce Architecture',
    'Operating models, hierarchy, assignments, and position-led workforce design.',
  ],
  [
    'hr-operations',
    'HR Operations',
    'Practical operating rhythms for documents, onboarding, workflows, and compliance.',
  ],
  [
    'skills-growth',
    'Skills & Growth',
    'Skills intelligence, employee journeys, manager enablement, and capability planning.',
  ],
] as const;

const hrGuideArticles = [
  {
    slug: 'assignment-based-hr-systems',
    categorySlug: 'workforce-architecture',
    title: 'Why assignment-based HR systems protect workforce history',
    subtitle: 'Stop overwriting departments and managers. Model movement as time-aware assignments.',
    excerpt:
      'Enterprise HR platforms preserve the story of work by separating the employee relationship from the assignments that change over time.',
    heroImageUrl: '/images/hero2.png',
    tags: ['assignments', 'workforce history', 'position management'],
    readingMinutes: 7,
    featured: true,
    pinned: true,
    readCount: 1280,
    likeCount: 214,
    helpfulCount: 86,
    publishedAt: new Date('2026-05-01T12:00:00.000Z'),
    body: `Enterprise HR systems fail when they store branch, department, manager, and role directly on the employee record. Those fields look simple at first, but they erase the operational story every time a person transfers, takes an acting assignment, joins a project team, or changes manager.

The stronger model is assignment based. A person is the human identity. An employee is the employment relationship. An assignment is where that employee is placed in the organization for a defined period of time.

That separation gives HR, finance, and operations the ability to reconstruct history without guessing. You can answer who managed an employee on a specific date, which cost center owned the role during a project, and whether a temporary assignment overlapped with a permanent one.

For enterprise teams, assignment records should include effective dates, assignment type, organization node, position, cost center, manager, grade, and reason. When a movement happens, create a new assignment. Do not mutate the old one.

This design is also what makes future payroll, leave, attendance, workforce planning, and analytics trustworthy. Every downstream process can reason from the same historical placement model instead of chasing spreadsheet corrections.`,
  },
  {
    slug: 'tenant-admin-launch-checklist',
    categorySlug: 'hr-operations',
    title: 'The tenant admin launch checklist for a controlled HR rollout',
    subtitle: 'A practical sequence for standing up a new organization without chaos.',
    excerpt:
      'Before inviting employees, tenant admins should align settings, roles, workflows, document types, and workforce reference data.',
    heroImageUrl: '/images/work.png',
    tags: ['tenant administration', 'implementation', 'governance'],
    readingMinutes: 6,
    featured: true,
    pinned: false,
    readCount: 920,
    likeCount: 143,
    helpfulCount: 71,
    publishedAt: new Date('2026-05-05T12:00:00.000Z'),
    body: `A clean HR rollout starts before the first employee is invited. Tenant admins need a controlled launch sequence that turns platform setup into an operating model.

Start with the tenant profile: country, timezone, locale, date format, fiscal year, branding, support contacts, and employee number policy. These settings become the foundation for every downstream record.

Next, configure access. Create roles for HR admins, managers, employees, auditors, and support users. Keep platform-level permissions rare. Most users should operate inside tenant or organization-scoped access.

Then build the workforce structure. Create organization nodes, cost centers, grades, levels, positions, and reporting lines before importing employees. This prevents employee records from becoming the place where structure is invented.

Finally, activate workflows and document types. Hiring, transfer, promotion, separation, document verification, and role changes should move through governed approval paths. The goal is not bureaucracy. The goal is a reliable operating rhythm that leaders can trust.`,
  },
  {
    slug: 'skills-intelligence-foundation',
    categorySlug: 'skills-growth',
    title: 'Building a skills intelligence foundation before AI',
    subtitle: 'AI workforce insights are only as strong as the skills data underneath them.',
    excerpt:
      'Skills intelligence begins with clear taxonomies, proficiency levels, evidence, and employee journeys that keep data current.',
    heroImageUrl: '/images/phone.png',
    tags: ['skills', 'learning', 'AI readiness'],
    readingMinutes: 8,
    featured: true,
    pinned: false,
    readCount: 780,
    likeCount: 118,
    helpfulCount: 64,
    publishedAt: new Date('2026-05-09T12:00:00.000Z'),
    body: `Many organizations want AI-driven workforce intelligence, but the useful work starts with the basics: consistent skills data.

A strong skills foundation defines skill categories, proficiency levels, evidence sources, and review moments. Technical skills, leadership skills, compliance skills, and role-specific capabilities should not live as random free-text notes.

Tie skills to positions and employee profiles. A position can describe required skills and minimum proficiency. A person can carry demonstrated skills, certifications, languages, experience, and learning progress.

The most important design choice is keeping skills current. Use onboarding, manager reviews, certifications, project closeouts, and learning milestones as moments to refresh the profile. The platform should make updates part of work, not a separate annual chore.

Once skills are structured and maintained, future AI can answer better questions: where capability gaps exist, which teams can staff a project, what learning path is relevant, and how workforce risk changes as people move.`,
  },
] as const;

async function upsertGlobalPermission(
  code: string,
  name: string,
  module: string,
): Promise<Permission> {
  const existing = await prisma.permission.findFirst({
    where: {
      tenantId: null,
      code,
    },
  });

  if (existing) {
    return prisma.permission.update({
      where: { id: existing.id },
      data: { name, module, isSystem: true },
    });
  }

  return prisma.permission.create({
    data: {
      tenantId: null,
      code,
      name,
      module,
      isSystem: true,
    },
  });
}

async function upsertGlobalRole(
  code: string,
  name: string,
  scope: RoleScope,
  description: string,
): Promise<Role> {
  const existing = await prisma.role.findFirst({
    where: {
      tenantId: null,
      code,
    },
  });

  if (existing) {
    return prisma.role.update({
      where: { id: existing.id },
      data: { name, scope, description, isSystem: true, isActive: true },
    });
  }

  return prisma.role.create({
    data: {
      tenantId: null,
      code,
      name,
      scope,
      description,
      isSystem: true,
      isActive: true,
    },
  });
}

async function attachPermissions(role: Role, permissionCodes: string[]) {
  const rolePermissions = await prisma.permission.findMany({
    where: {
      code: {
        in: permissionCodes,
      },
    },
  });

  for (const permission of rolePermissions) {
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
}

async function syncRolePermissions(role: Role, permissionCodes: string[]) {
  const rolePermissions = await prisma.permission.findMany({
    where: {
      code: {
        in: permissionCodes,
      },
    },
  });
  const permissionIds = rolePermissions.map((permission) => permission.id);

  await prisma.rolePermission.deleteMany({
    where: {
      roleId: role.id,
      permissionId: {
        notIn: permissionIds,
      },
    },
  });

  for (const permission of rolePermissions) {
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
}

async function seedHrGuides() {
  const categoryIdsBySlug = new Map<string, string>();

  for (const [slug, name, description] of hrGuideCategories) {
    const category = await prisma.hrArticleCategory.upsert({
      where: { slug },
      create: {
        slug,
        name,
        description,
        sortOrder: categoryIdsBySlug.size + 1,
      },
      update: {
        name,
        description,
        isActive: true,
        sortOrder: categoryIdsBySlug.size + 1,
      },
    });

    categoryIdsBySlug.set(slug, category.id);
  }

  const platformAdminEmail = process.env.AUTH_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const platformAdmin = platformAdminEmail
    ? await prisma.user.findFirst({
        where: {
          tenantId: null,
          email: platformAdminEmail,
        },
      })
    : null;

  for (const article of hrGuideArticles) {
    const categoryId = categoryIdsBySlug.get(article.categorySlug);
    const seededArticle = await prisma.hrArticle.upsert({
      where: { slug: article.slug },
      create: {
        categoryId,
        slug: article.slug,
        title: article.title,
        subtitle: article.subtitle,
        excerpt: article.excerpt,
        body: article.body,
        heroImageUrl: article.heroImageUrl,
        readingMinutes: article.readingMinutes,
        status: HrArticleStatus.PUBLISHED,
        visibility: HrArticleVisibility.PUBLIC,
        featured: article.featured,
        pinned: article.pinned,
        tags: [...article.tags],
        seoTitle: article.title,
        seoDescription: article.excerpt,
        authorType: platformAdmin ? HrArticleAuthorType.PLATFORM_USER : HrArticleAuthorType.APP,
        authoredByApp: !platformAdmin,
        authorUserId: platformAdmin?.id,
        authorName: platformAdmin ? 'TimeSync Platform Team' : 'TimeSync Editorial',
        authorTitle: 'WorkforceOS Research',
        authorAvatarUrl: '/images/logo.png',
        readCount: article.readCount,
        likeCount: article.likeCount,
        helpfulCount: article.helpfulCount,
        publishedAt: article.publishedAt,
        createdById: platformAdmin?.id,
        updatedById: platformAdmin?.id,
        metadata: {
          seeded: true,
          editorialSeries: 'HR Guides',
        },
      },
      update: {
        categoryId,
        title: article.title,
        subtitle: article.subtitle,
        excerpt: article.excerpt,
        body: article.body,
        heroImageUrl: article.heroImageUrl,
        readingMinutes: article.readingMinutes,
        status: HrArticleStatus.PUBLISHED,
        visibility: HrArticleVisibility.PUBLIC,
        featured: article.featured,
        pinned: article.pinned,
        tags: [...article.tags],
        seoTitle: article.title,
        seoDescription: article.excerpt,
        authorType: platformAdmin ? HrArticleAuthorType.PLATFORM_USER : HrArticleAuthorType.APP,
        authoredByApp: !platformAdmin,
        authorUserId: platformAdmin?.id,
        authorName: platformAdmin ? 'TimeSync Platform Team' : 'TimeSync Editorial',
        authorTitle: 'WorkforceOS Research',
        authorAvatarUrl: '/images/logo.png',
        readCount: article.readCount,
        likeCount: article.likeCount,
        helpfulCount: article.helpfulCount,
        publishedAt: article.publishedAt,
        archivedAt: null,
        deletedAt: null,
        updatedById: platformAdmin?.id,
        metadata: {
          seeded: true,
          editorialSeries: 'HR Guides',
        },
      },
    });

    await prisma.hrArticleComment.deleteMany({
      where: {
        articleId: seededArticle.id,
        displayName: {
          in: ['Maya Chen', 'Owen Brooks', 'Priya Shah'],
        },
      },
    });

    await prisma.hrArticleComment.createMany({
      data: [
        {
          articleId: seededArticle.id,
          displayName: 'Maya Chen',
          email: 'maya@example.com',
          body: 'This is the clearest explanation I have seen for separating employee records from assignments.',
          status: HrArticleCommentStatus.APPROVED,
          approvedAt: new Date(),
          metadata: { seeded: true },
        },
        {
          articleId: seededArticle.id,
          displayName: 'Owen Brooks',
          email: 'owen@example.com',
          body: 'The rollout checklist is exactly the operating order our HR team needed before inviting managers.',
          status: HrArticleCommentStatus.APPROVED,
          approvedAt: new Date(),
          metadata: { seeded: true },
        },
        {
          articleId: seededArticle.id,
          displayName: 'Priya Shah',
          email: 'priya@example.com',
          body: 'The skills foundation advice is practical. It connects data quality to real workforce planning.',
          status: HrArticleCommentStatus.APPROVED,
          approvedAt: new Date(),
          metadata: { seeded: true },
        },
      ],
    });

    await prisma.hrArticle.update({
      where: { id: seededArticle.id },
      data: {
        commentCount: 3,
      },
    });
  }
}

async function main() {
  await prisma.platformSetting.upsert({
    where: { key: 'platform.bootstrap.version' },
    create: {
      key: 'platform.bootstrap.version',
      value: { version: 1 },
      description: 'Tracks the platform bootstrap seed version.',
      isPublic: false,
    },
    update: {
      value: { version: 1 },
    },
  });

  for (const [code, name] of platformFeatures) {
    await prisma.platformFeature.upsert({
      where: { code },
      create: {
        code,
        name,
        isActive: true,
      },
      update: {
        name,
        isActive: true,
      },
    });
  }

  const currencyByCode = new Map<string, string>();
  for (const [code, name, symbol] of currencies) {
    const currency = await prisma.currency.upsert({
      where: { code },
      create: { code, name, symbol },
      update: { name, symbol, isActive: true },
    });
    currencyByCode.set(code, currency.id);
  }

  for (const [name, iso2, iso3, phoneCode, defaultLocale, defaultTimezone, currencyCode] of countries) {
    await prisma.country.upsert({
      where: { iso2 },
      create: {
        name,
        iso2,
        iso3,
        phoneCode,
        defaultLocale,
        defaultTimezone,
        currencyId: currencyByCode.get(currencyCode),
      },
      update: {
        name,
        iso3,
        phoneCode,
        defaultLocale,
        defaultTimezone,
        currencyId: currencyByCode.get(currencyCode),
        isActive: true,
      },
    });
  }

  for (const [code, name] of languages) {
    await prisma.language.upsert({
      where: { code },
      create: { code, name },
      update: { name, isActive: true },
    });
  }

  for (const [name, offset] of timezones) {
    await prisma.timezone.upsert({
      where: { name },
      create: { name, offset },
      update: { offset, isActive: true },
    });
  }

  for (const [code, name, module] of permissions) {
    await upsertGlobalPermission(code, name, module);
  }

  const superAdmin = await upsertGlobalRole(
    'SUPER_ADMIN',
    'Super Admin',
    RoleScope.PLATFORM,
    'Full platform administration access.',
  );
  const platformSupport = await upsertGlobalRole(
    'PLATFORM_SUPPORT',
    'Platform Support',
    RoleScope.PLATFORM,
    'Limited platform support and tenant diagnostics access.',
  );
  const tenantAdminTemplate = await upsertGlobalRole(
    'TENANT_ADMIN',
    'Tenant Admin Template',
    RoleScope.TENANT,
    'Template role used when provisioning tenant administrators.',
  );

  const allPermissionCodes = permissions.map(([code]) => code);
  await attachPermissions(superAdmin, allPermissionCodes);
  await attachPermissions(
    platformSupport,
    allPermissionCodes.filter((code) => code.endsWith('.read') || code.includes('platform.audit')),
  );
  await attachPermissions(
    tenantAdminTemplate,
    allPermissionCodes.filter((code) => !code.startsWith('platform.')),
  );

  for (const [roleCode, permissionCodes] of Object.entries(existingTenantRolePermissionAugments)) {
    const tenantRoles = await prisma.role.findMany({
      where: {
        tenantId: { not: null },
        code: roleCode,
      },
    });

    for (const role of tenantRoles) {
      await syncRolePermissions(role, permissionCodes);
    }
  }

  const platformAdminEmail = process.env.AUTH_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const platformAdminPassword = process.env.AUTH_PLATFORM_ADMIN_PASSWORD;

  if (platformAdminEmail && platformAdminPassword) {
    const passwordHash = await argon2.hash(platformAdminPassword, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const existingAdmin = await prisma.user.findFirst({
      where: {
        tenantId: null,
        email: platformAdminEmail,
      },
    });
    const admin = existingAdmin
      ? await prisma.user.update({
          where: { id: existingAdmin.id },
          data: {
            passwordHash,
            type: UserType.PLATFORM_ADMIN,
            status: UserStatus.ACTIVE,
            authProvider: 'LOCAL',
          },
        })
      : await prisma.user.create({
          data: {
            tenantId: null,
            email: platformAdminEmail,
            username: 'platform-admin',
            passwordHash,
            type: UserType.PLATFORM_ADMIN,
            status: UserStatus.ACTIVE,
            authProvider: 'LOCAL',
            emailVerifiedAt: new Date(),
          },
        });

    await prisma.userRole.upsert({
      where: {
        userId_roleId_scope_scopeId: {
          userId: admin.id,
          roleId: superAdmin.id,
          scope: RoleScope.PLATFORM,
          scopeId: '',
        },
      },
      create: {
        userId: admin.id,
        roleId: superAdmin.id,
        scope: RoleScope.PLATFORM,
        scopeId: '',
      },
      update: {},
    });
  }

  for (const [code, name, requiresExpiry, requiresVerification] of globalDocumentTypes) {
    const existing = await prisma.documentType.findFirst({
      where: { tenantId: null, code },
    });

    if (existing) {
      await prisma.documentType.update({
        where: { id: existing.id },
        data: { name, requiresExpiry, requiresVerification },
      });
    } else {
      await prisma.documentType.create({
        data: { code, name, requiresExpiry, requiresVerification },
      });
    }
  }

  for (const [code, name, module] of dashboardWidgets) {
    const existing = await prisma.dashboardWidget.findFirst({
      where: { tenantId: null, code },
    });

    if (existing) {
      await prisma.dashboardWidget.update({
        where: { id: existing.id },
        data: { name, module, isActive: true },
      });
    } else {
      await prisma.dashboardWidget.create({
        data: { code, name, module, isActive: true },
      });
    }
  }

  for (const [code, name, channel, subject, body] of notificationTemplates) {
    const existing = await prisma.notificationTemplate.findFirst({
      where: {
        tenantId: null,
        code,
        channel,
      },
    });

    if (existing) {
      await prisma.notificationTemplate.update({
        where: { id: existing.id },
        data: {
          name,
          subject,
          body,
          isActive: true,
        },
      });
    } else {
      await prisma.notificationTemplate.create({
        data: {
          code,
          name,
          channel,
          subject,
          body,
          isActive: true,
        },
      });
    }
  }

  await seedHrGuides();

  console.log('Seed complete: platform features, reference data, permissions, roles, HR guides, and templates.');
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
