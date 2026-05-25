import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { AttendancePremiumRuleType, AttendancePunchType, AttendanceSource } from '@prisma/client';

import {
  CreateAttendancePolicyDto,
  CreateAttendancePremiumRuleDto,
  SyncOfflinePunchesDto,
} from './dto/attendance.dto';

async function validateDto<T extends object>(dto: new () => T, payload: Record<string, unknown>): Promise<ValidationError[]> {
  return validate(plainToInstance(dto, payload));
}

function serialized(errors: ValidationError[]): string {
  return JSON.stringify(errors);
}

describe('Attendance enterprise DTO validation', () => {
  it('accepts policy controls for geofence, device, photo, offline sync, and payroll behavior', async () => {
    const errors = await validateDto(CreateAttendancePolicyDto, {
      code: 'ENTERPRISE_ATTENDANCE',
      name: 'Enterprise attendance',
      timezone: 'America/Chicago',
      allowWebClockIn: true,
      allowMobileClockIn: true,
      allowKioskClockIn: true,
      requireScheduleForClockIn: true,
      requireLocationCapture: true,
      requireKnownDevice: true,
      requireGeofenceForClockIn: true,
      blockOutsideGeofence: true,
      geofenceGraceMeters: 150,
      requirePhotoAttestation: true,
      requireAttestationNote: true,
      allowOfflinePunchSync: true,
      offlinePunchGraceMinutes: 1440,
      autoCreateTimesheetEntries: true,
      graceMinutesLate: 5,
      graceMinutesEarlyLeave: 5,
      roundingMinutes: 15,
      maxShiftMinutes: 720,
      dailyOvertimeMinutes: 480,
      weeklyOvertimeMinutes: 2400,
      breakRequiredAfterMinutes: 300,
      breakDurationMinutes: 30,
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects policy values that would weaken attendance controls beyond supported bounds', async () => {
    const errors = await validateDto(CreateAttendancePolicyDto, {
      code: 'ENTERPRISE_ATTENDANCE',
      name: 'Enterprise attendance',
      offlinePunchGraceMinutes: 14,
      roundingMinutes: 0,
      maxShiftMinutes: 59,
      geofenceGraceMeters: 10001,
    });

    const output = serialized(errors);
    expect(output).toContain('offlinePunchGraceMinutes');
    expect(output).toContain('roundingMinutes');
    expect(output).toContain('maxShiftMinutes');
    expect(output).toContain('geofenceGraceMeters');
  });

  it('validates premium rule windows and weekday scopes for payroll calculations', async () => {
    const valid = await validateDto(CreateAttendancePremiumRuleDto, {
      code: 'NIGHT_DIFF',
      name: 'Night differential',
      type: AttendancePremiumRuleType.NIGHT,
      multiplier: 1.25,
      startsAtMinute: 1320,
      endsAtMinute: 360,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      effectiveFrom: '2026-05-01T00:00:00.000Z',
    });

    expect(valid).toHaveLength(0);

    const invalid = await validateDto(CreateAttendancePremiumRuleDto, {
      code: 'NIGHT_DIFF',
      name: 'Night differential',
      type: AttendancePremiumRuleType.NIGHT,
      multiplier: 5.5,
      startsAtMinute: 1440,
      endsAtMinute: -1,
      weekdays: [7],
    });

    const output = serialized(invalid);
    expect(output).toContain('multiplier');
    expect(output).toContain('startsAtMinute');
    expect(output).toContain('endsAtMinute');
    expect(output).toContain('weekdays');
  });

  it('limits offline punch sync batches and requires idempotency keys on every punch', async () => {
    const validPunch = {
      clientMutationId: 'offline-20260522-employee-01-clockin',
      type: AttendancePunchType.CLOCK_IN,
      source: AttendanceSource.WEB,
      occurredAt: '2026-05-22T14:00:00.000Z',
      timezone: 'America/Chicago',
    };

    await expect(validateDto(SyncOfflinePunchesDto, { punches: [validPunch] })).resolves.toHaveLength(0);

    const tooMany = await validateDto(SyncOfflinePunchesDto, {
      punches: Array.from({ length: 51 }, (_, index) => ({
        ...validPunch,
        clientMutationId: `offline-20260522-employee-01-${index}`,
      })),
    });
    expect(serialized(tooMany)).toContain('punches');

    const missingMutationId = await validateDto(SyncOfflinePunchesDto, {
      punches: [{ ...validPunch, clientMutationId: undefined }],
    });
    expect(serialized(missingMutationId)).toContain('clientMutationId');
  });
});
