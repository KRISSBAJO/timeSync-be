import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const migrationSql = readdirSync(join(root, 'prisma/migrations'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readFileSync(join(root, 'prisma/migrations', entry.name, 'migration.sql'), 'utf8'))
  .join('\n');

function modelBlock(model: string): string {
  const match = schema.match(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`));
  return match?.[0] ?? '';
}

describe('Leave management schema contract', () => {
  it('keeps leave foundation tables represented in Prisma and migrations', () => {
    for (const model of [
      'LeaveType',
      'LeavePolicy',
      'LeaveApprovalRule',
      'LeaveCalendar',
      'LeaveCalendarDay',
      'LeaveBlackoutWindow',
      'LeaveBalance',
      'LeaveLedgerEntry',
      'LeaveRequest',
    ]) {
      expect(schema).toContain(`model ${model} {`);
      expect(migrationSql).toContain(`CREATE TABLE "${model}"`);
    }
  });

  it('preserves workflow-template routing, balance snapshots, and approval lineage', () => {
    const request = modelBlock('LeaveRequest');
    const rule = modelBlock('LeaveApprovalRule');

    for (const field of [
      'approvalRequestId',
      'workflowSnapshot',
      'balanceSnapshot',
      'calendarId',
      'businessMinutes',
      'calendarSnapshot',
      'coverageSnapshot',
      'supportingDocumentUrl',
      'submittedById',
      'decidedById',
      'submittedAt',
      'decidedAt',
    ]) {
      expect(request).toContain(field);
    }

    for (const field of [
      'workflowId',
      'workflowCode',
      'triggerKey',
      'organizationNodeId',
      'costCenterId',
      'positionId',
      'minMinutes',
      'maxMinutes',
    ]) {
      expect(rule).toContain(field);
    }
  });

  it('preserves leave audit/timeline and ledger event vocabulary', () => {
    for (const value of [
      'LEAVE_REQUESTED',
      'LEAVE_APPROVED',
      'LEAVE_REJECTED',
      'LEAVE_CANCELLED',
      'LEAVE_BALANCE_ADJUSTED',
      'LEAVE_CALENDAR_UPDATED',
      'LEAVE_COVERAGE_RISK_FLAGGED',
    ]) {
      expect(schema).toContain(value);
      expect(migrationSql).toContain(value);
    }

    for (const value of [
      'OPENING_BALANCE',
      'REQUESTED',
      'APPROVED_USAGE',
      'CANCELLED_RESTORE',
      'REVERSAL',
    ]) {
      expect(schema).toContain(value);
      expect(migrationSql).toContain(value);
    }
  });

  it('preserves leave calendar and blackout controls for enterprise request validation', () => {
    const calendar = modelBlock('LeaveCalendar');
    const day = modelBlock('LeaveCalendarDay');
    const blackout = modelBlock('LeaveBlackoutWindow');

    for (const field of ['workWeekdays', 'defaultWorkdayMinutes', 'isDefault', 'organizationNodeId', 'costCenterId', 'positionId']) {
      expect(calendar).toContain(field);
    }

    for (const field of ['date', 'type', 'paid', 'workdayMinutes']) {
      expect(day).toContain(field);
    }

    for (const field of ['startsAt', 'endsAt', 'severity', 'calendarId', 'leaveTypeId']) {
      expect(blackout).toContain(field);
    }

    for (const value of ['LeaveCalendarDayType', 'LeaveBlackoutSeverity', 'HOLIDAY', 'NON_WORKING_DAY', 'SPECIAL_WORKDAY', 'WARN', 'BLOCK']) {
      expect(schema).toContain(value);
      expect(migrationSql).toContain(value);
    }
  });
});
