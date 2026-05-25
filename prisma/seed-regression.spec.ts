import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

describe('Seed regression contract', () => {
  const baseSeed = readFileSync(join(root, 'prisma/seed.ts'), 'utf8');
  const demoSeed = readFileSync(join(root, 'scripts/seed-demo-data.ts'), 'utf8');

  it('keeps enterprise feature flags and permission foundations intact', () => {
    for (const feature of [
      'WORKFORCE_CORE',
      'ORGANIZATION',
      'POSITIONS',
      'WORKFLOWS',
      'DOCUMENTS',
      'NOTIFICATIONS',
      'FORMS',
      'SCHEDULING',
      'ANALYTICS',
      'PAYROLL',
      'ATTENDANCE',
      'LEAVE',
      'RECRUITMENT',
    ]) {
      expect(baseSeed).toContain(feature);
      expect(demoSeed).toContain(feature);
    }

    for (const permission of [
      'employees.write',
      'assignments.write',
      'workflows.write',
      'documents.verify',
      'notifications.write',
      'forms.write',
      'scheduling.write',
      'scheduling.team.write',
      'scheduling.self',
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
      'outbox.process',
      'dashboard.write',
      'analytics.write',
    ]) {
      expect(baseSeed).toContain(permission);
      expect(demoSeed).toContain(permission);
    }
  });

  it('keeps the demo tenant access contract stable', () => {
    expect(demoSeed).toContain("demoTenantSlug = process.env.DEMO_TENANT_SLUG?.trim() || 'acme-health'");
    expect(demoSeed).toContain("demoPassword = process.env.DEMO_PASSWORD || 'DemoPass123!'");

    for (const email of [
      'admin@acme-health.test',
      'hr@acme-health.test',
      'manager@acme-health.test',
      'employee@acme-health.test',
    ]) {
      expect(demoSeed).toContain(email);
    }

    for (const role of ['TENANT_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE']) {
      expect(demoSeed).toContain(role);
    }
  });

  it('keeps dashboard widgets and notification templates seeded', () => {
    for (const widget of [
      'WORKFORCE_HEADCOUNT',
      'PENDING_APPROVALS',
      'POSITION_VACANCIES',
      'WORKFORCE_HEALTH_SCORE',
      'OUTBOX_HEALTH',
    ]) {
      expect(baseSeed).toContain(widget);
    }

    for (const template of [
      'USER_INVITED',
      'WORKFLOW_APPROVAL_REQUESTED',
      'DOCUMENT_EXPIRING',
      'EMPLOYEE_LIFECYCLE_UPDATED',
      'FORM_ASSIGNED',
      'LEAVE_REQUEST_SUBMITTED',
      'LEAVE_REQUEST_APPROVED',
      'LEAVE_REQUEST_REJECTED',
    ]) {
      expect(baseSeed).toContain(template);
    }
  });

  it('keeps demo leave workflow templates and opening balances seeded', () => {
    for (const value of [
      'LEAVE_STANDARD',
      'PTO_STANDARD',
      'SICK_STANDARD',
      'PTO_MANAGER_HR',
      'SICK_MANAGER_HR',
      'OPENING_BALANCE',
      'REQUESTED',
    ]) {
      expect(demoSeed).toContain(value);
    }
  });
});
