import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { LeaveBlackoutSeverity, LeaveCalendarDayType, LeavePolicyStatus, LeaveTypeUnit } from '@prisma/client';

import {
  AdjustLeaveBalanceDto,
  CreateLeaveApprovalRuleDto,
  CreateLeaveBlackoutWindowDto,
  CreateLeaveCalendarDayDto,
  CreateLeaveCalendarDto,
  CreateLeavePolicyDto,
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
} from './dto/leave.dto';

async function validateDto<T extends object>(dto: new () => T, payload: Record<string, unknown>): Promise<ValidationError[]> {
  return validate(plainToInstance(dto, payload));
}

function serialized(errors: ValidationError[]): string {
  return JSON.stringify(errors);
}

describe('Leave management DTO validation', () => {
  it('accepts leave type, policy, and workflow adoption controls', async () => {
    await expect(validateDto(CreateLeaveTypeDto, {
      code: 'PTO',
      name: 'Paid Time Off',
      category: 'PTO',
      unit: LeaveTypeUnit.DAYS,
      status: LeavePolicyStatus.ACTIVE,
      paid: true,
      requiresDocumentation: false,
      color: '#4b22e8',
    })).resolves.toHaveLength(0);

    await expect(validateDto(CreateLeavePolicyDto, {
      leaveTypeId: 'leave-type-id',
      code: 'PTO_STANDARD',
      name: 'Standard PTO',
      status: LeavePolicyStatus.ACTIVE,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      annualAllowanceMinutes: 7200,
      accrualMethod: 'ANNUAL_GRANT',
      carryoverLimitMinutes: 2400,
      minimumRequestMinutes: 60,
      maximumRequestMinutes: 4800,
      requiresApproval: true,
      workflowCode: 'LEAVE_STANDARD',
      workflowTriggerKey: 'leave.request.submitted',
    })).resolves.toHaveLength(0);

    await expect(validateDto(CreateLeaveApprovalRuleDto, {
      code: 'PTO_MANAGER_HR',
      name: 'PTO manager and HR approval',
      leaveTypeId: 'leave-type-id',
      workflowCode: 'LEAVE_STANDARD',
      triggerKey: 'leave.request.submitted',
      priority: 200,
      minMinutes: 60,
      maxMinutes: 4800,
    })).resolves.toHaveLength(0);
  });

  it('accepts request submission and balance adjustment payloads', async () => {
    await expect(validateDto(CreateLeaveRequestDto, {
      leaveTypeId: 'leave-type-id',
      calendarId: 'calendar-id',
      startAt: '2026-06-02T14:00:00.000Z',
      endAt: '2026-06-02T22:00:00.000Z',
      requestedMinutes: 480,
      reason: 'Planned family appointment.',
      notes: 'Coverage handover is complete.',
      supportingDocumentUrl: 'https://files.example.test/leave-note',
    })).resolves.toHaveLength(0);

    await expect(validateDto(AdjustLeaveBalanceDto, {
      employeeId: 'employee-id',
      leaveTypeId: 'leave-type-id',
      minutes: 480,
      reason: 'Opening leave balance.',
    })).resolves.toHaveLength(0);
  });

  it('accepts calendar, holiday, and blackout control payloads', async () => {
    await expect(validateDto(CreateLeaveCalendarDto, {
      code: 'US_STANDARD',
      name: 'US standard calendar',
      timezone: 'America/Chicago',
      status: LeavePolicyStatus.ACTIVE,
      isDefault: true,
      workWeekdays: [1, 2, 3, 4, 5],
      defaultWorkdayMinutes: 480,
      countryCode: 'US',
      regionCode: 'IL',
    })).resolves.toHaveLength(0);

    await expect(validateDto(CreateLeaveCalendarDayDto, {
      calendarId: 'calendar-id',
      date: '2026-05-25T00:00:00.000Z',
      name: 'Memorial Day',
      type: LeaveCalendarDayType.HOLIDAY,
      paid: true,
      workdayMinutes: 0,
    })).resolves.toHaveLength(0);

    await expect(validateDto(CreateLeaveBlackoutWindowDto, {
      code: 'PAYROLL_CLOSE',
      name: 'Payroll close',
      startsAt: '2026-05-28T00:00:00.000Z',
      endsAt: '2026-05-31T23:59:59.999Z',
      severity: LeaveBlackoutSeverity.WARN,
      calendarId: 'calendar-id',
      leaveTypeId: 'leave-type-id',
      status: LeavePolicyStatus.ACTIVE,
    })).resolves.toHaveLength(0);
  });

  it('rejects weak leave payloads outside supported enterprise bounds', async () => {
    const typeErrors = await validateDto(CreateLeaveTypeDto, {
      code: 'paid time off',
      name: 'P',
      unit: 'WEEKS',
    });
    expect(serialized(typeErrors)).toContain('code');
    expect(serialized(typeErrors)).toContain('name');
    expect(serialized(typeErrors)).toContain('unit');

    const requestErrors = await validateDto(CreateLeaveRequestDto, {
      leaveTypeId: 'leave-type-id',
      startAt: 'not-a-date',
      endAt: '2026-06-02T22:00:00.000Z',
      requestedMinutes: 0,
      reason: 'no',
    });
    const output = serialized(requestErrors);
    expect(output).toContain('startAt');
    expect(output).toContain('requestedMinutes');
    expect(output).toContain('reason');
  });
});
