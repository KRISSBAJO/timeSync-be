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

describe('Attendance enterprise schema contract', () => {
  it('keeps every enterprise attendance table represented in Prisma and migrations', () => {
    for (const model of [
      'AttendancePolicy',
      'AttendanceGeofence',
      'AttendanceClockDevice',
      'AttendanceKioskCredential',
      'AttendanceOfflinePunch',
      'AttendanceHoliday',
      'AttendancePremiumRule',
      'AttendanceRecord',
      'AttendancePunch',
      'AttendanceBreak',
      'AttendanceException',
      'AttendanceCorrectionRequest',
      'AttendanceTimesheet',
      'AttendanceTimesheetEntry',
      'AttendancePayrollExport',
    ]) {
      expect(schema).toContain(`model ${model} {`);
      expect(migrationSql).toContain(`CREATE TABLE "${model}"`);
    }
  });

  it('preserves correction request before/after evidence and approval lineage', () => {
    const correctionRequest = modelBlock('AttendanceCorrectionRequest');

    for (const field of [
      'previousSnapshot',
      'requestedSnapshot',
      'reason',
      'supportingDocumentUrl',
      'requestedById',
      'decidedById',
      'appliedById',
      'appliedRecordId',
      'appliedAt',
    ]) {
      expect(correctionRequest).toContain(field);
    }
  });

  it('preserves advanced anti-fraud, offline, and payroll policy fields', () => {
    const policy = modelBlock('AttendancePolicy');
    const offlinePunch = modelBlock('AttendanceOfflinePunch');
    const premiumRule = modelBlock('AttendancePremiumRule');
    const payrollExport = modelBlock('AttendancePayrollExport');

    for (const field of [
      'requireKnownDevice',
      'requireGeofenceForClockIn',
      'blockOutsideGeofence',
      'requirePhotoAttestation',
      'requireAttestationNote',
      'allowOfflinePunchSync',
      'offlinePunchGraceMinutes',
      'dailyOvertimeMinutes',
      'weeklyOvertimeMinutes',
      'breakRequiredAfterMinutes',
    ]) {
      expect(policy).toContain(field);
    }

    for (const field of ['clientMutationId', 'payload', 'status', 'appliedPunchId', 'rejectionReason']) {
      expect(offlinePunch).toContain(field);
    }

    for (const field of ['type', 'multiplier', 'startsAtMinute', 'endsAtMinute', 'weekdays']) {
      expect(premiumRule).toContain(field);
    }

    for (const field of ['periodStart', 'periodEnd', 'status', 'fileName', 'payload', 'metadata']) {
      expect(payrollExport).toContain(field);
    }
  });
});
