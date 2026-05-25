import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import argon2 from 'argon2';
import {
  AuditAction,
  AttendanceClockDeviceType,
  AttendanceCorrectionRequestStatus,
  AttendanceControlStatus,
  AttendanceExceptionStatus,
  AttendanceExceptionType,
  AttendanceKioskCredentialStatus,
  AttendanceOfflinePunchStatus,
  AttendancePayrollExportStatus,
  AttendancePolicyStatus,
  AttendancePremiumRuleType,
  AttendancePunchType,
  AttendanceRecordStatus,
  AttendanceSource,
  AttendanceTimesheetEntryStatus,
  AttendanceTimesheetStatus,
  LeaveRequestStatus,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  ScheduleAssignmentStatus,
  TimelineEventType,
  type AttendanceHoliday,
  type AttendanceGeofence,
  type AttendancePolicy,
  type AttendancePremiumRule,
  type AttendanceRecord,
  type AttendanceTimesheet,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import {
  AttendanceInsightsQueryDto,
  CreateAttendanceClockDeviceDto,
  CreateAttendanceCorrectionRequestDto,
  CreateAttendanceGeofenceDto,
  CreateAttendanceHolidayDto,
  CreateAttendanceKioskCredentialDto,
  CreateAttendancePremiumRuleDto,
  CreateAttendancePolicyDto,
  DecideAttendanceCorrectionRequestDto,
  DecideAttendanceExceptionDto,
  DecideTimesheetDto,
  ExportPayrollPeriodDto,
  GenerateTimesheetsDto,
  KioskPunchAttendanceDto,
  ListAttendanceControlsQueryDto,
  ListAttendanceCorrectionRequestsQueryDto,
  ListAttendanceExceptionsQueryDto,
  ListAttendancePayrollExportsQueryDto,
  ListAttendanceRecordsQueryDto,
  ListTimesheetsQueryDto,
  ManualAttendanceRecordDto,
  OfflinePunchAttendanceDto,
  PayrollPeriodActionDto,
  PunchAttendanceDto,
  RunAttendanceReconciliationDto,
  SupervisorAttendanceBoardQueryDto,
  SyncOfflinePunchesDto,
  UpdateAttendanceClockDeviceDto,
  UpdateAttendanceGeofenceDto,
  UpdateAttendanceHolidayDto,
  UpdateAttendanceKioskCredentialDto,
  UpdateAttendancePremiumRuleDto,
  UpdateAttendancePolicyDto,
} from './dto/attendance.dto';

type EmployeeScope =
  | Record<string, never>
  | { employeeId: string }
  | { employeeId: { in: string[] } };

const TERMINAL_ASSIGNMENT_STATUSES: ScheduleAssignmentStatus[] = [
  ScheduleAssignmentStatus.CANCELLED,
  ScheduleAssignmentStatus.DECLINED,
  ScheduleAssignmentStatus.NO_SHOW,
];

const OPEN_EXCEPTION_STATUSES: AttendanceExceptionStatus[] = [
  AttendanceExceptionStatus.OPEN,
  AttendanceExceptionStatus.SUBMITTED,
];

const FINAL_TIMESHEET_STATUSES: AttendanceTimesheetStatus[] = [
  AttendanceTimesheetStatus.APPROVED,
  AttendanceTimesheetStatus.LOCKED,
];

const FINAL_EXCEPTION_DECISION_STATUSES: AttendanceExceptionStatus[] = [
  AttendanceExceptionStatus.APPROVED,
  AttendanceExceptionStatus.REJECTED,
  AttendanceExceptionStatus.WAIVED,
  AttendanceExceptionStatus.RESOLVED,
];

const TIMESHEET_DECISION_STATUSES: AttendanceTimesheetStatus[] = [
  AttendanceTimesheetStatus.APPROVED,
  AttendanceTimesheetStatus.REJECTED,
  AttendanceTimesheetStatus.LOCKED,
  AttendanceTimesheetStatus.REOPENED,
];

const OPEN_CORRECTION_REQUEST_STATUSES: AttendanceCorrectionRequestStatus[] = [
  AttendanceCorrectionRequestStatus.REQUESTED,
  AttendanceCorrectionRequestStatus.APPROVED,
];

const CORRECTION_DECISION_STATUSES: AttendanceCorrectionRequestStatus[] = [
  AttendanceCorrectionRequestStatus.APPROVED,
  AttendanceCorrectionRequestStatus.REJECTED,
  AttendanceCorrectionRequestStatus.CANCELLED,
];

type AttendancePolicyViolationSeverity = 'BLOCK' | 'WARN';

type AttendancePolicyViolation = {
  code: string;
  severity: AttendancePolicyViolationSeverity;
  message: string;
  field?: string;
};

type AttendancePolicyOperation =
  | 'PUNCH'
  | 'MANUAL_RECORD'
  | 'CORRECTION_REQUEST'
  | 'CORRECTION_APPLY'
  | 'TIMESHEET_GENERATE';

type AttendancePolicyEvaluation = {
  operation: AttendancePolicyOperation;
  policyId: string;
  accepted: boolean;
  violations: AttendancePolicyViolation[];
  warnings: AttendancePolicyViolation[];
};

type RecordPunchOptions = {
  source?: AttendanceSource;
  kioskCredentialId?: string;
  offlinePunchId?: string;
  clientMutationId?: string;
};

type AttendanceControlEvaluation = {
  deviceId: string | null;
  deviceName: string | null;
  deviceType: AttendanceClockDeviceType | null;
  geofenceId: string | null;
  geofenceName: string | null;
  distanceMeters: number | null;
  insideGeofence: boolean | null;
  violations: AttendancePolicyViolation[];
  warnings: AttendancePolicyViolation[];
};

type PredictiveAlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const assignmentInclude = {
  employee: { include: { person: true } },
  shift: true,
  policy: true,
  schedule: true,
  organizationNode: true,
  costCenter: true,
  position: true,
} satisfies Prisma.ScheduleAssignmentInclude;

const recordInclude = {
  employee: { include: { person: true } },
  scheduleAssignment: {
    include: {
      shift: true,
      schedule: true,
      organizationNode: true,
      costCenter: true,
      position: true,
    },
  },
  policy: true,
  punches: { orderBy: { occurredAt: 'asc' } },
  breaks: { orderBy: { startedAt: 'asc' } },
  exceptions: { orderBy: { occurredAt: 'desc' } },
} satisfies Prisma.AttendanceRecordInclude;

const exceptionInclude = {
  employee: { include: { person: true } },
  attendanceRecord: true,
  scheduleAssignment: {
    include: {
      shift: true,
      organizationNode: true,
      costCenter: true,
      position: true,
    },
  },
} satisfies Prisma.AttendanceExceptionInclude;

const timesheetInclude = {
  employee: { include: { person: true } },
  policy: true,
  entries: {
    orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
    include: {
      attendanceRecord: true,
      scheduleAssignment: {
        include: {
          shift: true,
          organizationNode: true,
          costCenter: true,
          position: true,
        },
      },
    },
  },
} satisfies Prisma.AttendanceTimesheetInclude;

const correctionRequestInclude = {
  employee: { include: { person: true } },
  attendanceRecord: { include: recordInclude },
  appliedRecord: { include: recordInclude },
  scheduleAssignment: {
    include: {
      shift: true,
      schedule: true,
      organizationNode: true,
      costCenter: true,
      position: true,
    },
  },
  policy: true,
  requestedBy: true,
  decidedBy: true,
  appliedBy: true,
} satisfies Prisma.AttendanceCorrectionRequestInclude;

const payrollExportInclude = {
  employee: { include: { person: true } },
  exportedBy: { include: { person: true } },
  lockedBy: { include: { person: true } },
} satisfies Prisma.AttendancePayrollExportInclude;

const geofenceInclude = {
  devices: true,
} satisfies Prisma.AttendanceGeofenceInclude;

const clockDeviceInclude = {
  geofence: true,
  employee: { include: { person: true } },
} satisfies Prisma.AttendanceClockDeviceInclude;

const kioskCredentialSelect = {
  id: true,
  tenantId: true,
  employeeId: true,
  badgeNumber: true,
  status: true,
  expiresAt: true,
  lastUsedAt: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  employee: { include: { person: true } },
} satisfies Prisma.AttendanceKioskCredentialSelect;

type AttendanceAssignment = Prisma.ScheduleAssignmentGetPayload<{ include: typeof assignmentInclude }>;
type AttendanceRecordWithRelations = Prisma.AttendanceRecordGetPayload<{ include: typeof recordInclude }>;
type AttendanceExceptionWithRelations = Prisma.AttendanceExceptionGetPayload<{ include: typeof exceptionInclude }>;
type AttendanceCorrectionRequestWithRelations = Prisma.AttendanceCorrectionRequestGetPayload<{ include: typeof correctionRequestInclude }>;
type AttendanceLeaveRequestWithRelations = Prisma.LeaveRequestGetPayload<{ include: { employee: { include: { person: true } }; leaveType: true } }>;
type AttendanceTimesheetWithRelations = Prisma.AttendanceTimesheetGetPayload<{ include: typeof timesheetInclude }>;
type AttendanceGeofenceWithRelations = Prisma.AttendanceGeofenceGetPayload<{ include: typeof geofenceInclude }>;
type AttendanceHolidayRow = AttendanceHoliday;
type AttendancePremiumRuleRow = AttendancePremiumRule;
type BoardEmployee = Prisma.EmployeeGetPayload<{ include: { person: true } }>;
type AttendanceDataClient = Prisma.TransactionClient | PrismaService;

type SupervisorBoardStatus =
  | 'SCHEDULED'
  | 'CLOCKED_IN'
  | 'ON_BREAK'
  | 'COMPLETED'
  | 'ABSENT'
  | 'LATE'
  | 'EXCEPTION'
  | 'NEEDS_REVIEW'
  | 'ON_LEAVE'
  | 'UNSCHEDULED';

type SupervisorBoardBucket = {
  employeeId: string;
  employee: BoardEmployee | null;
  assignments: AttendanceAssignment[];
  records: AttendanceRecordWithRelations[];
  exceptions: AttendanceExceptionWithRelations[];
  correctionRequests: AttendanceCorrectionRequestWithRelations[];
  leaveRequests: AttendanceLeaveRequestWithRelations[];
};

type PayrollExportRow = {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  workDate: string;
  timesheetId: string;
  timesheetStatus: AttendanceTimesheetStatus;
  entryId: string;
  entryStatus: AttendanceTimesheetEntryStatus;
  attendanceRecordId: string | null;
  scheduleAssignmentId: string | null;
  shiftName: string;
  organizationNode: string;
  costCenter: string;
  position: string;
  regularMinutes: number;
  overtimeMinutes: number;
  breakMinutes: number;
  payableMinutes: number;
  premiumMinutes: number;
  premiumUnits: number;
  premiumLabels: string;
  exceptionCount: number;
};

type PayrollExportTotals = {
  employeeCount: number;
  timesheetCount: number;
  rowCount: number;
  regularMinutes: number;
  overtimeMinutes: number;
  breakMinutes: number;
  grossPayableMinutes: number;
  premiumMinutes: number;
  premiumUnits: number;
  exceptionCount: number;
};

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const employeeScope = await this.employeeScopeWhere(actor);
    const today = this.startOfDay(new Date());
    const tomorrow = this.addDays(today, 1);
    const periodStart = this.startOfWeek(today);
    const periodEnd = this.addDays(periodStart, 7);
    const policy = await this.ensureActivePolicy(tenantId);

    const [
      scheduledToday,
      clockedInNow,
      completedToday,
      openExceptions,
      pendingCorrections,
      pendingTimesheets,
      lateToday,
      missedClockIns,
      recentRecords,
    ] = await Promise.all([
      this.prisma.scheduleAssignment.count({
        where: {
          tenantId,
          startsAt: { gte: today, lt: tomorrow },
          status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
          ...employeeScope,
        },
      }),
      this.prisma.attendanceRecord.count({
        where: { tenantId, workDate: today, status: AttendanceRecordStatus.OPEN, ...employeeScope },
      }),
      this.prisma.attendanceRecord.count({
        where: { tenantId, workDate: today, status: AttendanceRecordStatus.COMPLETED, ...employeeScope },
      }),
      this.prisma.attendanceException.count({
        where: { tenantId, status: { in: OPEN_EXCEPTION_STATUSES }, ...employeeScope },
      }),
      this.prisma.attendanceCorrectionRequest.count({
        where: { tenantId, status: { in: OPEN_CORRECTION_REQUEST_STATUSES }, ...employeeScope },
      }),
      this.prisma.attendanceTimesheet.count({
        where: { tenantId, status: AttendanceTimesheetStatus.SUBMITTED, ...employeeScope },
      }),
      this.prisma.attendanceException.count({
        where: {
          tenantId,
          type: AttendanceExceptionType.LATE_ARRIVAL,
          occurredAt: { gte: today, lt: tomorrow },
          status: { in: OPEN_EXCEPTION_STATUSES },
          ...employeeScope,
        },
      }),
      this.countMissedClockIns(tenantId, today, tomorrow, employeeScope),
      this.prisma.attendanceRecord.findMany({
        where: { tenantId, createdAt: { gte: periodStart, lt: periodEnd }, ...employeeScope },
        orderBy: [{ createdAt: 'desc' }],
        take: 8,
        include: this.recordInclude,
      }),
    ]);

    return {
      policy,
      metrics: {
        scheduledToday,
        clockedInNow,
        completedToday,
        openExceptions,
        pendingCorrections,
        pendingTimesheets,
        lateToday,
        missedClockIns,
      },
      recentRecords,
      generatedAt: new Date(),
      permissions: {
        tenantAttendance: actor.permissions.includes('attendance.write'),
        teamAttendance: actor.permissions.includes('attendance.team.write'),
        selfAttendance: actor.permissions.includes('attendance.self'),
        approveExceptions: actor.permissions.includes('attendance.exceptions.approve'),
        approveTimesheets: actor.permissions.includes('attendance.timesheets.approve'),
        approveCorrections: actor.permissions.includes('attendance.team.write'),
        manageControls: actor.permissions.includes('attendance.controls.write'),
        readReports: actor.permissions.includes('attendance.reports.read'),
      },
    };
  }

  async getMyAttendance(actor: AuthenticatedPrincipal, query: ListAttendanceRecordsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.requireSelfEmployee(actor);
    const range = this.queryRange(query, 14);
    const activeRecord = await this.prisma.attendanceRecord.findFirst({
      where: { tenantId, employeeId: employee.id, status: AttendanceRecordStatus.OPEN },
      orderBy: { actualClockInAt: 'desc' },
      include: this.recordInclude,
    });

    const [todayAssignments, records, exceptions, correctionRequests, timesheets] = await Promise.all([
      this.prisma.scheduleAssignment.findMany({
        where: {
          tenantId,
          employeeId: employee.id,
          startsAt: { gte: this.startOfDay(new Date()), lt: this.addDays(this.startOfDay(new Date()), 1) },
          status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
        },
        orderBy: [{ startsAt: 'asc' }],
        include: this.assignmentInclude,
      }),
      this.prisma.attendanceRecord.findMany({
        where: { tenantId, employeeId: employee.id, workDate: { gte: range.from, lte: range.to } },
        orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
        take: this.limit(query.limit),
        include: this.recordInclude,
      }),
      this.prisma.attendanceException.findMany({
        where: { tenantId, employeeId: employee.id, status: { not: AttendanceExceptionStatus.CANCELLED } },
        orderBy: [{ occurredAt: 'desc' }],
        take: 20,
        include: this.exceptionInclude,
      }),
      this.prisma.attendanceCorrectionRequest.findMany({
        where: { tenantId, employeeId: employee.id },
        orderBy: [{ requestedAt: 'desc' }, { createdAt: 'desc' }],
        take: 20,
        include: this.correctionRequestInclude,
      }),
      this.prisma.attendanceTimesheet.findMany({
        where: { tenantId, employeeId: employee.id },
        orderBy: [{ periodStart: 'desc' }],
        take: 12,
        include: this.timesheetInclude,
      }),
    ]);

    return {
      employee,
      activeRecord,
      todayAssignments,
      records: this.paginate(records, this.limit(query.limit)),
      exceptions,
      correctionRequests,
      timesheets,
    };
  }

  async punch(actor: AuthenticatedPrincipal, dto: PunchAttendanceDto) {
    const employee = await this.requireSelfEmployee(actor);
    return this.recordPunch(actor, employee.id, dto);
  }

  private async recordPunch(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    dto: PunchAttendanceDto,
    options: RecordPunchOptions = {},
  ) {
    const tenantId = this.requireTenant(actor);
    const occurredAt = dto.occurredAt ? this.toDate(dto.occurredAt) : new Date();
    const workDate = this.startOfDay(occurredAt);
    const policy = await this.ensureActivePolicy(tenantId);
    const assignment = await this.resolvePunchAssignment(tenantId, employeeId, dto.scheduleAssignmentId, occurredAt);
    const source = options.source ?? dto.source ?? AttendanceSource.WEB;
    const locationName = dto.locationName ?? assignment?.locationName ?? null;
    const attestation = {
      photoUrl: dto.photoAttestationUrl?.trim() || null,
      note: dto.attestationNote?.trim() || null,
    };
    const clientMutationId = options.clientMutationId ?? dto.clientMutationId?.trim() ?? null;

    return this.prisma.$transaction(async (tx) => {
      const controlEvaluation = await this.evaluateAttendanceControls(tx, tenantId, policy, assignment, {
        employeeId,
        source,
        deviceId: dto.deviceId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationName,
      });

      this.enforceAttendancePolicy(this.evaluateAttendancePolicy({
        operation: 'PUNCH',
        policy,
        source,
        punchType: dto.type,
        assignment,
        workDate,
        locationName,
        latitude: dto.latitude,
        longitude: dto.longitude,
        photoAttestationUrl: attestation.photoUrl,
        attestationNote: attestation.note,
        controlEvaluation,
      }));

      const { record, created: recordCreated } = await this.findOrCreateOpenRecord(tx, {
        tenantId,
        employeeId,
        workDate,
        assignment,
        policy,
        source,
        timezone: dto.timezone ?? policy.timezone ?? assignment?.timezone ?? null,
        locationName,
        deviceId: dto.deviceId,
      });

      if (dto.type === AttendancePunchType.CLOCK_IN && record.actualClockInAt) {
        throw new ConflictException('You are already clocked in for this attendance record.');
      }

      if (dto.type === AttendancePunchType.CLOCK_OUT && !record.actualClockInAt) {
        throw new BadRequestException('Clock in before clocking out.');
      }

      if (
        (dto.type === AttendancePunchType.BREAK_START || dto.type === AttendancePunchType.BREAK_END) &&
        !record.actualClockInAt
      ) {
        throw new BadRequestException('Clock in before recording a break.');
      }

      const openBreak =
        dto.type === AttendancePunchType.CLOCK_OUT ||
        dto.type === AttendancePunchType.BREAK_START ||
        dto.type === AttendancePunchType.BREAK_END
          ? await tx.attendanceBreak.findFirst({
              where: { attendanceRecordId: record.id, endedAt: null },
              orderBy: { startedAt: 'desc' },
            })
          : null;

      if (dto.type === AttendancePunchType.CLOCK_OUT && openBreak) {
        throw new BadRequestException('End your active break before clocking out.');
      }

      if (dto.type === AttendancePunchType.BREAK_START && openBreak) {
        throw new ConflictException('A break is already active for this attendance record.');
      }

      if (dto.type === AttendancePunchType.BREAK_END && !openBreak) {
        throw new BadRequestException('Start a break before ending it.');
      }

      this.enforceAttendancePolicy(this.evaluateAttendancePolicy({
        operation: 'PUNCH',
        policy,
        source,
        punchType: dto.type,
        assignment,
        workDate: record.workDate,
        locationName: dto.locationName ?? record.locationName,
        latitude: dto.latitude,
        longitude: dto.longitude,
        actualClockInAt: dto.type === AttendancePunchType.CLOCK_OUT ? record.actualClockInAt : null,
        actualClockOutAt: dto.type === AttendancePunchType.CLOCK_OUT ? occurredAt : null,
        breakMinutes: record.breakMinutes,
        photoAttestationUrl: attestation.photoUrl,
        attestationNote: attestation.note,
        controlEvaluation,
      }));

      const punch = await tx.attendancePunch.create({
        data: {
          tenantId,
          employeeId,
          attendanceRecordId: record.id,
          scheduleAssignmentId: assignment?.id ?? null,
          type: dto.type,
          occurredAt,
          timezone: dto.timezone ?? record.timezone,
          source,
          deviceId: dto.deviceId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          locationName: dto.locationName ?? record.locationName,
          note: dto.note,
          metadata: this.toJson({
            controlEvaluation,
            attestation,
            kioskCredentialId: options.kioskCredentialId ?? null,
            offlinePunchId: options.offlinePunchId ?? null,
            clientMutationId,
          }),
        },
      });

      if (dto.deviceId?.trim()) {
        await tx.attendanceClockDevice.updateMany({
          where: { tenantId, deviceId: dto.deviceId.trim(), deletedAt: null },
          data: { lastSeenAt: occurredAt },
        });
      }

      const updated = await this.applyPunchToRecord(tx, record, policy, dto.type, occurredAt);
      const refreshedRecord = await tx.attendanceRecord.findUnique({
        where: { id: updated.id },
        include: this.recordInclude,
      });

      if (!refreshedRecord) {
        throw new NotFoundException('Attendance record not found after punch.');
      }

      await this.syncControlExceptions(refreshedRecord, punch, controlEvaluation, tx);

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.CREATE,
        'attendance.punch',
        punch.id,
        null,
        punch,
      );
      await this.writeAudit(
        tx,
        actor,
        tenantId,
        recordCreated ? AuditAction.CREATE : AuditAction.UPDATE,
        'attendance.record',
        refreshedRecord.id,
        recordCreated ? null : record,
        refreshedRecord,
      );
      await this.writeTimeline(tx, actor, tenantId, employeeId, TimelineEventType.ATTENDANCE_PUNCHED, {
        title: this.punchTitle(dto.type),
        description: this.punchDescription(dto.type, occurredAt),
        entityType: 'AttendanceRecord',
        entityId: refreshedRecord.id,
        data: {
          punchId: punch.id,
          punchType: dto.type,
          occurredAt: occurredAt.toISOString(),
          source: punch.source,
          scheduleAssignmentId: refreshedRecord.scheduleAssignmentId,
          status: refreshedRecord.status,
          controlEvaluation,
          attestation,
          kioskCredentialId: options.kioskCredentialId ?? null,
          offlinePunchId: options.offlinePunchId ?? null,
          clientMutationId,
        },
      });
      await this.writeOutbox(tx, tenantId, 'attendance.punch.recorded', 'AttendanceRecord', refreshedRecord.id, {
        employeeId,
        recordId: refreshedRecord.id,
        punchId: punch.id,
        punchType: dto.type,
        occurredAt: occurredAt.toISOString(),
        source: punch.source,
        scheduleAssignmentId: refreshedRecord.scheduleAssignmentId,
        status: refreshedRecord.status,
        controlEvaluation,
        attestation,
        kioskCredentialId: options.kioskCredentialId ?? null,
        offlinePunchId: options.offlinePunchId ?? null,
        clientMutationId,
      });

      return {
        record: refreshedRecord,
        punch,
      };
    });
  }

  async kioskPunch(actor: AuthenticatedPrincipal, dto: KioskPunchAttendanceDto) {
    const tenantId = this.requireTenant(actor);
    const badgeNumber = dto.badgeNumber.trim();
    const credential = await this.prisma.attendanceKioskCredential.findFirst({
      where: { tenantId, badgeNumber, deletedAt: null },
      include: { employee: { include: { person: true } } },
    });

    if (!credential) {
      throw new ForbiddenException('Invalid badge or PIN.');
    }

    if (credential.status !== AttendanceKioskCredentialStatus.ACTIVE) {
      throw new ForbiddenException('This kiosk credential is not active.');
    }

    if (credential.expiresAt && credential.expiresAt <= new Date()) {
      throw new ForbiddenException('This kiosk credential has expired.');
    }

    let pinMatches = false;
    try {
      pinMatches = await argon2.verify(credential.pinHash, dto.pin);
    } catch {
      pinMatches = false;
    }
    if (!pinMatches) {
      throw new ForbiddenException('Invalid badge or PIN.');
    }

    const result = await this.recordPunch(
      actor,
      credential.employeeId,
      {
        ...dto,
        source: AttendanceSource.KIOSK,
      },
      {
        source: AttendanceSource.KIOSK,
        kioskCredentialId: credential.id,
        clientMutationId: dto.clientMutationId,
      },
    );

    const safeCredential = await this.prisma.attendanceKioskCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: result.punch.occurredAt },
      select: this.kioskCredentialSelect,
    });

    return {
      ...result,
      credential: safeCredential,
    };
  }

  async syncOfflinePunches(actor: AuthenticatedPrincipal, dto: SyncOfflinePunchesDto) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.requireSelfEmployee(actor);
    const policy = await this.ensureActivePolicy(tenantId);

    if (!policy.allowOfflinePunchSync) {
      throw new BadRequestException('Offline punch sync is disabled by the active attendance policy.');
    }

    const results = [];
    for (const item of dto.punches) {
      results.push(await this.syncOfflinePunch(actor, employee.id, policy, item));
    }

    return {
      syncedAt: new Date(),
      summary: {
        received: dto.punches.length,
        applied: results.filter((result) => result.status === AttendanceOfflinePunchStatus.APPLIED).length,
        duplicate: results.filter((result) => result.status === AttendanceOfflinePunchStatus.DUPLICATE).length,
        rejected: results.filter((result) => result.status === AttendanceOfflinePunchStatus.REJECTED).length,
      },
      results,
    };
  }

  private async syncOfflinePunch(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    policy: AttendancePolicy,
    item: OfflinePunchAttendanceDto,
  ) {
    const tenantId = this.requireTenant(actor);
    const clientMutationId = item.clientMutationId.trim();
    const existing = await this.prisma.attendanceOfflinePunch.findUnique({
      where: { tenantId_clientMutationId: { tenantId, clientMutationId } },
    });

    if (existing) {
      return {
        id: existing.id,
        clientMutationId,
        status: existing.status === AttendanceOfflinePunchStatus.APPLIED
          ? AttendanceOfflinePunchStatus.DUPLICATE
          : existing.status,
        appliedPunchId: existing.appliedPunchId,
        rejectionReason: existing.rejectionReason,
      };
    }

    const occurredAt = item.occurredAt ? this.toDate(item.occurredAt) : null;
    const rejectedReason = !occurredAt
      ? 'Offline punch payload is missing occurredAt.'
      : occurredAt < this.addMinutes(new Date(), -policy.offlinePunchGraceMinutes)
        ? `Offline punch is older than the ${policy.offlinePunchGraceMinutes} minute sync grace period.`
        : null;

    const ledger = await this.prisma.attendanceOfflinePunch.create({
      data: {
        tenantId,
        employeeId,
        clientMutationId,
        type: item.type,
        occurredAt: occurredAt ?? new Date(),
        source: item.source ?? AttendanceSource.WEB,
        status: rejectedReason ? AttendanceOfflinePunchStatus.REJECTED : AttendanceOfflinePunchStatus.PENDING,
        deviceId: item.deviceId?.trim() || null,
        payload: this.toJson(this.offlinePunchPayload(item))!,
        rejectionReason: rejectedReason,
      },
    });

    if (rejectedReason) {
      return {
        id: ledger.id,
        clientMutationId,
        status: AttendanceOfflinePunchStatus.REJECTED,
        appliedPunchId: null,
        rejectionReason: rejectedReason,
      };
    }

    try {
      const result = await this.recordPunch(
        actor,
        employeeId,
        {
          ...item,
          occurredAt: occurredAt!.toISOString(),
          source: item.source ?? AttendanceSource.WEB,
        },
        {
          source: item.source ?? AttendanceSource.WEB,
          offlinePunchId: ledger.id,
          clientMutationId,
        },
      );
      const updated = await this.prisma.attendanceOfflinePunch.update({
        where: { id: ledger.id },
        data: {
          status: AttendanceOfflinePunchStatus.APPLIED,
          appliedPunchId: result.punch.id,
        },
      });

      return {
        id: updated.id,
        clientMutationId,
        status: updated.status,
        appliedPunchId: updated.appliedPunchId,
        rejectionReason: null,
      };
    } catch (error) {
      const rejectionReason = error instanceof Error ? error.message : 'Offline punch could not be applied.';
      const updated = await this.prisma.attendanceOfflinePunch.update({
        where: { id: ledger.id },
        data: {
          status: AttendanceOfflinePunchStatus.REJECTED,
          rejectionReason,
        },
      });

      return {
        id: updated.id,
        clientMutationId,
        status: updated.status,
        appliedPunchId: updated.appliedPunchId,
        rejectionReason,
      };
    }
  }

  async listRecords(actor: AuthenticatedPrincipal, query: ListAttendanceRecordsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = this.limit(query.limit);
    const where = {
      tenantId,
      ...await this.employeeScopeWhere(actor),
      ...this.recordsFilterWhere(query),
    } satisfies Prisma.AttendanceRecordWhereInput;

    const rows = await this.prisma.attendanceRecord.findMany({
      where,
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.recordInclude,
    });

    return this.paginate(rows, limit);
  }

  async getSupervisorBoard(actor: AuthenticatedPrincipal, query: SupervisorAttendanceBoardQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = this.limit(query.limit);
    const boardDate = this.startOfDay(this.toDate(query.date || query.from || new Date()));
    const tomorrow = this.addDays(boardDate, 1);
    const employeeScope = await this.employeeScopeWhere(actor);
    const employeeWhere = query.employeeId ? { employeeId: query.employeeId } : employeeScope;

    if (query.employeeId) {
      await this.assertCanOperateOnEmployee(actor, query.employeeId);
    }

    const [assignments, records, exceptions, correctionRequests, leaveRequests] = await Promise.all([
      this.prisma.scheduleAssignment.findMany({
        where: {
          tenantId,
          workDate: boardDate,
          status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
          ...employeeWhere,
          ...this.employeeSearchWhere(query),
          ...this.assignmentDirectDimensionWhere(query),
          ...(query.locationName ? { locationName: { contains: query.locationName, mode: Prisma.QueryMode.insensitive } } : {}),
        },
        orderBy: [{ startsAt: 'asc' }, { employeeId: 'asc' }],
        include: this.assignmentInclude,
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          tenantId,
          workDate: boardDate,
          ...employeeWhere,
          ...(query.status ? { status: query.status } : {}),
          ...(query.locationName ? { locationName: { contains: query.locationName, mode: Prisma.QueryMode.insensitive } } : {}),
          ...this.employeeSearchWhere(query),
          ...this.assignmentDimensionWhere(query),
        },
        orderBy: [{ actualClockInAt: 'asc' }, { createdAt: 'asc' }],
        include: this.recordInclude,
      }),
      this.prisma.attendanceException.findMany({
        where: {
          tenantId,
          occurredAt: { gte: boardDate, lt: tomorrow },
          status: { in: OPEN_EXCEPTION_STATUSES },
          ...employeeWhere,
          ...this.employeeSearchWhere(query),
          ...this.assignmentDimensionWhere(query),
        },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        include: this.exceptionInclude,
      }),
      this.prisma.attendanceCorrectionRequest.findMany({
        where: {
          tenantId,
          workDate: boardDate,
          status: { in: OPEN_CORRECTION_REQUEST_STATUSES },
          ...employeeWhere,
          ...this.employeeSearchWhere(query),
          ...this.assignmentDimensionWhere(query),
        },
        orderBy: [{ requestedAt: 'asc' }, { createdAt: 'asc' }],
        include: this.correctionRequestInclude,
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          tenantId,
          status: { in: [LeaveRequestStatus.APPROVED, LeaveRequestStatus.TAKEN] },
          startAt: { lt: tomorrow },
          endAt: { gt: boardDate },
          deletedAt: null,
          ...employeeWhere,
          employee: query.employeeSearch
            ? {
                OR: [
                  { employeeNumber: { contains: query.employeeSearch, mode: Prisma.QueryMode.insensitive } },
                  { person: { firstName: { contains: query.employeeSearch, mode: Prisma.QueryMode.insensitive } } },
                  { person: { lastName: { contains: query.employeeSearch, mode: Prisma.QueryMode.insensitive } } },
                ],
              }
            : undefined,
        },
        orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
        include: { employee: { include: { person: true } }, leaveType: true },
      }),
    ]);

    const buckets = new Map<string, SupervisorBoardBucket>();
    const ensureBucket = (employeeId: string, employee?: BoardEmployee | null) => {
      const existing = buckets.get(employeeId);
      if (existing) {
        if (!existing.employee && employee) {
          existing.employee = employee;
        }
        return existing;
      }

      const bucket: SupervisorBoardBucket = {
        employeeId,
        employee: employee ?? null,
        assignments: [],
        records: [],
        exceptions: [],
        correctionRequests: [],
        leaveRequests: [],
      };
      buckets.set(employeeId, bucket);
      return bucket;
    };

    for (const assignment of assignments) {
      ensureBucket(assignment.employeeId, assignment.employee).assignments.push(assignment);
    }

    for (const record of records) {
      ensureBucket(record.employeeId, record.employee).records.push(record);
    }

    for (const exception of exceptions) {
      ensureBucket(exception.employeeId, exception.employee).exceptions.push(exception);
    }

    for (const request of correctionRequests) {
      ensureBucket(request.employeeId, request.employee).correctionRequests.push(request);
    }

    for (const request of leaveRequests) {
      ensureBucket(request.employeeId, request.employee).leaveRequests.push(request);
    }

    const now = new Date();
    const rows = [...buckets.values()]
      .map((bucket) => {
        const orderedAssignments = [...bucket.assignments].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
        const orderedRecords = [...bucket.records].sort(
          (left, right) => (left.actualClockInAt ?? left.createdAt).getTime() - (right.actualClockInAt ?? right.createdAt).getTime(),
        );
        const openRecord = orderedRecords.find((record) => record.status === AttendanceRecordStatus.OPEN) ?? null;
        const primaryRecord = openRecord ?? orderedRecords[0] ?? null;
        const scheduledStartAt = this.minDate([
          ...orderedAssignments.map((assignment) => assignment.startsAt),
          ...orderedRecords.map((record) => record.scheduledStartAt),
        ]);
        const scheduledEndAt = this.maxDate([
          ...orderedAssignments.map((assignment) => assignment.endsAt),
          ...orderedRecords.map((record) => record.scheduledEndAt),
        ]);
        const actualClockInAt = this.minDate(orderedRecords.map((record) => record.actualClockInAt));
        const actualClockOutAt = this.maxDate(orderedRecords.map((record) => record.actualClockOutAt));
        const totals = orderedRecords.reduce(
          (acc, record) => ({
            scheduledMinutes: acc.scheduledMinutes + record.scheduledMinutes,
            actualMinutes: acc.actualMinutes + record.actualMinutes,
            breakMinutes: acc.breakMinutes + record.breakMinutes,
            payableMinutes: acc.payableMinutes + record.payableMinutes,
            overtimeMinutes: acc.overtimeMinutes + record.overtimeMinutes,
            lateMinutes: acc.lateMinutes + record.lateMinutes,
          }),
          { scheduledMinutes: 0, actualMinutes: 0, breakMinutes: 0, payableMinutes: 0, overtimeMinutes: 0, lateMinutes: 0 },
        );
        const scheduledMinutes = totals.scheduledMinutes || orderedAssignments.reduce(
          (acc, assignment) => acc + this.durationMinutes(assignment.startsAt, assignment.endsAt, assignment.breakMinutes),
          0,
        );
        const status = this.supervisorBoardStatus(bucket, now);

        return {
          employeeId: bucket.employeeId,
          employee: bucket.employee,
          workDate: boardDate,
          status,
          statusLabel: this.humanizeEnum(status),
          scheduledStartAt,
          scheduledEndAt,
          actualClockInAt,
          actualClockOutAt,
          scheduledMinutes,
          actualMinutes: totals.actualMinutes,
          breakMinutes: totals.breakMinutes,
          payableMinutes: totals.payableMinutes,
          overtimeMinutes: totals.overtimeMinutes,
          lateMinutes: totals.lateMinutes,
          assignmentCount: orderedAssignments.length,
          recordCount: orderedRecords.length,
          exceptionCount: bucket.exceptions.length,
          pendingCorrectionCount: bucket.correctionRequests.length,
          leaveCount: bucket.leaveRequests.length,
          assignments: orderedAssignments,
          records: orderedRecords,
          record: primaryRecord,
          exceptions: bucket.exceptions,
          correctionRequests: bucket.correctionRequests,
          leaveRequests: bucket.leaveRequests,
        };
      })
      .sort((left, right) => {
        const leftTime = new Date(left.scheduledStartAt ?? left.actualClockInAt ?? left.workDate).getTime();
        const rightTime = new Date(right.scheduledStartAt ?? right.actualClockInAt ?? right.workDate).getTime();
        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }
        return this.employeeDisplayName(left.employee).localeCompare(this.employeeDisplayName(right.employee));
      })
      .slice(0, limit);

    const metrics = rows.reduce(
      (acc, row) => ({
        scheduled: acc.scheduled + (row.assignmentCount > 0 ? 1 : 0),
        present: acc.present + (row.actualClockInAt ? 1 : 0),
        clockedIn: acc.clockedIn + (row.status === 'CLOCKED_IN' ? 1 : 0),
        onBreak: acc.onBreak + (row.status === 'ON_BREAK' ? 1 : 0),
        completed: acc.completed + (row.status === 'COMPLETED' ? 1 : 0),
        absent: acc.absent + (row.status === 'ABSENT' ? 1 : 0),
        late: acc.late + (row.status === 'LATE' || row.lateMinutes > 0 ? 1 : 0),
        exceptions: acc.exceptions + row.exceptionCount,
        pendingCorrections: acc.pendingCorrections + row.pendingCorrectionCount,
        onLeave: acc.onLeave + (row.status === 'ON_LEAVE' ? 1 : 0),
        unscheduled: acc.unscheduled + (row.status === 'UNSCHEDULED' ? 1 : 0),
      }),
      {
        scheduled: 0,
        present: 0,
        clockedIn: 0,
        onBreak: 0,
        completed: 0,
        absent: 0,
        late: 0,
        exceptions: 0,
        pendingCorrections: 0,
        onLeave: 0,
        unscheduled: 0,
      },
    );

    return {
      date: boardDate,
      generatedAt: new Date(),
      metrics,
      rows,
    };
  }

  async getAdvancedReport(actor: AuthenticatedPrincipal, query: AttendanceInsightsQueryDto) {
    const insight = await this.collectAttendanceInsightData(actor, query);
    const records = insight.records;
    const exceptions = insight.exceptions;
    const corrections = insight.correctionRequests;
    const timesheets = insight.timesheets;
    const assignments = insight.assignments;
    const punches = insight.punches;

    const totals = records.reduce(
      (acc, record) => ({
        recordCount: acc.recordCount + 1,
        scheduledMinutes: acc.scheduledMinutes + record.scheduledMinutes,
        actualMinutes: acc.actualMinutes + record.actualMinutes,
        payableMinutes: acc.payableMinutes + record.payableMinutes,
        overtimeMinutes: acc.overtimeMinutes + record.overtimeMinutes,
        breakMinutes: acc.breakMinutes + record.breakMinutes,
        lateMinutes: acc.lateMinutes + record.lateMinutes,
        earlyLeaveMinutes: acc.earlyLeaveMinutes + record.earlyLeaveMinutes,
      }),
      {
        recordCount: 0,
        scheduledMinutes: 0,
        actualMinutes: 0,
        payableMinutes: 0,
        overtimeMinutes: 0,
        breakMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
      },
    );
    const deviceIds = new Set(insight.devices.map((device) => device.deviceId));
    const missingDevicePunches = punches.filter((punch) => !punch.deviceId).length;
    const outsideGeofenceExceptions = exceptions.filter((exception) => exception.type === AttendanceExceptionType.OUTSIDE_GEOFENCE).length;
    const unapprovedLocationExceptions = exceptions.filter((exception) => exception.type === AttendanceExceptionType.UNAPPROVED_LOCATION).length;
    const openExceptions = exceptions.filter((exception) => OPEN_EXCEPTION_STATUSES.includes(exception.status)).length;
    const pendingCorrections = corrections.filter((request) => OPEN_CORRECTION_REQUEST_STATUSES.includes(request.status)).length;
    const trendMap = new Map<string, {
      date: string;
      scheduledAssignments: number;
      records: number;
      exceptions: number;
      scheduledMinutes: number;
      actualMinutes: number;
      payableMinutes: number;
      overtimeMinutes: number;
      lateMinutes: number;
    }>();
    const ensureTrend = (date: Date) => {
      const key = this.formatDate(this.startOfDay(date));
      const existing = trendMap.get(key);
      if (existing) {
        return existing;
      }
      const item = {
        date: key,
        scheduledAssignments: 0,
        records: 0,
        exceptions: 0,
        scheduledMinutes: 0,
        actualMinutes: 0,
        payableMinutes: 0,
        overtimeMinutes: 0,
        lateMinutes: 0,
      };
      trendMap.set(key, item);
      return item;
    };

    for (const assignment of assignments) {
      const trend = ensureTrend(assignment.workDate);
      trend.scheduledAssignments += 1;
      trend.scheduledMinutes += this.durationMinutes(assignment.startsAt, assignment.endsAt, assignment.breakMinutes);
    }

    for (const record of records) {
      const trend = ensureTrend(record.workDate);
      trend.records += 1;
      trend.actualMinutes += record.actualMinutes;
      trend.payableMinutes += record.payableMinutes;
      trend.overtimeMinutes += record.overtimeMinutes;
      trend.lateMinutes += record.lateMinutes;
    }

    for (const exception of exceptions) {
      ensureTrend(exception.occurredAt).exceptions += 1;
    }

    return {
      range: {
        from: insight.range.from,
        to: insight.range.to,
      },
      generatedAt: new Date(),
      totals,
      metrics: {
        scheduledAssignments: assignments.length,
        completedRecords: records.filter((record) => record.status === AttendanceRecordStatus.COMPLETED).length,
        openRecords: records.filter((record) => record.status === AttendanceRecordStatus.OPEN).length,
        openExceptions,
        pendingCorrections,
        payrollBlockers: openExceptions + pendingCorrections,
        totalPunches: punches.length,
        missingDevicePunches,
        knownDevicePunches: punches.filter((punch) => punch.deviceId && deviceIds.has(punch.deviceId)).length,
        kioskPunches: punches.filter((punch) => punch.source === AttendanceSource.KIOSK).length,
        mobilePunches: punches.filter((punch) => punch.source === AttendanceSource.MOBILE).length,
        outsideGeofenceExceptions,
        unapprovedLocationExceptions,
      },
      breakdowns: {
        recordStatus: this.countBy(records.map((record) => record.status)),
        source: this.countBy(records.map((record) => record.source)),
        exceptionType: this.countBy(exceptions.map((exception) => exception.type)),
        exceptionStatus: this.countBy(exceptions.map((exception) => exception.status)),
        correctionStatus: this.countBy(corrections.map((request) => request.status)),
        timesheetStatus: this.countBy(timesheets.map((timesheet) => timesheet.status)),
      },
      payrollReadiness: {
        timesheetCount: timesheets.length,
        readyTimesheets: timesheets.filter((timesheet) => FINAL_TIMESHEET_STATUSES.includes(timesheet.status)).length,
        pendingCorrections,
        openExceptions,
        blockerCount: openExceptions + pendingCorrections,
      },
      controlReadiness: {
        geofenceCount: insight.geofences.length,
        activeGeofences: insight.geofences.filter((geofence) => geofence.status === AttendanceControlStatus.ACTIVE).length,
        deviceCount: insight.devices.length,
        activeDevices: insight.devices.filter((device) => device.status === AttendanceControlStatus.ACTIVE).length,
        kioskDevices: insight.devices.filter((device) => device.type === AttendanceClockDeviceType.KIOSK).length,
        lastDeviceSeenAt: this.maxDate(insight.devices.map((device) => device.lastSeenAt)),
      },
      trends: {
        byDay: [...trendMap.values()].sort((left, right) => left.date.localeCompare(right.date)),
      },
      topEmployees: this.attendanceRiskEmployees(insight).slice(0, 10),
    };
  }

  async getPredictiveAlerts(actor: AuthenticatedPrincipal, query: AttendanceInsightsQueryDto) {
    const insight = await this.collectAttendanceInsightData(actor, query);
    const rows = this.attendanceRiskEmployees(insight);
    const alerts = rows.flatMap((row) => {
      const employeeAlerts: Array<{
        id: string;
        type: string;
        severity: PredictiveAlertSeverity;
        score: number;
        employeeId: string;
        employee: BoardEmployee | null;
        title: string;
        body: string;
        recommendedAction: string;
        signals: Record<string, number>;
      }> = [];

      if (row.score >= 70) {
        employeeAlerts.push({
          id: `${row.employeeId}:attendance-risk`,
          type: 'ATTENDANCE_RISK_HIGH',
          severity: row.score >= 100 ? 'CRITICAL' : 'HIGH',
          score: row.score,
          employeeId: row.employeeId,
          employee: row.employee,
          title: 'High attendance risk',
          body: `${row.employeeName} has repeated late, exception, correction, or control signals in the selected period.`,
          recommendedAction: 'Review recent records, resolve open exceptions, and confirm upcoming schedule coverage.',
          signals: row.signals,
        });
      }

      if (row.signals.pendingCorrections > 0 || row.signals.openExceptions > 0) {
        employeeAlerts.push({
          id: `${row.employeeId}:payroll-blocker`,
          type: 'PAYROLL_BLOCKER',
          severity: row.signals.openExceptions >= 3 ? 'HIGH' : 'MEDIUM',
          score: Math.min(100, row.signals.openExceptions * 18 + row.signals.pendingCorrections * 12),
          employeeId: row.employeeId,
          employee: row.employee,
          title: 'Payroll blocker',
          body: `${row.employeeName} has ${row.signals.openExceptions} open exceptions and ${row.signals.pendingCorrections} pending corrections.`,
          recommendedAction: 'Clear exceptions and correction approvals before locking the pay period.',
          signals: row.signals,
        });
      }

      if (row.signals.outsideGeofence > 0 || row.signals.unapprovedLocation > 0) {
        employeeAlerts.push({
          id: `${row.employeeId}:location-risk`,
          type: 'GEOFENCE_DEVICE_RISK',
          severity: row.signals.outsideGeofence >= 2 ? 'HIGH' : 'MEDIUM',
          score: Math.min(100, row.signals.outsideGeofence * 30 + row.signals.unapprovedLocation * 24),
          employeeId: row.employeeId,
          employee: row.employee,
          title: 'Location or device risk',
          body: `${row.employeeName} has punches tied to outside-geofence or unapproved-location signals.`,
          recommendedAction: 'Validate the device, geofence radius, and punch source before approving time.',
          signals: row.signals,
        });
      }

      if (row.signals.overtimeMinutes >= 240) {
        employeeAlerts.push({
          id: `${row.employeeId}:overtime-trend`,
          type: 'OVERTIME_TREND',
          severity: row.signals.overtimeMinutes >= 480 ? 'HIGH' : 'MEDIUM',
          score: Math.min(100, Math.round(row.signals.overtimeMinutes / 6)),
          employeeId: row.employeeId,
          employee: row.employee,
          title: 'Overtime trend',
          body: `${row.employeeName} is trending toward elevated overtime based on recent actual hours.`,
          recommendedAction: 'Check coverage, upcoming assignments, and staffing balance before the period closes.',
          signals: row.signals,
        });
      }

      if (row.signals.missedOrAbsent > 0) {
        employeeAlerts.push({
          id: `${row.employeeId}:no-show-risk`,
          type: 'NO_SHOW_RISK',
          severity: row.signals.missedOrAbsent >= 2 ? 'HIGH' : 'MEDIUM',
          score: Math.min(100, row.signals.missedOrAbsent * 35),
          employeeId: row.employeeId,
          employee: row.employee,
          title: 'No-show risk',
          body: `${row.employeeName} has missed-clock or absence signals that could affect near-term coverage.`,
          recommendedAction: 'Confirm attendance status with the supervisor and compare to today and tomorrow assignments.',
          signals: row.signals,
        });
      }

      return employeeAlerts;
    }).sort((left, right) => right.score - left.score || left.employeeId.localeCompare(right.employeeId));

    return {
      range: {
        from: insight.range.from,
        to: insight.range.to,
      },
      generatedAt: new Date(),
      summary: {
        alertCount: alerts.length,
        critical: alerts.filter((alert) => alert.severity === 'CRITICAL').length,
        high: alerts.filter((alert) => alert.severity === 'HIGH').length,
        medium: alerts.filter((alert) => alert.severity === 'MEDIUM').length,
        low: alerts.filter((alert) => alert.severity === 'LOW').length,
      },
      alerts: alerts.slice(0, this.limit(query.limit)),
    };
  }

  async notifyPredictiveAlerts(actor: AuthenticatedPrincipal, query: AttendanceInsightsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const payload = await this.getPredictiveAlerts(actor, query);
    const alerts = payload.alerts.slice(0, this.limit(query.limit));

    const notifications = await this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const alert of alerts) {
        created.push(await this.createAttendanceNotification(tx, tenantId, alert.employeeId, {
          title: alert.title,
          body: `${alert.body} Recommended action: ${alert.recommendedAction}`,
          data: {
            module: 'attendance',
            type: alert.type,
            severity: alert.severity,
            score: alert.score,
            signals: alert.signals,
            generatedAt: payload.generatedAt,
          },
        }));
      }

      await this.writeOutbox(tx, tenantId, 'attendance.predictive_alerts.notified', 'AttendancePredictiveAlert', tenantId, {
        alertCount: created.length,
        range: payload.range,
      });

      return created;
    });

    return {
      notifiedAt: new Date(),
      alertCount: alerts.length,
      notificationCount: notifications.length,
      notifications,
    };
  }

  async listGeofences(actor: AuthenticatedPrincipal, query: ListAttendanceControlsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = this.limit(query.limit);
    const rows = await this.prisma.attendanceGeofence.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.controlStatus ? { status: query.controlStatus } : {}),
        ...(query.locationName ? { locationName: { contains: query.locationName, mode: Prisma.QueryMode.insensitive } } : {}),
        ...(query.organizationNodeId ? { organizationNodeId: query.organizationNodeId } : {}),
        ...(query.costCenterId ? { costCenterId: query.costCenterId } : {}),
        ...(query.positionId ? { positionId: query.positionId } : {}),
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.geofenceInclude,
    });

    return this.paginate(rows, limit);
  }

  async createGeofence(actor: AuthenticatedPrincipal, dto: CreateAttendanceGeofenceDto) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.$transaction(async (tx) => {
      const geofence = await tx.attendanceGeofence.create({
        data: this.geofenceData(tenantId, dto),
        include: this.geofenceInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'attendance.geofence', geofence.id, null, geofence);
      await this.writeOutbox(tx, tenantId, 'attendance.geofence.created', 'AttendanceGeofence', geofence.id, {
        geofenceId: geofence.id,
        code: geofence.code,
        status: geofence.status,
      });

      return geofence;
    });
  }

  async updateGeofence(actor: AuthenticatedPrincipal, geofenceId: string, dto: UpdateAttendanceGeofenceDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.assertGeofenceExists(tenantId, geofenceId);
    return this.prisma.$transaction(async (tx) => {
      const geofence = await tx.attendanceGeofence.update({
        where: { id: before.id },
        data: this.geofenceUpdateData(dto),
        include: this.geofenceInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'attendance.geofence', geofence.id, before, geofence);
      await this.writeOutbox(tx, tenantId, 'attendance.geofence.updated', 'AttendanceGeofence', geofence.id, {
        geofenceId: geofence.id,
        code: geofence.code,
        status: geofence.status,
      });

      return geofence;
    });
  }

  async listClockDevices(actor: AuthenticatedPrincipal, query: ListAttendanceControlsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = this.limit(query.limit);
    const rows = await this.prisma.attendanceClockDevice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.controlStatus ? { status: query.controlStatus } : {}),
        ...(query.deviceType ? { type: query.deviceType } : {}),
        ...(query.geofenceId ? { geofenceId: query.geofenceId } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.locationName ? { locationName: { contains: query.locationName, mode: Prisma.QueryMode.insensitive } } : {}),
      },
      orderBy: [{ status: 'asc' }, { type: 'asc' }, { name: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.clockDeviceInclude,
    });

    return this.paginate(rows, limit);
  }

  async createClockDevice(actor: AuthenticatedPrincipal, dto: CreateAttendanceClockDeviceDto) {
    const tenantId = this.requireTenant(actor);
    await this.assertDeviceReferences(tenantId, dto.geofenceId, dto.employeeId);
    return this.prisma.$transaction(async (tx) => {
      const device = await tx.attendanceClockDevice.create({
        data: this.clockDeviceData(tenantId, dto),
        include: this.clockDeviceInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'attendance.clock_device', device.id, null, device);
      await this.writeOutbox(tx, tenantId, 'attendance.device.created', 'AttendanceClockDevice', device.id, {
        clockDeviceId: device.id,
        deviceId: device.deviceId,
        type: device.type,
        status: device.status,
        geofenceId: device.geofenceId,
      });

      return device;
    });
  }

  async updateClockDevice(actor: AuthenticatedPrincipal, deviceId: string, dto: UpdateAttendanceClockDeviceDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.assertClockDeviceExists(tenantId, deviceId);
    await this.assertDeviceReferences(tenantId, dto.geofenceId, dto.employeeId);
    return this.prisma.$transaction(async (tx) => {
      const device = await tx.attendanceClockDevice.update({
        where: { id: before.id },
        data: this.clockDeviceUpdateData(dto),
        include: this.clockDeviceInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'attendance.clock_device', device.id, before, device);
      await this.writeOutbox(tx, tenantId, 'attendance.device.updated', 'AttendanceClockDevice', device.id, {
        clockDeviceId: device.id,
        deviceId: device.deviceId,
        type: device.type,
        status: device.status,
        geofenceId: device.geofenceId,
      });

      return device;
    });
  }

  async listKioskCredentials(actor: AuthenticatedPrincipal, query: ListAttendanceControlsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = this.limit(query.limit);
    const rows = await this.prisma.attendanceKioskCredential.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.kioskCredentialStatus ? { status: query.kioskCredentialStatus } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...this.employeeSearchWhere(query),
      },
      orderBy: [{ status: 'asc' }, { badgeNumber: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: this.kioskCredentialSelect,
    });

    return this.paginate(rows, limit);
  }

  async createKioskCredential(actor: AuthenticatedPrincipal, dto: CreateAttendanceKioskCredentialDto) {
    const tenantId = this.requireTenant(actor);
    await this.assertCanOperateOnEmployee(actor, dto.employeeId);
    await this.assertEmployeeExists(tenantId, dto.employeeId);
    const pinHash = await this.hashKioskPin(dto.pin);

    return this.prisma.$transaction(async (tx) => {
      const credential = await tx.attendanceKioskCredential.create({
        data: {
          tenantId,
          employeeId: dto.employeeId,
          badgeNumber: dto.badgeNumber.trim(),
          pinHash,
          status: dto.status ?? AttendanceKioskCredentialStatus.ACTIVE,
          expiresAt: dto.expiresAt ? this.toDate(dto.expiresAt) : null,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
        select: this.kioskCredentialSelect,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'attendance.kiosk_credential', credential.id, null, credential);
      await this.writeOutbox(tx, tenantId, 'attendance.kiosk_credential.created', 'AttendanceKioskCredential', credential.id, {
        credentialId: credential.id,
        employeeId: credential.employeeId,
        badgeNumber: credential.badgeNumber,
        status: credential.status,
      });

      return credential;
    });
  }

  async updateKioskCredential(actor: AuthenticatedPrincipal, credentialId: string, dto: UpdateAttendanceKioskCredentialDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.assertKioskCredentialExists(tenantId, credentialId);

    if (dto.employeeId) {
      await this.assertCanOperateOnEmployee(actor, dto.employeeId);
      await this.assertEmployeeExists(tenantId, dto.employeeId);
    }

    const pinHash = dto.pin ? await this.hashKioskPin(dto.pin) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const credential = await tx.attendanceKioskCredential.update({
        where: { id: before.id },
        data: {
          employeeId: dto.employeeId,
          badgeNumber: dto.badgeNumber === undefined ? undefined : dto.badgeNumber.trim(),
          pinHash,
          status: dto.status,
          expiresAt: dto.expiresAt === undefined ? undefined : dto.expiresAt ? this.toDate(dto.expiresAt) : null,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
        select: this.kioskCredentialSelect,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'attendance.kiosk_credential', credential.id, before, credential);
      await this.writeOutbox(tx, tenantId, 'attendance.kiosk_credential.updated', 'AttendanceKioskCredential', credential.id, {
        credentialId: credential.id,
        employeeId: credential.employeeId,
        badgeNumber: credential.badgeNumber,
        status: credential.status,
      });

      return credential;
    });
  }

  async listHolidays(actor: AuthenticatedPrincipal, query: ListAttendanceControlsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = this.limit(query.limit);
    const range = this.queryRange(query, 365);
    const rows = await this.prisma.attendanceHoliday.findMany({
      where: {
        tenantId,
        deletedAt: null,
        date: { gte: range.from, lte: range.to },
        ...(query.controlStatus ? { status: query.controlStatus } : {}),
        ...(query.locationName ? { name: { contains: query.locationName, mode: Prisma.QueryMode.insensitive } } : {}),
      },
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    return this.paginate(rows, limit);
  }

  async createHoliday(actor: AuthenticatedPrincipal, dto: CreateAttendanceHolidayDto) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.$transaction(async (tx) => {
      const holiday = await tx.attendanceHoliday.create({
        data: this.holidayData(tenantId, dto),
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'attendance.holiday', holiday.id, null, holiday);
      await this.writeOutbox(tx, tenantId, 'attendance.holiday.created', 'AttendanceHoliday', holiday.id, {
        holidayId: holiday.id,
        code: holiday.code,
        date: holiday.date.toISOString(),
        multiplier: holiday.multiplier,
        status: holiday.status,
      });

      return holiday;
    });
  }

  async updateHoliday(actor: AuthenticatedPrincipal, holidayId: string, dto: UpdateAttendanceHolidayDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.assertHolidayExists(tenantId, holidayId);

    return this.prisma.$transaction(async (tx) => {
      const holiday = await tx.attendanceHoliday.update({
        where: { id: before.id },
        data: this.holidayUpdateData(dto),
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'attendance.holiday', holiday.id, before, holiday);
      await this.writeOutbox(tx, tenantId, 'attendance.holiday.updated', 'AttendanceHoliday', holiday.id, {
        holidayId: holiday.id,
        code: holiday.code,
        date: holiday.date.toISOString(),
        multiplier: holiday.multiplier,
        status: holiday.status,
      });

      return holiday;
    });
  }

  async listPremiumRules(actor: AuthenticatedPrincipal, query: ListAttendanceControlsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = this.limit(query.limit);
    const rows = await this.prisma.attendancePremiumRule.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.controlStatus ? { status: query.controlStatus } : {}),
        ...(query.premiumRuleType ? { type: query.premiumRuleType } : {}),
        ...(query.locationName ? { locationName: { contains: query.locationName, mode: Prisma.QueryMode.insensitive } } : {}),
        ...(query.organizationNodeId ? { organizationNodeId: query.organizationNodeId } : {}),
        ...(query.costCenterId ? { costCenterId: query.costCenterId } : {}),
        ...(query.positionId ? { positionId: query.positionId } : {}),
      },
      orderBy: [{ status: 'asc' }, { type: 'asc' }, { name: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    return this.paginate(rows, limit);
  }

  async createPremiumRule(actor: AuthenticatedPrincipal, dto: CreateAttendancePremiumRuleDto) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.attendancePremiumRule.create({
        data: this.premiumRuleData(tenantId, dto),
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'attendance.premium_rule', rule.id, null, rule);
      await this.writeOutbox(tx, tenantId, 'attendance.premium_rule.created', 'AttendancePremiumRule', rule.id, {
        premiumRuleId: rule.id,
        code: rule.code,
        type: rule.type,
        multiplier: rule.multiplier,
        status: rule.status,
      });

      return rule;
    });
  }

  async updatePremiumRule(actor: AuthenticatedPrincipal, ruleId: string, dto: UpdateAttendancePremiumRuleDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.assertPremiumRuleExists(tenantId, ruleId);

    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.attendancePremiumRule.update({
        where: { id: before.id },
        data: this.premiumRuleUpdateData(dto),
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'attendance.premium_rule', rule.id, before, rule);
      await this.writeOutbox(tx, tenantId, 'attendance.premium_rule.updated', 'AttendancePremiumRule', rule.id, {
        premiumRuleId: rule.id,
        code: rule.code,
        type: rule.type,
        multiplier: rule.multiplier,
        status: rule.status,
      });

      return rule;
    });
  }

  async createManualRecord(actor: AuthenticatedPrincipal, dto: ManualAttendanceRecordDto) {
    const tenantId = this.requireTenant(actor);
    await this.assertCanOperateOnEmployee(actor, dto.employeeId);
    const policy = await this.ensureActivePolicy(tenantId);
    const workDate = this.startOfDay(this.toDate(dto.workDate));
    const existingById = dto.recordId
      ? await this.prisma.attendanceRecord.findFirst({
          where: { id: dto.recordId, tenantId, employeeId: dto.employeeId },
        })
      : null;

    if (dto.recordId && !existingById) {
      throw new NotFoundException('Attendance record not found for this employee.');
    }

    const scheduleAssignmentId = dto.scheduleAssignmentId ?? existingById?.scheduleAssignmentId ?? undefined;
    const assignment = scheduleAssignmentId
      ? await this.prisma.scheduleAssignment.findFirst({
          where: { id: scheduleAssignmentId, tenantId, employeeId: dto.employeeId },
          include: this.assignmentInclude,
        })
      : null;

    if (scheduleAssignmentId && !assignment) {
      throw new NotFoundException('Schedule assignment not found for this employee.');
    }

    const clockIn = dto.actualClockInAt ? this.toDate(dto.actualClockInAt) : null;
    const clockOut = dto.actualClockOutAt ? this.toDate(dto.actualClockOutAt) : null;

    if (clockIn && clockOut && clockOut <= clockIn) {
      throw new BadRequestException('Clock-out time must be after clock-in time.');
    }

    const existing = existingById ?? await this.prisma.attendanceRecord.findFirst({
      where: {
        tenantId,
        employeeId: dto.employeeId,
        ...(assignment ? { scheduleAssignmentId: assignment.id } : { workDate }),
      },
    });

    if (existing && !dto.adjustmentReason?.trim()) {
      throw new BadRequestException('A correction reason is required when adjusting an existing record.');
    }

    const metrics = this.calculateMetrics({
      policy,
      assignment,
      actualClockInAt: clockIn,
      actualClockOutAt: clockOut,
      breakMinutes: dto.breakMinutes ?? assignment?.breakMinutes ?? 0,
    });
    const policyEvaluation = this.evaluateAttendancePolicy({
      operation: 'MANUAL_RECORD',
      policy,
      source: AttendanceSource.MANUAL,
      assignment,
      workDate,
      locationName: dto.locationName ?? assignment?.locationName ?? null,
      actualClockInAt: clockIn,
      actualClockOutAt: clockOut,
      breakMinutes: metrics.breakMinutes,
      isExistingRecord: Boolean(existing),
    });

    this.enforceAttendancePolicy(policyEvaluation);

    if (existing) {
      await this.assertRecordWritableForAdjustment(tenantId, existing.id);
    }

    const data = {
      tenantId,
      employeeId: dto.employeeId,
      scheduleAssignmentId: assignment?.id ?? null,
      policyId: policy.id,
      workDate,
      scheduledStartAt: assignment?.startsAt ?? null,
      scheduledEndAt: assignment?.endsAt ?? null,
      actualClockInAt: clockIn,
      actualClockOutAt: clockOut,
      firstPunchAt: clockIn,
      lastPunchAt: clockOut ?? clockIn,
      breakMinutes: metrics.breakMinutes,
      scheduledMinutes: metrics.scheduledMinutes,
      actualMinutes: metrics.actualMinutes,
      payableMinutes: metrics.payableMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      lateMinutes: metrics.lateMinutes,
      earlyLeaveMinutes: metrics.earlyLeaveMinutes,
      status: clockOut ? AttendanceRecordStatus.COMPLETED : AttendanceRecordStatus.OPEN,
      source: AttendanceSource.MANUAL,
      timezone: policy.timezone ?? assignment?.timezone ?? null,
      locationName: dto.locationName ?? assignment?.locationName ?? null,
      notes: dto.notes,
      metadata: this.manualRecordMetadata(existing, dto, actor.id, {
        actualClockInAt: clockIn,
        actualClockOutAt: clockOut,
        breakMinutes: metrics.breakMinutes,
        locationName: dto.locationName ?? assignment?.locationName ?? null,
        notes: dto.notes ?? null,
      }),
    } satisfies Prisma.AttendanceRecordUncheckedCreateInput;

    return this.prisma.$transaction(async (tx) => {
      const record = existing
        ? await tx.attendanceRecord.update({ where: { id: existing.id }, data, include: this.recordInclude })
        : await tx.attendanceRecord.create({ data, include: this.recordInclude });

      if (clockOut) {
        await this.closeOpenBreaksForManualCompletion(record.id, clockOut, tx);
      }

      await this.syncRecordExceptions(record.id, tx);

      const refreshedRecord = await tx.attendanceRecord.findUnique({ where: { id: record.id }, include: this.recordInclude });
      if (!refreshedRecord) {
        throw new NotFoundException('Attendance record not found after manual adjustment.');
      }

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        existing ? AuditAction.UPDATE : AuditAction.CREATE,
        'attendance.record',
        refreshedRecord.id,
        existing,
        refreshedRecord,
        {
          adjustmentReason: dto.adjustmentReason?.trim() ?? null,
          supportingDocumentUrl: dto.supportingDocumentUrl?.trim() ?? null,
          policyEvaluation,
        },
      );
      await this.writeTimeline(tx, actor, tenantId, dto.employeeId, TimelineEventType.ATTENDANCE_ADJUSTED, {
        title: existing ? 'Attendance record corrected' : 'Attendance record created',
        description: dto.adjustmentReason?.trim() || undefined,
        entityType: 'AttendanceRecord',
        entityId: refreshedRecord.id,
        data: {
          recordId: refreshedRecord.id,
          scheduleAssignmentId: refreshedRecord.scheduleAssignmentId,
          workDate: refreshedRecord.workDate.toISOString(),
          status: refreshedRecord.status,
          actualClockInAt: refreshedRecord.actualClockInAt?.toISOString() ?? null,
          actualClockOutAt: refreshedRecord.actualClockOutAt?.toISOString() ?? null,
          reason: dto.adjustmentReason?.trim() ?? null,
          supportingDocumentUrl: dto.supportingDocumentUrl?.trim() ?? null,
          policyEvaluation,
        },
      });
      await this.writeOutbox(
        tx,
        tenantId,
        existing ? 'attendance.record.adjusted' : 'attendance.record.created',
        'AttendanceRecord',
        refreshedRecord.id,
        {
          employeeId: refreshedRecord.employeeId,
          recordId: refreshedRecord.id,
          scheduleAssignmentId: refreshedRecord.scheduleAssignmentId,
          workDate: refreshedRecord.workDate.toISOString(),
          status: refreshedRecord.status,
          actualClockInAt: refreshedRecord.actualClockInAt?.toISOString() ?? null,
          actualClockOutAt: refreshedRecord.actualClockOutAt?.toISOString() ?? null,
          source: AttendanceSource.MANUAL,
          adjustedById: actor.id,
          policyEvaluation,
        },
      );

      return refreshedRecord;
    });
  }

  async listCorrectionRequests(actor: AuthenticatedPrincipal, query: ListAttendanceCorrectionRequestsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = this.limit(query.limit);
    const range = this.queryRange(query, 30);
    const where = {
      tenantId,
      workDate: { gte: range.from, lte: range.to },
      ...(query.correctionStatus ? { status: query.correctionStatus } : {}),
      ...(query.recordId ? { attendanceRecordId: query.recordId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...await this.employeeScopeWhere(actor),
      ...this.employeeSearchWhere(query),
      ...this.assignmentDimensionWhere(query),
    } satisfies Prisma.AttendanceCorrectionRequestWhereInput;

    const rows = await this.prisma.attendanceCorrectionRequest.findMany({
      where,
      orderBy: [{ requestedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.correctionRequestInclude,
    });

    return this.paginate(rows, limit);
  }

  async createCorrectionRequest(actor: AuthenticatedPrincipal, dto: CreateAttendanceCorrectionRequestDto) {
    const tenantId = this.requireTenant(actor);
    const policy = await this.ensureActivePolicy(tenantId);
    const existingRecord = dto.recordId
      ? await this.prisma.attendanceRecord.findFirst({
          where: { id: dto.recordId, tenantId },
          include: this.recordInclude,
        })
      : null;

    if (dto.recordId && !existingRecord) {
      throw new NotFoundException('Attendance record not found.');
    }

    const employeeId = await this.resolveCorrectionEmployeeId(actor, dto.employeeId, existingRecord?.employeeId);
    await this.assertCanOperateOnEmployee(actor, employeeId);

    if (existingRecord && existingRecord.employeeId !== employeeId) {
      throw new BadRequestException('Correction request employee does not match the attendance record.');
    }

    const workDate = this.startOfDay(this.toDate(dto.workDate));
    const scheduleAssignmentId = dto.scheduleAssignmentId ?? existingRecord?.scheduleAssignmentId ?? undefined;
    const assignment = scheduleAssignmentId
      ? await this.prisma.scheduleAssignment.findFirst({
          where: { id: scheduleAssignmentId, tenantId, employeeId },
          include: this.assignmentInclude,
        })
      : null;

    if (scheduleAssignmentId && !assignment) {
      throw new NotFoundException('Schedule assignment not found for this employee.');
    }

    const clockIn = dto.actualClockInAt ? this.toDate(dto.actualClockInAt) : null;
    const clockOut = dto.actualClockOutAt ? this.toDate(dto.actualClockOutAt) : null;

    if (clockIn && clockOut && clockOut <= clockIn) {
      throw new BadRequestException('Clock-out time must be after clock-in time.');
    }

    if (existingRecord) {
      const duplicate = await this.prisma.attendanceCorrectionRequest.findFirst({
        where: {
          tenantId,
          attendanceRecordId: existingRecord.id,
          status: { in: OPEN_CORRECTION_REQUEST_STATUSES },
        },
      });

      if (duplicate) {
        throw new ConflictException('A correction request is already open for this attendance record.');
      }
    }

    const metrics = this.calculateMetrics({
      policy,
      assignment,
      actualClockInAt: clockIn,
      actualClockOutAt: clockOut,
      breakMinutes: dto.breakMinutes ?? assignment?.breakMinutes ?? existingRecord?.breakMinutes ?? 0,
    });
    const requestedSnapshot = this.correctionRequestedSnapshot({
      employeeId,
      workDate,
      scheduleAssignmentId: assignment?.id ?? null,
      actualClockInAt: clockIn,
      actualClockOutAt: clockOut,
      breakMinutes: metrics.breakMinutes,
      locationName: dto.locationName ?? assignment?.locationName ?? existingRecord?.locationName ?? null,
      notes: dto.notes ?? existingRecord?.notes ?? null,
      metrics,
    });
    const policyEvaluation = this.evaluateAttendancePolicy({
      operation: 'CORRECTION_REQUEST',
      policy,
      source: AttendanceSource.MANUAL,
      assignment,
      workDate,
      locationName: dto.locationName ?? assignment?.locationName ?? existingRecord?.locationName ?? null,
      actualClockInAt: clockIn,
      actualClockOutAt: clockOut,
      breakMinutes: metrics.breakMinutes,
      isExistingRecord: Boolean(existingRecord),
    });

    this.enforceAttendancePolicy(policyEvaluation);

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.attendanceCorrectionRequest.create({
        data: {
          tenantId,
          employeeId,
          attendanceRecordId: existingRecord?.id ?? null,
          scheduleAssignmentId: assignment?.id ?? null,
          policyId: policy.id,
          requestedById: actor.id,
          workDate,
          requestedClockInAt: clockIn,
          requestedClockOutAt: clockOut,
          requestedBreakMinutes: metrics.breakMinutes,
          requestedLocationName: dto.locationName ?? assignment?.locationName ?? existingRecord?.locationName ?? null,
          requestedNotes: dto.notes ?? existingRecord?.notes ?? null,
          reason: dto.reason.trim(),
          supportingDocumentUrl: dto.supportingDocumentUrl?.trim(),
          previousSnapshot: this.toJson(existingRecord ? this.attendanceRecordSnapshot(existingRecord) : null),
          requestedSnapshot: this.toJson(requestedSnapshot)!,
          policySnapshot: this.toJson(this.attendancePolicySnapshot(policy)),
          policyViolations: this.toJson(policyEvaluation),
        },
        include: this.correctionRequestInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.CREATE,
        'attendance.correction_request',
        request.id,
        null,
        request,
        { policyEvaluation },
      );
      await this.writeTimeline(tx, actor, tenantId, employeeId, TimelineEventType.ATTENDANCE_CORRECTION_REQUESTED, {
        title: 'Attendance correction requested',
        description: dto.reason.trim(),
        entityType: 'AttendanceCorrectionRequest',
        entityId: request.id,
        data: {
          correctionRequestId: request.id,
          recordId: request.attendanceRecordId,
          scheduleAssignmentId: request.scheduleAssignmentId,
          workDate: request.workDate.toISOString(),
          status: request.status,
          policyEvaluation,
        },
      });
      await this.writeOutbox(tx, tenantId, 'attendance.correction.requested', 'AttendanceCorrectionRequest', request.id, {
        correctionRequestId: request.id,
        employeeId,
        recordId: request.attendanceRecordId,
        scheduleAssignmentId: request.scheduleAssignmentId,
        workDate: request.workDate.toISOString(),
        status: request.status,
        requestedById: actor.id,
        policyEvaluation,
      });

      return request;
    });
  }

  async decideCorrectionRequest(
    actor: AuthenticatedPrincipal,
    requestId: string,
    dto: DecideAttendanceCorrectionRequestDto,
  ) {
    const tenantId = this.requireTenant(actor);

    if (!CORRECTION_DECISION_STATUSES.includes(dto.status)) {
      throw new BadRequestException('Choose approve, reject, or cancel for the correction request.');
    }

    const request = await this.prisma.attendanceCorrectionRequest.findFirst({
      where: { id: requestId, tenantId },
      include: this.correctionRequestInclude,
    });

    if (!request) {
      throw new NotFoundException('Attendance correction request not found.');
    }

    await this.assertCanOperateOnEmployee(actor, request.employeeId);

    if (request.status !== AttendanceCorrectionRequestStatus.REQUESTED) {
      throw new ConflictException('Only requested corrections can be decided.');
    }

    if (dto.status !== AttendanceCorrectionRequestStatus.APPROVED) {
      return this.closeCorrectionRequest(actor, request, dto.status, dto.decisionNote);
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.attendanceCorrectionRequest.findUnique({
        where: { id: request.id },
        include: this.correctionRequestInclude,
      });

      if (!before) {
        throw new NotFoundException('Attendance correction request not found.');
      }

      const appliedRecord = await this.applyApprovedCorrectionRequest(tx, actor, before, dto.decisionNote);
      const updated = await tx.attendanceCorrectionRequest.update({
        where: { id: request.id },
        data: {
          status: AttendanceCorrectionRequestStatus.APPLIED,
          decidedAt: new Date(),
          decidedById: actor.id,
          decisionNote: dto.decisionNote,
          appliedAt: new Date(),
          appliedById: actor.id,
          appliedRecordId: appliedRecord.id,
        },
        include: this.correctionRequestInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.APPROVE,
        'attendance.correction_request',
        updated.id,
        before,
        updated,
      );
      await this.writeTimeline(tx, actor, tenantId, updated.employeeId, TimelineEventType.ATTENDANCE_CORRECTION_APPLIED, {
        title: 'Attendance correction approved and applied',
        description: dto.decisionNote ?? updated.reason,
        entityType: 'AttendanceCorrectionRequest',
        entityId: updated.id,
        data: {
          correctionRequestId: updated.id,
          recordId: appliedRecord.id,
          status: updated.status,
          decidedAt: updated.decidedAt?.toISOString() ?? null,
          appliedAt: updated.appliedAt?.toISOString() ?? null,
        },
      });
      await this.writeOutbox(tx, tenantId, 'attendance.correction.applied', 'AttendanceCorrectionRequest', updated.id, {
        correctionRequestId: updated.id,
        employeeId: updated.employeeId,
        recordId: appliedRecord.id,
        status: updated.status,
        decidedById: actor.id,
        appliedById: actor.id,
      });
      await this.createAttendanceNotification(tx, tenantId, updated.employeeId, {
        title: 'Attendance correction approved',
        body: dto.decisionNote ?? 'Your attendance correction was approved and applied.',
        data: {
          correctionRequestId: updated.id,
          recordId: appliedRecord.id,
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async listExceptions(actor: AuthenticatedPrincipal, query: ListAttendanceExceptionsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = this.limit(query.limit);
    const range = this.queryRange(query, 30);
    const where = {
      tenantId,
      occurredAt: { gte: range.from, lte: range.to },
      ...(query.exceptionStatus ? { status: query.exceptionStatus } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...await this.employeeScopeWhere(actor),
      ...this.employeeSearchWhere(query),
      ...this.assignmentDimensionWhere(query),
    } satisfies Prisma.AttendanceExceptionWhereInput;

    const rows = await this.prisma.attendanceException.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.exceptionInclude,
    });

    return this.paginate(rows, limit);
  }

  async decideException(actor: AuthenticatedPrincipal, exceptionId: string, dto: DecideAttendanceExceptionDto) {
    const tenantId = this.requireTenant(actor);
    const exception = await this.prisma.attendanceException.findFirst({
      where: { id: exceptionId, tenantId },
    });

    if (!exception) {
      throw new NotFoundException('Attendance exception not found.');
    }

    await this.assertCanOperateOnEmployee(actor, exception.employeeId);

    if (!FINAL_EXCEPTION_DECISION_STATUSES.includes(dto.status)) {
      throw new BadRequestException('Choose a final exception decision.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceException.update({
        where: { id: exception.id },
        data: {
          status: dto.status,
          decidedAt: new Date(),
          decidedById: actor.id,
          decisionNote: dto.decisionNote,
        },
        include: this.exceptionInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        this.auditActionForExceptionDecision(dto.status),
        'attendance.exception',
        updated.id,
        exception,
        updated,
      );
      await this.writeTimeline(tx, actor, tenantId, updated.employeeId, TimelineEventType.ATTENDANCE_EXCEPTION_DECIDED, {
        title: `Attendance exception ${this.humanizeEnum(dto.status)}`,
        description: dto.decisionNote,
        entityType: 'AttendanceException',
        entityId: updated.id,
        data: {
          exceptionId: updated.id,
          recordId: updated.attendanceRecordId,
          scheduleAssignmentId: updated.scheduleAssignmentId,
          type: updated.type,
          status: updated.status,
          decidedAt: updated.decidedAt?.toISOString() ?? null,
          decidedById: updated.decidedById,
        },
      });
      await this.writeOutbox(tx, tenantId, 'attendance.exception.decided', 'AttendanceException', updated.id, {
        employeeId: updated.employeeId,
        exceptionId: updated.id,
        recordId: updated.attendanceRecordId,
        scheduleAssignmentId: updated.scheduleAssignmentId,
        type: updated.type,
        status: updated.status,
        decidedAt: updated.decidedAt?.toISOString() ?? null,
        decidedById: updated.decidedById,
      });

      return updated;
    });
  }

  async listTimesheets(actor: AuthenticatedPrincipal, query: ListTimesheetsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = this.limit(query.limit);
    const range = this.queryRange(query, 60);
    const where = {
      tenantId,
      periodStart: { lte: range.to },
      periodEnd: { gte: range.from },
      ...(query.timesheetStatus ? { status: query.timesheetStatus } : {}),
      ...await this.employeeScopeWhere(actor),
      ...this.employeeSearchWhere(query),
    } satisfies Prisma.AttendanceTimesheetWhereInput;

    const rows = await this.prisma.attendanceTimesheet.findMany({
      where,
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.timesheetInclude,
    });

    return this.paginate(rows, limit);
  }

  async generateTimesheets(actor: AuthenticatedPrincipal, dto: GenerateTimesheetsDto) {
    const tenantId = this.requireTenant(actor);
    const policy = await this.ensureActivePolicy(tenantId);
    const periodStart = this.startOfDay(this.toDate(dto.periodStart));
    const periodEnd = this.endOfDay(this.toDate(dto.periodEnd));

    if (periodEnd <= periodStart) {
      throw new BadRequestException('Timesheet period end must be after period start.');
    }

    const employeeScope = await this.employeeScopeWhere(actor);
    if (dto.employeeId) {
      await this.assertCanOperateOnEmployee(actor, dto.employeeId);
    }

    const [records, assignments] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: {
          tenantId,
          workDate: { gte: periodStart, lte: periodEnd },
          ...(dto.employeeId ? { employeeId: dto.employeeId } : employeeScope),
        },
        include: this.recordInclude,
      }),
      this.prisma.scheduleAssignment.findMany({
        where: {
          tenantId,
          workDate: { gte: periodStart, lte: periodEnd },
          status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
          ...(dto.employeeId ? { employeeId: dto.employeeId } : employeeScope),
        },
        include: this.assignmentInclude,
      }),
    ]);

    const employeeIds = [...new Set([...records.map((record) => record.employeeId), ...assignments.map((assignment) => assignment.employeeId)])];
    const generated: AttendanceTimesheet[] = [];

    for (const employeeId of employeeIds) {
      const employeeRecords = records.filter((record) => record.employeeId === employeeId);
      const employeeAssignments = assignments.filter((assignment) => assignment.employeeId === employeeId);

      const generatedTimesheet = await this.prisma.$transaction(async (tx) => {
        const uniqueWhere = {
          tenantId_employeeId_periodStart_periodEnd: {
            tenantId,
            employeeId,
            periodStart,
            periodEnd,
          },
        };
        const before = await tx.attendanceTimesheet.findUnique({ where: uniqueWhere });

        if (before && FINAL_TIMESHEET_STATUSES.includes(before.status)) {
          throw new ConflictException('Finalized timesheets cannot be regenerated.');
        }

        const timesheet = await tx.attendanceTimesheet.upsert({
          where: uniqueWhere,
          create: {
            tenantId,
            employeeId,
            policyId: policy.id,
            periodStart,
            periodEnd,
            status: AttendanceTimesheetStatus.DRAFT,
          },
          update: {
            policyId: policy.id,
            status: AttendanceTimesheetStatus.DRAFT,
          },
        });

        for (const assignment of employeeAssignments) {
          const record = employeeRecords.find((item) => item.scheduleAssignmentId === assignment.id);

          if (!record) {
            await this.upsertException({
              tenantId,
              employeeId,
              scheduleAssignmentId: assignment.id,
              type: AttendanceExceptionType.MISSED_CLOCK_IN,
              occurredAt: assignment.startsAt,
              minutes: null,
              title: 'Missed clock-in',
              description: 'Scheduled work has no clock-in recorded.',
            }, tx);
          }

          await this.upsertTimesheetEntry(timesheet.id, employeeId, assignment.workDate, record ?? null, assignment, tx);
        }

        for (const record of employeeRecords.filter((record) => !record.scheduleAssignmentId)) {
          await this.upsertTimesheetEntry(timesheet.id, employeeId, record.workDate, record, null, tx);
        }

        const recalculated = await this.recalculateTimesheet(timesheet.id, tx);
        await this.writeAudit(
          tx,
          actor,
          tenantId,
          before ? AuditAction.UPDATE : AuditAction.CREATE,
          'attendance.timesheet',
          recalculated.id,
          before,
          recalculated,
          {
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            generatedFromRecords: employeeRecords.length,
            generatedFromAssignments: employeeAssignments.length,
          },
        );
        await this.writeTimeline(tx, actor, tenantId, employeeId, TimelineEventType.TIMESHEET_GENERATED, {
          title: 'Timesheet generated',
          description: `${this.formatDate(periodStart)} to ${this.formatDate(periodEnd)}`,
          entityType: 'AttendanceTimesheet',
          entityId: recalculated.id,
          data: {
            timesheetId: recalculated.id,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            status: recalculated.status,
            regularMinutes: recalculated.regularMinutes,
            overtimeMinutes: recalculated.overtimeMinutes,
            exceptionCount: recalculated.exceptionCount,
          },
        });
        await this.writeOutbox(tx, tenantId, 'attendance.timesheet.generated', 'AttendanceTimesheet', recalculated.id, {
          employeeId,
          timesheetId: recalculated.id,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          status: recalculated.status,
          regularMinutes: recalculated.regularMinutes,
          overtimeMinutes: recalculated.overtimeMinutes,
          breakMinutes: recalculated.breakMinutes,
          exceptionCount: recalculated.exceptionCount,
          entryCount: recalculated.entries.length,
        });

        return recalculated;
      });

      generated.push(generatedTimesheet);
    }

    return {
      generatedCount: generated.length,
      timesheets: generated,
    };
  }

  async submitTimesheet(actor: AuthenticatedPrincipal, timesheetId: string) {
    const tenantId = this.requireTenant(actor);
    const timesheet = await this.prisma.attendanceTimesheet.findFirst({
      where: { id: timesheetId, tenantId },
    });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found.');
    }

    await this.assertCanOperateOnEmployee(actor, timesheet.employeeId);

    if (FINAL_TIMESHEET_STATUSES.includes(timesheet.status)) {
      throw new ConflictException('This timesheet is already finalized.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceTimesheet.update({
        where: { id: timesheet.id },
        data: { status: AttendanceTimesheetStatus.SUBMITTED, submittedAt: new Date() },
        include: this.timesheetInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'attendance.timesheet',
        updated.id,
        timesheet,
        updated,
      );
      await this.writeTimeline(tx, actor, tenantId, updated.employeeId, TimelineEventType.TIMESHEET_SUBMITTED, {
        title: 'Timesheet submitted',
        description: `${this.formatDate(updated.periodStart)} to ${this.formatDate(updated.periodEnd)}`,
        entityType: 'AttendanceTimesheet',
        entityId: updated.id,
        data: {
          timesheetId: updated.id,
          periodStart: updated.periodStart.toISOString(),
          periodEnd: updated.periodEnd.toISOString(),
          status: updated.status,
          submittedAt: updated.submittedAt?.toISOString() ?? null,
        },
      });
      await this.writeOutbox(tx, tenantId, 'attendance.timesheet.submitted', 'AttendanceTimesheet', updated.id, {
        employeeId: updated.employeeId,
        timesheetId: updated.id,
        periodStart: updated.periodStart.toISOString(),
        periodEnd: updated.periodEnd.toISOString(),
        status: updated.status,
        submittedAt: updated.submittedAt?.toISOString() ?? null,
      });

      return updated;
    });
  }

  async decideTimesheet(actor: AuthenticatedPrincipal, timesheetId: string, dto: DecideTimesheetDto) {
    const tenantId = this.requireTenant(actor);
    const timesheet = await this.prisma.attendanceTimesheet.findFirst({
      where: { id: timesheetId, tenantId },
    });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found.');
    }

    await this.assertCanOperateOnEmployee(actor, timesheet.employeeId);

    if (!TIMESHEET_DECISION_STATUSES.includes(dto.status)) {
      throw new BadRequestException('Choose a valid timesheet decision.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceTimesheet.update({
        where: { id: timesheet.id },
        data: {
          status: dto.status,
          decidedAt: new Date(),
          decidedById: actor.id,
          decisionNote: dto.decisionNote,
        },
        include: this.timesheetInclude,
      });
      const timelineType = this.timelineTypeForTimesheetDecision(dto.status);

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        this.auditActionForTimesheetDecision(dto.status),
        'attendance.timesheet',
        updated.id,
        timesheet,
        updated,
      );
      await this.writeTimeline(tx, actor, tenantId, updated.employeeId, timelineType, {
        title: `Timesheet ${this.humanizeEnum(dto.status)}`,
        description: dto.decisionNote || `${this.formatDate(updated.periodStart)} to ${this.formatDate(updated.periodEnd)}`,
        entityType: 'AttendanceTimesheet',
        entityId: updated.id,
        data: {
          timesheetId: updated.id,
          periodStart: updated.periodStart.toISOString(),
          periodEnd: updated.periodEnd.toISOString(),
          status: updated.status,
          decidedAt: updated.decidedAt?.toISOString() ?? null,
          decidedById: updated.decidedById,
        },
      });
      await this.writeOutbox(tx, tenantId, 'attendance.timesheet.decided', 'AttendanceTimesheet', updated.id, {
        employeeId: updated.employeeId,
        timesheetId: updated.id,
        periodStart: updated.periodStart.toISOString(),
        periodEnd: updated.periodEnd.toISOString(),
        status: updated.status,
        decidedAt: updated.decidedAt?.toISOString() ?? null,
        decidedById: updated.decidedById,
      });

      return updated;
    });
  }

  async listPayrollExports(actor: AuthenticatedPrincipal, query: ListAttendancePayrollExportsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = this.limit(query.limit);
    const range = this.queryRange(query, 90);

    if (query.employeeId) {
      await this.assertCanOperateOnEmployee(actor, query.employeeId);
    }

    const where = {
      tenantId,
      periodStart: { lte: range.to },
      periodEnd: { gte: range.from },
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.payrollExportStatus ? { status: query.payrollExportStatus } : {}),
    } satisfies Prisma.AttendancePayrollExportWhereInput;

    const rows = await this.prisma.attendancePayrollExport.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: this.payrollExportInclude,
    });

    return this.paginate(rows, limit);
  }

  async lockPayrollPeriod(actor: AuthenticatedPrincipal, dto: PayrollPeriodActionDto) {
    const tenantId = this.requireTenant(actor);
    const { periodStart, periodEnd } = this.payrollPeriodDates(dto);
    const timesheets = await this.findPayrollTimesheets(actor, tenantId, periodStart, periodEnd, dto.employeeId);

    if (timesheets.length === 0) {
      throw new NotFoundException('No timesheets were found for this payroll period.');
    }

    const payrollLockableStatuses: AttendanceTimesheetStatus[] = [
      AttendanceTimesheetStatus.APPROVED,
      AttendanceTimesheetStatus.LOCKED,
    ];
    const blocking = timesheets.filter((timesheet) => !payrollLockableStatuses.includes(timesheet.status));

    if (blocking.length > 0) {
      throw new ConflictException(`Payroll period cannot be locked until all timesheets are approved. Blocking statuses: ${this.statusCounts(blocking.map((item) => item.status))}.`);
    }

    const approvedTimesheets = timesheets.filter((timesheet) => timesheet.status === AttendanceTimesheetStatus.APPROVED);
    const approvedIds = approvedTimesheets.map((timesheet) => timesheet.id);

    return this.prisma.$transaction(async (tx) => {
      if (approvedIds.length > 0) {
        await tx.attendanceTimesheet.updateMany({
          where: { tenantId, id: { in: approvedIds } },
          data: {
            status: AttendanceTimesheetStatus.LOCKED,
            decidedAt: new Date(),
            decidedById: actor.id,
            decisionNote: dto.reason?.trim() || 'Locked for payroll processing.',
          },
        });
        await tx.attendanceTimesheetEntry.updateMany({
          where: { tenantId, timesheetId: { in: approvedIds } },
          data: { status: AttendanceTimesheetEntryStatus.LOCKED },
        });
      }

      const lockedTimesheets = await tx.attendanceTimesheet.findMany({
        where: { tenantId, id: { in: timesheets.map((timesheet) => timesheet.id) } },
        orderBy: [{ employeeId: 'asc' }],
        include: this.timesheetInclude,
      });
      const snapshot = await this.buildPayrollExportSnapshot(tenantId, lockedTimesheets, periodStart, periodEnd, tx);
      const fileName = this.payrollFileName('payroll-lock', periodStart, periodEnd, dto.employeeId);
      const ledger = await tx.attendancePayrollExport.create({
        data: {
          tenantId,
          employeeId: dto.employeeId,
          status: AttendancePayrollExportStatus.LOCKED,
          periodStart,
          periodEnd,
          format: 'LOCK',
          fileName,
          rowCount: snapshot.totals.rowCount,
          regularMinutes: snapshot.totals.regularMinutes,
          overtimeMinutes: snapshot.totals.overtimeMinutes,
          breakMinutes: snapshot.totals.breakMinutes,
          grossPayableMinutes: snapshot.totals.grossPayableMinutes,
          lockedTimesheetIds: lockedTimesheets.map((timesheet) => timesheet.id),
          lockedById: actor.id,
          lockedAt: new Date(),
          payload: this.toJson(snapshot)!,
          metadata: this.toJson({
            reason: dto.reason?.trim() ?? null,
            approvedCount: approvedTimesheets.length,
            alreadyLockedCount: timesheets.length - approvedTimesheets.length,
          }),
        },
        include: this.payrollExportInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'attendance.payroll_period_lock',
        ledger.id,
        timesheets,
        { ledger, timesheets: lockedTimesheets },
        {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          lockedCount: approvedTimesheets.length,
          alreadyLockedCount: timesheets.length - approvedTimesheets.length,
        },
      );

      await Promise.all(lockedTimesheets.map((timesheet) => this.writeTimeline(tx, actor, tenantId, timesheet.employeeId, TimelineEventType.PAYROLL_PERIOD_LOCKED, {
        title: 'Payroll period locked',
        description: dto.reason?.trim() || `${this.formatDate(periodStart)} to ${this.formatDate(periodEnd)}`,
        entityType: 'AttendancePayrollExport',
        entityId: ledger.id,
        data: {
          payrollExportId: ledger.id,
          timesheetId: timesheet.id,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          status: timesheet.status,
        },
      })));
      await this.writeOutbox(tx, tenantId, 'attendance.payroll.period_locked', 'AttendancePayrollExport', ledger.id, {
        payrollExportId: ledger.id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        employeeId: dto.employeeId ?? null,
        lockedTimesheetIds: ledger.lockedTimesheetIds,
        lockedCount: approvedTimesheets.length,
        alreadyLockedCount: timesheets.length - approvedTimesheets.length,
        totals: snapshot.totals,
      });

      return {
        lockedCount: approvedTimesheets.length,
        alreadyLockedCount: timesheets.length - approvedTimesheets.length,
        timesheets: lockedTimesheets,
        payrollExport: ledger,
        totals: snapshot.totals,
      };
    });
  }

  async exportPayrollPeriod(actor: AuthenticatedPrincipal, dto: ExportPayrollPeriodDto) {
    const tenantId = this.requireTenant(actor);
    const { periodStart, periodEnd } = this.payrollPeriodDates(dto);
    const format = dto.format?.trim().toUpperCase() || 'CSV';

    if (format !== 'CSV') {
      throw new BadRequestException('CSV is the supported payroll export format.');
    }

    const timesheets = await this.findPayrollTimesheets(actor, tenantId, periodStart, periodEnd, dto.employeeId);

    if (timesheets.length === 0) {
      throw new NotFoundException('No locked timesheets were found for this payroll period.');
    }

    const unlocked = timesheets.filter((timesheet) => timesheet.status !== AttendanceTimesheetStatus.LOCKED);
    if (unlocked.length > 0) {
      throw new ConflictException(`Lock the payroll period before export. Unlocked statuses: ${this.statusCounts(unlocked.map((item) => item.status))}.`);
    }

    const snapshot = await this.buildPayrollExportSnapshot(tenantId, timesheets, periodStart, periodEnd);
    const csv = this.payrollSnapshotToCsv(snapshot.rows);
    const fileName = this.payrollFileName('attendance-payroll', periodStart, periodEnd, dto.employeeId);

    return this.prisma.$transaction(async (tx) => {
      const payrollExport = await tx.attendancePayrollExport.create({
        data: {
          tenantId,
          employeeId: dto.employeeId,
          status: AttendancePayrollExportStatus.GENERATED,
          periodStart,
          periodEnd,
          format,
          fileName,
          rowCount: snapshot.totals.rowCount,
          regularMinutes: snapshot.totals.regularMinutes,
          overtimeMinutes: snapshot.totals.overtimeMinutes,
          breakMinutes: snapshot.totals.breakMinutes,
          grossPayableMinutes: snapshot.totals.grossPayableMinutes,
          lockedTimesheetIds: timesheets.map((timesheet) => timesheet.id),
          exportedById: actor.id,
          exportedAt: new Date(),
          payload: this.toJson(snapshot)!,
          metadata: this.toJson({ reason: dto.reason?.trim() ?? null }),
        },
        include: this.payrollExportInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.EXPORT,
        'attendance.payroll_export',
        payrollExport.id,
        null,
        payrollExport,
        {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          rowCount: snapshot.totals.rowCount,
          timesheetCount: snapshot.totals.timesheetCount,
        },
      );
      await Promise.all(timesheets.map((timesheet) => this.writeTimeline(tx, actor, tenantId, timesheet.employeeId, TimelineEventType.PAYROLL_EXPORT_GENERATED, {
        title: 'Payroll export generated',
        description: dto.reason?.trim() || payrollExport.fileName,
        entityType: 'AttendancePayrollExport',
        entityId: payrollExport.id,
        data: {
          payrollExportId: payrollExport.id,
          timesheetId: timesheet.id,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          rowCount: snapshot.rows.filter((row) => row.timesheetId === timesheet.id).length,
        },
      })));
      await this.writeOutbox(tx, tenantId, 'attendance.payroll.exported', 'AttendancePayrollExport', payrollExport.id, {
        payrollExportId: payrollExport.id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        employeeId: dto.employeeId ?? null,
        fileName,
        rowCount: snapshot.totals.rowCount,
        totals: snapshot.totals,
      });

      return {
        export: payrollExport,
        fileName,
        contentType: 'text/csv;charset=utf-8',
        rowCount: snapshot.totals.rowCount,
        totals: snapshot.totals,
        csv,
      };
    });
  }

  async runReconciliation(actor: AuthenticatedPrincipal, dto: RunAttendanceReconciliationDto) {
    const tenantId = this.requireTenant(actor);
    const range = this.queryRange(dto, 14);
    const limit = this.limit(dto.limit);
    const employeeScope = dto.employeeId ? { employeeId: dto.employeeId } : await this.employeeScopeWhere(actor);

    if (dto.employeeId) {
      await this.assertCanOperateOnEmployee(actor, dto.employeeId);
    }

    const [records, assignments] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: {
          tenantId,
          workDate: { gte: range.from, lte: range.to },
          status: { not: AttendanceRecordStatus.VOIDED },
          ...employeeScope,
          ...this.employeeSearchWhere(dto),
          ...this.assignmentDimensionWhere(dto),
          ...(dto.locationName ? { locationName: { contains: dto.locationName, mode: Prisma.QueryMode.insensitive } } : {}),
        },
        orderBy: [{ workDate: 'asc' }, { actualClockInAt: 'asc' }, { createdAt: 'asc' }],
        take: limit,
        include: this.recordInclude,
      }),
      this.prisma.scheduleAssignment.findMany({
        where: {
          tenantId,
          startsAt: { gte: this.addHours(range.from, -18), lte: this.addHours(range.to, 18) },
          status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
          ...employeeScope,
          ...this.employeeSearchWhere(dto),
          ...this.assignmentDirectDimensionWhere(dto),
          ...(dto.locationName ? { locationName: { contains: dto.locationName, mode: Prisma.QueryMode.insensitive } } : {}),
        },
        orderBy: [{ employeeId: 'asc' }, { startsAt: 'asc' }],
        include: this.assignmentInclude,
      }),
    ]);
    const assignmentsByEmployee = this.groupBy(assignments, (assignment) => assignment.employeeId);
    const evaluated = records.map((record) => {
      const candidates = assignmentsByEmployee.get(record.employeeId) ?? [];
      const match = this.bestReconciliationMatch(record, candidates);
      return {
        record,
        match,
        action: !match
          ? 'UNMATCHED'
          : record.scheduleAssignmentId === match.assignment.id
            ? 'ALREADY_MATCHED'
            : match.confidence >= 45
              ? 'MATCH'
              : 'LOW_CONFIDENCE',
      };
    });

    const updates = evaluated.filter((item) => item.action === 'MATCH' && item.match);

    if (dto.dryRun) {
      return {
        dryRun: true,
        range,
        summary: this.reconciliationSummary(evaluated),
        results: evaluated.map((item) => this.reconciliationResult(item.record, item.match, item.action)),
      };
    }

    const applied = await this.prisma.$transaction(async (tx) => {
      const appliedRows = [];
      for (const item of updates) {
        const match = item.match;
        if (!match) {
          continue;
        }
        const metrics = this.calculateMetrics({
          policy: item.record.policy ?? await this.ensureActivePolicy(tenantId, tx),
          assignment: match.assignment,
          actualClockInAt: item.record.actualClockInAt,
          actualClockOutAt: item.record.actualClockOutAt,
          breakMinutes: item.record.breakMinutes,
        });
        const updated = await tx.attendanceRecord.update({
          where: { id: item.record.id },
          data: {
            scheduleAssignmentId: match.assignment.id,
            scheduledStartAt: match.assignment.startsAt,
            scheduledEndAt: match.assignment.endsAt,
            scheduledMinutes: metrics.scheduledMinutes,
            actualMinutes: metrics.actualMinutes,
            payableMinutes: metrics.payableMinutes,
            overtimeMinutes: metrics.overtimeMinutes,
            lateMinutes: metrics.lateMinutes,
            earlyLeaveMinutes: metrics.earlyLeaveMinutes,
            timezone: item.record.timezone ?? match.assignment.timezone,
            locationName: item.record.locationName ?? match.assignment.locationName,
            metadata: this.toJson({
              ...this.jsonObject(item.record.metadata),
              reconciliation: {
                reconciledAt: new Date().toISOString(),
                reconciledById: actor.id,
                assignmentId: match.assignment.id,
                confidence: match.confidence,
                reason: match.reason,
                startDeltaMinutes: match.startDeltaMinutes,
                endDeltaMinutes: match.endDeltaMinutes,
              },
            }),
          },
          include: this.recordInclude,
        });
        await tx.attendancePunch.updateMany({
          where: { tenantId, attendanceRecordId: updated.id },
          data: { scheduleAssignmentId: match.assignment.id },
        });
        appliedRows.push(updated);
      }

      if (appliedRows.length > 0) {
        await this.writeAudit(
          tx,
          actor,
          tenantId,
          AuditAction.UPDATE,
          'attendance.reconciliation',
          tenantId,
          updates.map((item) => this.attendanceRecordSnapshot(item.record)),
          appliedRows.map((record) => this.attendanceRecordSnapshot(record)),
          {
            range: { from: range.from.toISOString(), to: range.to.toISOString() },
            appliedCount: appliedRows.length,
          },
        );
        await this.writeOutbox(tx, tenantId, 'attendance.reconciliation.completed', 'AttendanceRecord', tenantId, {
          range: { from: range.from.toISOString(), to: range.to.toISOString() },
          appliedCount: appliedRows.length,
          recordIds: appliedRows.map((record) => record.id),
        });
      }

      return appliedRows;
    });

    const results = evaluated.map((item) => this.reconciliationResult(
      applied.find((record) => record.id === item.record.id) ?? item.record,
      item.match,
      item.action,
    ));

    return {
      dryRun: false,
      range,
      summary: {
        ...this.reconciliationSummary(evaluated),
        applied: applied.length,
      },
      results,
    };
  }

  async listPolicies(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.attendancePolicy.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createPolicy(actor: AuthenticatedPrincipal, dto: CreateAttendancePolicyDto) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.attendancePolicy.create({
        data: {
          ...dto,
          tenantId,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
          status: dto.status ?? AttendancePolicyStatus.DRAFT,
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'attendance.policy', policy.id, null, policy);
      await this.writeOutbox(tx, tenantId, 'attendance.policy.created', 'AttendancePolicy', policy.id, {
        policyId: policy.id,
        code: policy.code,
        status: policy.status,
      });

      return policy;
    });
  }

  async updatePolicy(actor: AuthenticatedPrincipal, policyId: string, dto: UpdateAttendancePolicyDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.assertPolicyExists(tenantId, policyId);
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.attendancePolicy.update({
        where: { id: policyId },
        data: {
          ...dto,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'attendance.policy', policy.id, before, policy);
      await this.writeOutbox(tx, tenantId, 'attendance.policy.updated', 'AttendancePolicy', policy.id, {
        policyId: policy.id,
        code: policy.code,
        status: policy.status,
      });

      return policy;
    });
  }

  async activatePolicy(actor: AuthenticatedPrincipal, policyId: string) {
    const tenantId = this.requireTenant(actor);
    const policy = await this.assertPolicyExists(tenantId, policyId);

    return this.prisma.$transaction(async (tx) => {
      const activePolicies = await tx.attendancePolicy.findMany({
        where: { tenantId, id: { not: policy.id }, status: AttendancePolicyStatus.ACTIVE },
      });

      await tx.attendancePolicy.updateMany({
        where: { tenantId, id: { in: activePolicies.map((item) => item.id) } },
        data: { status: AttendancePolicyStatus.ARCHIVED },
      });

      const activated = await tx.attendancePolicy.update({
        where: { id: policy.id },
        data: { status: AttendancePolicyStatus.ACTIVE },
      });

      for (const archived of activePolicies) {
        await this.writeAudit(
          tx,
          actor,
          tenantId,
          AuditAction.ARCHIVE,
          'attendance.policy',
          archived.id,
          archived,
          { ...archived, status: AttendancePolicyStatus.ARCHIVED },
        );
      }

      await this.writeAudit(tx, actor, tenantId, AuditAction.ACTIVATE, 'attendance.policy', activated.id, policy, activated);
      await this.writeOutbox(tx, tenantId, 'attendance.policy.activated', 'AttendancePolicy', activated.id, {
        policyId: activated.id,
        code: activated.code,
        status: activated.status,
        archivedPolicyIds: activePolicies.map((item) => item.id),
      });

      return activated;
    });
  }

  private async closeCorrectionRequest(
    actor: AuthenticatedPrincipal,
    request: AttendanceCorrectionRequestWithRelations,
    status: AttendanceCorrectionRequestStatus,
    decisionNote?: string,
  ) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceCorrectionRequest.update({
        where: { id: request.id },
        data: {
          status,
          decidedAt: new Date(),
          decidedById: actor.id,
          decisionNote,
        },
        include: this.correctionRequestInclude,
      });
      const auditAction = status === AttendanceCorrectionRequestStatus.REJECTED ? AuditAction.REJECT : AuditAction.UPDATE;
      const timelineType = status === AttendanceCorrectionRequestStatus.REJECTED
        ? TimelineEventType.ATTENDANCE_CORRECTION_REJECTED
        : TimelineEventType.ATTENDANCE_CORRECTION_CANCELLED;
      const eventSuffix = status === AttendanceCorrectionRequestStatus.REJECTED ? 'rejected' : 'cancelled';

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        auditAction,
        'attendance.correction_request',
        updated.id,
        request,
        updated,
      );
      await this.writeTimeline(tx, actor, tenantId, updated.employeeId, timelineType, {
        title: `Attendance correction ${this.humanizeEnum(status)}`,
        description: decisionNote ?? updated.reason,
        entityType: 'AttendanceCorrectionRequest',
        entityId: updated.id,
        data: {
          correctionRequestId: updated.id,
          recordId: updated.attendanceRecordId,
          status: updated.status,
          decidedAt: updated.decidedAt?.toISOString() ?? null,
        },
      });
      await this.writeOutbox(tx, tenantId, `attendance.correction.${eventSuffix}`, 'AttendanceCorrectionRequest', updated.id, {
        correctionRequestId: updated.id,
        employeeId: updated.employeeId,
        recordId: updated.attendanceRecordId,
        status: updated.status,
        decidedById: actor.id,
      });
      await this.createAttendanceNotification(tx, tenantId, updated.employeeId, {
        title: `Attendance correction ${eventSuffix}`,
        body: decisionNote ?? updated.reason,
        data: {
          correctionRequestId: updated.id,
          recordId: updated.attendanceRecordId,
          status: updated.status,
        },
      });

      return updated;
    });
  }

  private async applyApprovedCorrectionRequest(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    request: AttendanceCorrectionRequestWithRelations,
    decisionNote?: string,
  ) {
    const tenantId = request.tenantId;
    const policy = request.policy ?? await tx.attendancePolicy.findFirst({
      where: { tenantId, status: AttendancePolicyStatus.ACTIVE, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!policy) {
      throw new NotFoundException('Attendance policy not found.');
    }

    const assignment = request.scheduleAssignmentId
      ? await tx.scheduleAssignment.findFirst({
          where: { id: request.scheduleAssignmentId, tenantId, employeeId: request.employeeId },
          include: this.assignmentInclude,
        })
      : null;

    if (request.scheduleAssignmentId && !assignment) {
      throw new NotFoundException('Schedule assignment not found for this employee.');
    }

    const existing = request.attendanceRecordId
      ? await tx.attendanceRecord.findFirst({
          where: { id: request.attendanceRecordId, tenantId, employeeId: request.employeeId },
        })
      : await tx.attendanceRecord.findFirst({
          where: {
            tenantId,
            employeeId: request.employeeId,
            ...(assignment ? { scheduleAssignmentId: assignment.id } : { workDate: request.workDate }),
          },
        });

    const clockIn = request.requestedClockInAt;
    const clockOut = request.requestedClockOutAt;

    if (clockIn && clockOut && clockOut <= clockIn) {
      throw new BadRequestException('Clock-out time must be after clock-in time.');
    }

    if (existing) {
      await this.assertRecordWritableForAdjustment(tenantId, existing.id, tx);
    }

    const metrics = this.calculateMetrics({
      policy,
      assignment,
      actualClockInAt: clockIn,
      actualClockOutAt: clockOut,
      breakMinutes: request.requestedBreakMinutes ?? assignment?.breakMinutes ?? existing?.breakMinutes ?? 0,
    });
    const policyEvaluation = this.evaluateAttendancePolicy({
      operation: 'CORRECTION_APPLY',
      policy,
      source: AttendanceSource.MANUAL,
      assignment,
      workDate: request.workDate,
      locationName: request.requestedLocationName ?? assignment?.locationName ?? existing?.locationName ?? null,
      actualClockInAt: clockIn,
      actualClockOutAt: clockOut,
      breakMinutes: metrics.breakMinutes,
      isExistingRecord: Boolean(existing),
    });

    this.enforceAttendancePolicy(policyEvaluation);

    const manualDto: ManualAttendanceRecordDto = {
      recordId: existing?.id,
      employeeId: request.employeeId,
      scheduleAssignmentId: assignment?.id,
      workDate: request.workDate.toISOString(),
      actualClockInAt: clockIn?.toISOString(),
      actualClockOutAt: clockOut?.toISOString(),
      breakMinutes: metrics.breakMinutes,
      locationName: request.requestedLocationName ?? assignment?.locationName ?? undefined,
      notes: request.requestedNotes ?? undefined,
      adjustmentReason: request.reason,
      supportingDocumentUrl: request.supportingDocumentUrl ?? undefined,
    };
    const data = {
      tenantId,
      employeeId: request.employeeId,
      scheduleAssignmentId: assignment?.id ?? null,
      policyId: policy.id,
      workDate: request.workDate,
      scheduledStartAt: assignment?.startsAt ?? null,
      scheduledEndAt: assignment?.endsAt ?? null,
      actualClockInAt: clockIn,
      actualClockOutAt: clockOut,
      firstPunchAt: clockIn,
      lastPunchAt: clockOut ?? clockIn,
      breakMinutes: metrics.breakMinutes,
      scheduledMinutes: metrics.scheduledMinutes,
      actualMinutes: metrics.actualMinutes,
      payableMinutes: metrics.payableMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      lateMinutes: metrics.lateMinutes,
      earlyLeaveMinutes: metrics.earlyLeaveMinutes,
      status: clockOut ? AttendanceRecordStatus.COMPLETED : AttendanceRecordStatus.OPEN,
      source: AttendanceSource.MANUAL,
      timezone: policy.timezone ?? assignment?.timezone ?? null,
      locationName: request.requestedLocationName ?? assignment?.locationName ?? null,
      notes: request.requestedNotes,
      metadata: this.manualRecordMetadata(existing, manualDto, actor.id, {
        actualClockInAt: clockIn,
        actualClockOutAt: clockOut,
        breakMinutes: metrics.breakMinutes,
        locationName: request.requestedLocationName ?? assignment?.locationName ?? null,
        notes: request.requestedNotes ?? null,
      }, {
        correctionRequestId: request.id,
        requestedById: request.requestedById,
        approvedById: actor.id,
        decisionNote: decisionNote ?? null,
        policyEvaluation,
      }),
    } satisfies Prisma.AttendanceRecordUncheckedCreateInput;

    const record = existing
      ? await tx.attendanceRecord.update({ where: { id: existing.id }, data, include: this.recordInclude })
      : await tx.attendanceRecord.create({ data, include: this.recordInclude });

    if (clockOut) {
      await this.closeOpenBreaksForManualCompletion(record.id, clockOut, tx);
    }

    await this.syncRecordExceptions(record.id, tx);

    const refreshedRecord = await tx.attendanceRecord.findUnique({ where: { id: record.id }, include: this.recordInclude });
    if (!refreshedRecord) {
      throw new NotFoundException('Attendance record not found after correction approval.');
    }

    await this.writeAudit(
      tx,
      actor,
      tenantId,
      existing ? AuditAction.UPDATE : AuditAction.CREATE,
      'attendance.record',
      refreshedRecord.id,
      existing,
      refreshedRecord,
      {
        correctionRequestId: request.id,
        adjustmentReason: request.reason,
        supportingDocumentUrl: request.supportingDocumentUrl,
        policyEvaluation,
      },
    );
    await this.writeTimeline(tx, actor, tenantId, request.employeeId, TimelineEventType.ATTENDANCE_ADJUSTED, {
      title: 'Attendance record corrected',
      description: request.reason,
      entityType: 'AttendanceRecord',
      entityId: refreshedRecord.id,
      data: {
        correctionRequestId: request.id,
        recordId: refreshedRecord.id,
        scheduleAssignmentId: refreshedRecord.scheduleAssignmentId,
        workDate: refreshedRecord.workDate.toISOString(),
        status: refreshedRecord.status,
        policyEvaluation,
      },
    });
    await this.writeOutbox(tx, tenantId, 'attendance.record.adjusted', 'AttendanceRecord', refreshedRecord.id, {
      correctionRequestId: request.id,
      employeeId: refreshedRecord.employeeId,
      recordId: refreshedRecord.id,
      scheduleAssignmentId: refreshedRecord.scheduleAssignmentId,
      workDate: refreshedRecord.workDate.toISOString(),
      status: refreshedRecord.status,
      source: AttendanceSource.MANUAL,
      adjustedById: actor.id,
      policyEvaluation,
    });

    return refreshedRecord;
  }

  private async findOrCreateOpenRecord(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      employeeId: string;
      workDate: Date;
      assignment: AttendanceAssignment | null;
      policy: AttendancePolicy;
      source: AttendanceSource;
      timezone: string | null;
      locationName: string | null;
      deviceId?: string;
    },
  ) {
    const existing = await tx.attendanceRecord.findFirst({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        status: AttendanceRecordStatus.OPEN,
      },
    });

    if (existing) {
      return { record: existing, created: false };
    }

    const scheduledMinutes = input.assignment
      ? this.durationMinutes(input.assignment.startsAt, input.assignment.endsAt, input.assignment.breakMinutes)
      : 0;

    const record = await tx.attendanceRecord.create({
      data: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        scheduleAssignmentId: input.assignment?.id ?? null,
        policyId: input.policy.id,
        workDate: input.assignment?.workDate ?? input.workDate,
        scheduledStartAt: input.assignment?.startsAt ?? null,
        scheduledEndAt: input.assignment?.endsAt ?? null,
        breakMinutes: input.assignment?.breakMinutes ?? 0,
        scheduledMinutes,
        source: input.source,
        timezone: input.timezone,
        locationName: input.locationName,
        deviceId: input.deviceId,
        status: AttendanceRecordStatus.OPEN,
      },
    });

    return { record, created: true };
  }

  private async applyPunchToRecord(
    tx: Prisma.TransactionClient,
    record: AttendanceRecord,
    policy: AttendancePolicy,
    type: AttendancePunchType,
    occurredAt: Date,
  ) {
    if (type === AttendancePunchType.BREAK_START) {
      await tx.attendanceBreak.create({
        data: {
          tenantId: record.tenantId,
          employeeId: record.employeeId,
          attendanceRecordId: record.id,
          startedAt: occurredAt,
          source: record.source,
        },
      });
      return tx.attendanceRecord.update({
        where: { id: record.id },
        data: { lastPunchAt: occurredAt },
      });
    }

    if (type === AttendancePunchType.BREAK_END) {
      const openBreak = await tx.attendanceBreak.findFirst({
        where: { attendanceRecordId: record.id, endedAt: null },
        orderBy: { startedAt: 'desc' },
      });

      if (!openBreak) {
        throw new BadRequestException('Start a break before ending it.');
      }

      const minutes = this.durationMinutes(openBreak.startedAt, occurredAt, 0);
      await tx.attendanceBreak.update({
        where: { id: openBreak.id },
        data: { endedAt: occurredAt, minutes },
      });

      return tx.attendanceRecord.update({
        where: { id: record.id },
        data: {
          breakMinutes: { increment: minutes },
          lastPunchAt: occurredAt,
        },
      });
    }

    const actualClockInAt = type === AttendancePunchType.CLOCK_IN ? occurredAt : record.actualClockInAt;
    const actualClockOutAt = type === AttendancePunchType.CLOCK_OUT ? occurredAt : record.actualClockOutAt;
    const metrics = this.calculateMetrics({
      policy,
      assignment: null,
      scheduledStartAt: record.scheduledStartAt,
      scheduledEndAt: record.scheduledEndAt,
      actualClockInAt,
      actualClockOutAt,
      breakMinutes: record.breakMinutes,
    });

    const updated = await tx.attendanceRecord.update({
      where: { id: record.id },
      data: {
        actualClockInAt,
        actualClockOutAt,
        firstPunchAt: record.firstPunchAt ?? occurredAt,
        lastPunchAt: occurredAt,
        actualMinutes: metrics.actualMinutes,
        payableMinutes: metrics.payableMinutes,
        overtimeMinutes: metrics.overtimeMinutes,
        lateMinutes: metrics.lateMinutes,
        earlyLeaveMinutes: metrics.earlyLeaveMinutes,
        status: type === AttendancePunchType.CLOCK_OUT ? AttendanceRecordStatus.COMPLETED : AttendanceRecordStatus.OPEN,
      },
    });

    if (type === AttendancePunchType.CLOCK_OUT) {
      await this.syncRecordExceptions(updated.id, tx);
    }

    return updated;
  }

  private async syncRecordExceptions(recordId: string, tx: AttendanceDataClient = this.prisma) {
    const record = await tx.attendanceRecord.findUnique({
      where: { id: recordId },
      include: { scheduleAssignment: true, policy: true },
    });

    if (!record) {
      return;
    }

    if (!record.scheduleAssignmentId && record.actualClockInAt) {
      await this.upsertException({
        tenantId: record.tenantId,
        employeeId: record.employeeId,
        attendanceRecordId: record.id,
        type: AttendanceExceptionType.UNSCHEDULED_WORK,
        occurredAt: record.actualClockInAt,
        minutes: record.actualMinutes || null,
        title: 'Unscheduled work',
        description: 'Clocked work was recorded without a linked schedule assignment.',
      }, tx);
    }

    if (record.lateMinutes > 0) {
      await this.upsertException({
        tenantId: record.tenantId,
        employeeId: record.employeeId,
        attendanceRecordId: record.id,
        scheduleAssignmentId: record.scheduleAssignmentId,
        type: AttendanceExceptionType.LATE_ARRIVAL,
        occurredAt: record.actualClockInAt ?? record.workDate,
        minutes: record.lateMinutes,
        title: 'Late arrival',
        description: `${record.lateMinutes} minute late arrival against the planned start time.`,
      }, tx);
    }

    if (record.earlyLeaveMinutes > 0) {
      await this.upsertException({
        tenantId: record.tenantId,
        employeeId: record.employeeId,
        attendanceRecordId: record.id,
        scheduleAssignmentId: record.scheduleAssignmentId,
        type: AttendanceExceptionType.EARLY_DEPARTURE,
        occurredAt: record.actualClockOutAt ?? record.workDate,
        minutes: record.earlyLeaveMinutes,
        title: 'Early departure',
        description: `${record.earlyLeaveMinutes} minute early departure against the planned end time.`,
      }, tx);
    }

    if (record.overtimeMinutes > 0) {
      await this.upsertException({
        tenantId: record.tenantId,
        employeeId: record.employeeId,
        attendanceRecordId: record.id,
        scheduleAssignmentId: record.scheduleAssignmentId,
        type: AttendanceExceptionType.OVERTIME,
        occurredAt: record.actualClockOutAt ?? record.workDate,
        minutes: record.overtimeMinutes,
        title: 'Overtime detected',
        description: `${record.overtimeMinutes} overtime minutes were detected from actual time worked.`,
      }, tx);
    }
  }

  private async closeOpenBreaksForManualCompletion(
    recordId: string,
    endedAt: Date,
    client: AttendanceDataClient = this.prisma,
  ) {
    const openBreaks = await client.attendanceBreak.findMany({
      where: { attendanceRecordId: recordId, endedAt: null },
    });

    await Promise.all(openBreaks.map((breakEntry) => client.attendanceBreak.update({
      where: { id: breakEntry.id },
      data: {
        endedAt,
        minutes: this.durationMinutes(breakEntry.startedAt, endedAt, 0),
        source: AttendanceSource.MANUAL,
      },
    })));
  }

  private async assertRecordWritableForAdjustment(
    tenantId: string,
    recordId: string,
    client: AttendanceDataClient = this.prisma,
  ) {
    const lockedEntry = await client.attendanceTimesheetEntry.findFirst({
      where: {
        tenantId,
        attendanceRecordId: recordId,
        timesheet: { status: { in: FINAL_TIMESHEET_STATUSES } },
      },
      include: { timesheet: true },
    });

    if (lockedEntry?.timesheet) {
      throw new ConflictException('This attendance record is in an approved or locked timesheet. Reopen the timesheet before correcting the record.');
    }
  }

  private async collectAttendanceInsightData(actor: AuthenticatedPrincipal, query: AttendanceInsightsQueryDto) {
    const tenantId = this.requireTenant(actor);
    if (query.employeeId) {
      await this.assertCanOperateOnEmployee(actor, query.employeeId);
    }
    const employeeWhere = query.employeeId
      ? { employeeId: query.employeeId }
      : await this.employeeScopeWhere(actor);
    const now = new Date();
    const range = {
      from: query.from
        ? this.startOfDay(this.toDate(query.from))
        : this.addDays(this.startOfDay(now), -(query.lookbackDays ?? 30)),
      to: query.to
        ? this.endOfDay(this.toDate(query.to))
        : this.endOfDay(now),
    };
    const employeeSearch = this.employeeSearchWhere(query);
    const assignmentDimensions = this.assignmentDimensionWhere(query);
    const directDimensions = this.assignmentDirectDimensionWhere(query);

    const [records, exceptions, correctionRequests, timesheets, assignments, punches, devices, geofences] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: {
          tenantId,
          workDate: { gte: range.from, lte: range.to },
          ...employeeWhere,
          ...(query.status ? { status: query.status } : {}),
          ...(query.locationName ? { locationName: { contains: query.locationName, mode: Prisma.QueryMode.insensitive } } : {}),
          ...employeeSearch,
          ...assignmentDimensions,
        },
        orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
        include: {
          employee: { include: { person: true } },
          scheduleAssignment: true,
        },
      }),
      this.prisma.attendanceException.findMany({
        where: {
          tenantId,
          occurredAt: { gte: range.from, lte: range.to },
          ...employeeWhere,
          ...employeeSearch,
          ...assignmentDimensions,
        },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        include: { employee: { include: { person: true } } },
      }),
      this.prisma.attendanceCorrectionRequest.findMany({
        where: {
          tenantId,
          workDate: { gte: range.from, lte: range.to },
          ...employeeWhere,
          ...employeeSearch,
          ...assignmentDimensions,
        },
        orderBy: [{ workDate: 'asc' }, { requestedAt: 'asc' }],
        include: { employee: { include: { person: true } } },
      }),
      this.prisma.attendanceTimesheet.findMany({
        where: {
          tenantId,
          periodStart: { lte: range.to },
          periodEnd: { gte: range.from },
          ...employeeWhere,
          ...employeeSearch,
        },
        orderBy: [{ periodStart: 'asc' }, { createdAt: 'asc' }],
        include: { employee: { include: { person: true } } },
      }),
      this.prisma.scheduleAssignment.findMany({
        where: {
          tenantId,
          workDate: { gte: range.from, lte: range.to },
          status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
          ...employeeWhere,
          ...employeeSearch,
          ...directDimensions,
          ...(query.locationName ? { locationName: { contains: query.locationName, mode: Prisma.QueryMode.insensitive } } : {}),
        },
        orderBy: [{ workDate: 'asc' }, { startsAt: 'asc' }],
        include: { employee: { include: { person: true } } },
      }),
      this.prisma.attendancePunch.findMany({
        where: {
          tenantId,
          occurredAt: { gte: range.from, lte: range.to },
          ...employeeWhere,
          ...employeeSearch,
        },
        orderBy: [{ occurredAt: 'asc' }],
        include: { employee: { include: { person: true } } },
      }),
      this.prisma.attendanceClockDevice.findMany({
        where: { tenantId, deletedAt: null },
        include: this.clockDeviceInclude,
      }),
      this.prisma.attendanceGeofence.findMany({
        where: { tenantId, deletedAt: null },
        include: this.geofenceInclude,
      }),
    ]);

    return {
      tenantId,
      range,
      records,
      exceptions,
      correctionRequests,
      timesheets,
      assignments,
      punches,
      devices,
      geofences,
    };
  }

  private attendanceRiskEmployees(insight: Awaited<ReturnType<AttendanceService['collectAttendanceInsightData']>>) {
    const stats = new Map<string, {
      employeeId: string;
      employee: BoardEmployee | null;
      employeeName: string;
      signals: {
        records: number;
        lateRecords: number;
        lateMinutes: number;
        openExceptions: number;
        pendingCorrections: number;
        overtimeMinutes: number;
        outsideGeofence: number;
        unapprovedLocation: number;
        missedOrAbsent: number;
        missingDevicePunches: number;
      };
    }>();
    const ensure = (employeeId: string, employee?: BoardEmployee | null) => {
      const existing = stats.get(employeeId);
      if (existing) {
        if (!existing.employee && employee) {
          existing.employee = employee;
          existing.employeeName = this.employeeDisplayName(employee);
        }
        return existing;
      }
      const item = {
        employeeId,
        employee: employee ?? null,
        employeeName: this.employeeDisplayName(employee) || employeeId,
        signals: {
          records: 0,
          lateRecords: 0,
          lateMinutes: 0,
          openExceptions: 0,
          pendingCorrections: 0,
          overtimeMinutes: 0,
          outsideGeofence: 0,
          unapprovedLocation: 0,
          missedOrAbsent: 0,
          missingDevicePunches: 0,
        },
      };
      stats.set(employeeId, item);
      return item;
    };

    for (const record of insight.records) {
      const item = ensure(record.employeeId, record.employee);
      item.signals.records += 1;
      item.signals.lateMinutes += record.lateMinutes;
      item.signals.overtimeMinutes += record.overtimeMinutes;
      if (record.lateMinutes > 0) {
        item.signals.lateRecords += 1;
      }
    }

    for (const exception of insight.exceptions) {
      const item = ensure(exception.employeeId, exception.employee);
      if (OPEN_EXCEPTION_STATUSES.includes(exception.status)) {
        item.signals.openExceptions += 1;
      }
      if (exception.type === AttendanceExceptionType.OUTSIDE_GEOFENCE) {
        item.signals.outsideGeofence += 1;
      }
      if (exception.type === AttendanceExceptionType.UNAPPROVED_LOCATION) {
        item.signals.unapprovedLocation += 1;
      }
      if (
        exception.type === AttendanceExceptionType.ABSENCE ||
        exception.type === AttendanceExceptionType.MISSED_CLOCK_IN ||
        exception.type === AttendanceExceptionType.MISSED_CLOCK_OUT
      ) {
        item.signals.missedOrAbsent += 1;
      }
    }

    for (const request of insight.correctionRequests) {
      const item = ensure(request.employeeId, request.employee);
      if (OPEN_CORRECTION_REQUEST_STATUSES.includes(request.status)) {
        item.signals.pendingCorrections += 1;
      }
    }

    const recordsByAssignment = new Set(insight.records.map((record) => record.scheduleAssignmentId).filter(Boolean));
    const now = new Date();
    for (const assignment of insight.assignments) {
      const item = ensure(assignment.employeeId, assignment.employee);
      if (assignment.startsAt < now && !recordsByAssignment.has(assignment.id)) {
        item.signals.missedOrAbsent += 1;
      }
    }

    for (const punch of insight.punches) {
      const item = ensure(punch.employeeId, punch.employee);
      if (!punch.deviceId) {
        item.signals.missingDevicePunches += 1;
      }
    }

    return [...stats.values()]
      .map((item) => {
        const score = Math.min(150, Math.round(
          item.signals.lateRecords * 10 +
          item.signals.lateMinutes * 0.35 +
          item.signals.openExceptions * 14 +
          item.signals.pendingCorrections * 10 +
          item.signals.overtimeMinutes * 0.08 +
          item.signals.outsideGeofence * 24 +
          item.signals.unapprovedLocation * 20 +
          item.signals.missedOrAbsent * 28 +
          item.signals.missingDevicePunches * 3,
        ));
        return {
          employeeId: item.employeeId,
          employee: item.employee,
          employeeName: item.employeeName,
          score,
          signals: item.signals,
        };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.employeeName.localeCompare(right.employeeName));
  }

  private geofenceData(tenantId: string, dto: CreateAttendanceGeofenceDto): Prisma.AttendanceGeofenceUncheckedCreateInput {
    return {
      tenantId,
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      description: this.textOrUndefined(dto.description),
      status: dto.status ?? AttendanceControlStatus.ACTIVE,
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusMeters: dto.radiusMeters ?? 150,
      locationName: this.textOrUndefined(dto.locationName),
      organizationNodeId: this.textOrUndefined(dto.organizationNodeId),
      costCenterId: this.textOrUndefined(dto.costCenterId),
      positionId: this.textOrUndefined(dto.positionId),
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    };
  }

  private geofenceUpdateData(dto: UpdateAttendanceGeofenceDto): Prisma.AttendanceGeofenceUncheckedUpdateInput {
    return {
      code: dto.code === undefined ? undefined : dto.code.trim().toUpperCase(),
      name: dto.name === undefined ? undefined : dto.name.trim(),
      description: this.textOrNullForUpdate(dto.description),
      status: dto.status,
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusMeters: dto.radiusMeters,
      locationName: this.textOrNullForUpdate(dto.locationName),
      organizationNodeId: this.textOrNullForUpdate(dto.organizationNodeId),
      costCenterId: this.textOrNullForUpdate(dto.costCenterId),
      positionId: this.textOrNullForUpdate(dto.positionId),
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    };
  }

  private clockDeviceData(tenantId: string, dto: CreateAttendanceClockDeviceDto): Prisma.AttendanceClockDeviceUncheckedCreateInput {
    return {
      tenantId,
      deviceId: dto.deviceId.trim(),
      name: dto.name.trim(),
      description: this.textOrUndefined(dto.description),
      type: dto.type ?? AttendanceClockDeviceType.KIOSK,
      status: dto.status ?? AttendanceControlStatus.ACTIVE,
      geofenceId: this.textOrUndefined(dto.geofenceId),
      employeeId: this.textOrUndefined(dto.employeeId),
      locationName: this.textOrUndefined(dto.locationName),
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    };
  }

  private clockDeviceUpdateData(dto: UpdateAttendanceClockDeviceDto): Prisma.AttendanceClockDeviceUncheckedUpdateInput {
    return {
      deviceId: dto.deviceId === undefined ? undefined : dto.deviceId.trim(),
      name: dto.name === undefined ? undefined : dto.name.trim(),
      description: this.textOrNullForUpdate(dto.description),
      type: dto.type,
      status: dto.status,
      geofenceId: this.textOrNullForUpdate(dto.geofenceId),
      employeeId: this.textOrNullForUpdate(dto.employeeId),
      locationName: this.textOrNullForUpdate(dto.locationName),
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    };
  }

  private async assertGeofenceExists(tenantId: string, geofenceId: string, client: AttendanceDataClient = this.prisma) {
    const geofence = await client.attendanceGeofence.findFirst({
      where: { tenantId, id: geofenceId, deletedAt: null },
      include: this.geofenceInclude,
    });

    if (!geofence) {
      throw new NotFoundException('Attendance geofence not found.');
    }

    return geofence;
  }

  private async assertClockDeviceExists(tenantId: string, deviceId: string, client: AttendanceDataClient = this.prisma) {
    const device = await client.attendanceClockDevice.findFirst({
      where: { tenantId, id: deviceId, deletedAt: null },
      include: this.clockDeviceInclude,
    });

    if (!device) {
      throw new NotFoundException('Attendance clock device not found.');
    }

    return device;
  }

  private async assertDeviceReferences(tenantId: string, geofenceId?: string, employeeId?: string) {
    if (geofenceId?.trim()) {
      await this.assertGeofenceExists(tenantId, geofenceId.trim());
    }

    if (employeeId?.trim()) {
      const employee = await this.prisma.employee.findFirst({
        where: { tenantId, id: employeeId.trim(), deletedAt: null },
        select: { id: true },
      });

      if (!employee) {
        throw new NotFoundException('Employee for attendance clock device not found.');
      }
    }
  }

  private async assertEmployeeExists(tenantId: string, employeeId: string, client: AttendanceDataClient = this.prisma) {
    const employee = await client.employee.findFirst({
      where: { tenantId, id: employeeId, deletedAt: null },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found for attendance control.');
    }

    return employee;
  }

  private async assertKioskCredentialExists(tenantId: string, credentialId: string, client: AttendanceDataClient = this.prisma) {
    const credential = await client.attendanceKioskCredential.findFirst({
      where: { tenantId, id: credentialId, deletedAt: null },
      select: this.kioskCredentialSelect,
    });

    if (!credential) {
      throw new NotFoundException('Attendance kiosk credential not found.');
    }

    return credential;
  }

  private async assertHolidayExists(tenantId: string, holidayId: string, client: AttendanceDataClient = this.prisma) {
    const holiday = await client.attendanceHoliday.findFirst({
      where: { tenantId, id: holidayId, deletedAt: null },
    });

    if (!holiday) {
      throw new NotFoundException('Attendance holiday not found.');
    }

    return holiday;
  }

  private async assertPremiumRuleExists(tenantId: string, ruleId: string, client: AttendanceDataClient = this.prisma) {
    const rule = await client.attendancePremiumRule.findFirst({
      where: { tenantId, id: ruleId, deletedAt: null },
    });

    if (!rule) {
      throw new NotFoundException('Attendance premium rule not found.');
    }

    return rule;
  }

  private hashKioskPin(pin: string) {
    return argon2.hash(pin.trim(), {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  private holidayData(tenantId: string, dto: CreateAttendanceHolidayDto): Prisma.AttendanceHolidayUncheckedCreateInput {
    return {
      tenantId,
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      date: this.startOfDay(this.toDate(dto.date)),
      status: dto.status ?? AttendanceControlStatus.ACTIVE,
      paid: dto.paid ?? true,
      multiplier: dto.multiplier ?? 1,
      description: this.textOrUndefined(dto.description),
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    };
  }

  private holidayUpdateData(dto: UpdateAttendanceHolidayDto): Prisma.AttendanceHolidayUncheckedUpdateInput {
    return {
      code: dto.code === undefined ? undefined : dto.code.trim().toUpperCase(),
      name: dto.name === undefined ? undefined : dto.name.trim(),
      date: dto.date === undefined ? undefined : this.startOfDay(this.toDate(dto.date)),
      status: dto.status,
      paid: dto.paid,
      multiplier: dto.multiplier,
      description: this.textOrNullForUpdate(dto.description),
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    };
  }

  private premiumRuleData(tenantId: string, dto: CreateAttendancePremiumRuleDto): Prisma.AttendancePremiumRuleUncheckedCreateInput {
    return {
      tenantId,
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      type: dto.type,
      status: dto.status ?? AttendanceControlStatus.ACTIVE,
      multiplier: dto.multiplier ?? 1,
      startsAtMinute: dto.startsAtMinute,
      endsAtMinute: dto.endsAtMinute,
      weekdays: dto.weekdays ?? [],
      organizationNodeId: this.textOrUndefined(dto.organizationNodeId),
      costCenterId: this.textOrUndefined(dto.costCenterId),
      positionId: this.textOrUndefined(dto.positionId),
      locationName: this.textOrUndefined(dto.locationName),
      effectiveFrom: dto.effectiveFrom ? this.toDate(dto.effectiveFrom) : undefined,
      effectiveTo: dto.effectiveTo ? this.toDate(dto.effectiveTo) : undefined,
      description: this.textOrUndefined(dto.description),
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    };
  }

  private premiumRuleUpdateData(dto: UpdateAttendancePremiumRuleDto): Prisma.AttendancePremiumRuleUncheckedUpdateInput {
    return {
      code: dto.code === undefined ? undefined : dto.code.trim().toUpperCase(),
      name: dto.name === undefined ? undefined : dto.name.trim(),
      type: dto.type,
      status: dto.status,
      multiplier: dto.multiplier,
      startsAtMinute: dto.startsAtMinute,
      endsAtMinute: dto.endsAtMinute,
      weekdays: dto.weekdays,
      organizationNodeId: this.textOrNullForUpdate(dto.organizationNodeId),
      costCenterId: this.textOrNullForUpdate(dto.costCenterId),
      positionId: this.textOrNullForUpdate(dto.positionId),
      locationName: this.textOrNullForUpdate(dto.locationName),
      effectiveFrom: dto.effectiveFrom === undefined ? undefined : dto.effectiveFrom ? this.toDate(dto.effectiveFrom) : null,
      effectiveTo: dto.effectiveTo === undefined ? undefined : dto.effectiveTo ? this.toDate(dto.effectiveTo) : null,
      description: this.textOrNullForUpdate(dto.description),
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    };
  }

  private offlinePunchPayload(item: OfflinePunchAttendanceDto) {
    return {
      clientMutationId: item.clientMutationId,
      type: item.type,
      occurredAt: item.occurredAt,
      source: item.source ?? AttendanceSource.WEB,
      scheduleAssignmentId: item.scheduleAssignmentId ?? null,
      timezone: item.timezone ?? null,
      locationName: item.locationName ?? null,
      deviceId: item.deviceId ?? null,
      latitude: item.latitude ?? null,
      longitude: item.longitude ?? null,
      note: item.note ?? null,
      photoAttestationUrl: item.photoAttestationUrl ?? null,
      attestationNote: item.attestationNote ?? null,
    };
  }

  private async resolveCorrectionEmployeeId(
    actor: AuthenticatedPrincipal,
    requestedEmployeeId?: string,
    recordEmployeeId?: string,
  ) {
    if (recordEmployeeId) {
      return recordEmployeeId;
    }

    if (requestedEmployeeId) {
      return requestedEmployeeId;
    }

    const self = await this.getSelfEmployeeOrNull(actor);
    if (!self) {
      throw new BadRequestException('Choose an employee for this correction request.');
    }

    return self.id;
  }

  private attendanceRecordSnapshot(record: AttendanceRecordWithRelations | AttendanceRecord) {
    return {
      id: record.id,
      employeeId: record.employeeId,
      scheduleAssignmentId: record.scheduleAssignmentId,
      workDate: record.workDate.toISOString(),
      actualClockInAt: record.actualClockInAt?.toISOString() ?? null,
      actualClockOutAt: record.actualClockOutAt?.toISOString() ?? null,
      breakMinutes: record.breakMinutes,
      scheduledMinutes: record.scheduledMinutes,
      actualMinutes: record.actualMinutes,
      payableMinutes: record.payableMinutes,
      overtimeMinutes: record.overtimeMinutes,
      lateMinutes: record.lateMinutes,
      earlyLeaveMinutes: record.earlyLeaveMinutes,
      status: record.status,
      source: record.source,
      locationName: record.locationName,
      notes: record.notes,
    };
  }

  private bestReconciliationMatch(record: AttendanceRecordWithRelations, assignments: AttendanceAssignment[]) {
    const actualStart = record.actualClockInAt ?? record.firstPunchAt;
    const actualEnd = record.actualClockOutAt ?? record.lastPunchAt;
    const anchor = actualStart ?? record.workDate;
    const candidates = assignments
      .map((assignment) => {
        const startDeltaMinutes = this.absoluteMinutes(anchor, assignment.startsAt);
        const endDeltaMinutes = actualEnd ? this.absoluteMinutes(actualEnd, assignment.endsAt) : null;
        const overlapsActual = actualStart && actualEnd
          ? assignment.startsAt <= this.addHours(actualEnd, 6) && assignment.endsAt >= this.addHours(actualStart, -6)
          : startDeltaMinutes <= 18 * 60;
        const sameWorkDate = this.formatDate(record.workDate) === this.formatDate(assignment.workDate);
        const assignmentOvernight = this.formatDate(assignment.startsAt) !== this.formatDate(assignment.endsAt);
        const actualOvernight = Boolean(actualStart && actualEnd && this.formatDate(actualStart) !== this.formatDate(actualEnd));

        if (!overlapsActual && startDeltaMinutes > 18 * 60) {
          return null;
        }

        const endPenalty = endDeltaMinutes === null ? 8 : Math.min(35, endDeltaMinutes / 4);
        const confidence = Math.max(0, Math.min(100, Math.round(
          100 -
          Math.min(60, startDeltaMinutes / 3) -
          endPenalty +
          (sameWorkDate ? 6 : 0) +
          (assignmentOvernight && actualOvernight ? 8 : 0),
        )));
        const reason = assignmentOvernight || actualOvernight
          ? 'Matched by overnight-aware start/end proximity.'
          : assignments.length > 1
            ? 'Matched to nearest split-shift candidate.'
            : 'Matched to nearest scheduled assignment.';

        return {
          assignment,
          confidence,
          reason,
          startDeltaMinutes,
          endDeltaMinutes,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) =>
        right.confidence - left.confidence ||
        left.startDeltaMinutes - right.startDeltaMinutes ||
        (left.endDeltaMinutes ?? 0) - (right.endDeltaMinutes ?? 0),
      );

    return candidates[0] ?? null;
  }

  private reconciliationResult(
    record: AttendanceRecordWithRelations,
    match: ReturnType<AttendanceService['bestReconciliationMatch']>,
    action: string,
  ) {
    return {
      recordId: record.id,
      employeeId: record.employeeId,
      workDate: record.workDate,
      action,
      currentScheduleAssignmentId: record.scheduleAssignmentId,
      matchedScheduleAssignmentId: match?.assignment.id ?? null,
      matchedShiftName: match?.assignment.shift?.name ?? null,
      confidence: match?.confidence ?? 0,
      reason: match?.reason ?? 'No nearby schedule assignment matched this attendance record.',
      startDeltaMinutes: match?.startDeltaMinutes ?? null,
      endDeltaMinutes: match?.endDeltaMinutes ?? null,
    };
  }

  private reconciliationSummary(items: Array<{ action: string }>) {
    return {
      evaluated: items.length,
      matched: items.filter((item) => item.action === 'MATCH').length,
      alreadyMatched: items.filter((item) => item.action === 'ALREADY_MATCHED').length,
      lowConfidence: items.filter((item) => item.action === 'LOW_CONFIDENCE').length,
      unmatched: items.filter((item) => item.action === 'UNMATCHED').length,
      applied: 0,
    };
  }

  private groupBy<T, K>(items: T[], keyFor: (item: T) => K) {
    const grouped = new Map<K, T[]>();
    for (const item of items) {
      const key = keyFor(item);
      const bucket = grouped.get(key) ?? [];
      bucket.push(item);
      grouped.set(key, bucket);
    }
    return grouped;
  }

  private jsonObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private correctionRequestedSnapshot(input: {
    employeeId: string;
    workDate: Date;
    scheduleAssignmentId: string | null;
    actualClockInAt: Date | null;
    actualClockOutAt: Date | null;
    breakMinutes: number;
    locationName: string | null;
    notes: string | null;
    metrics: ReturnType<AttendanceService['calculateMetrics']>;
  }) {
    return {
      employeeId: input.employeeId,
      scheduleAssignmentId: input.scheduleAssignmentId,
      workDate: input.workDate.toISOString(),
      actualClockInAt: input.actualClockInAt?.toISOString() ?? null,
      actualClockOutAt: input.actualClockOutAt?.toISOString() ?? null,
      breakMinutes: input.breakMinutes,
      locationName: input.locationName,
      notes: input.notes,
      scheduledMinutes: input.metrics.scheduledMinutes,
      actualMinutes: input.metrics.actualMinutes,
      payableMinutes: input.metrics.payableMinutes,
      overtimeMinutes: input.metrics.overtimeMinutes,
      lateMinutes: input.metrics.lateMinutes,
      earlyLeaveMinutes: input.metrics.earlyLeaveMinutes,
    };
  }

  private attendancePolicySnapshot(policy: AttendancePolicy) {
    return {
      id: policy.id,
      code: policy.code,
      name: policy.name,
      timezone: policy.timezone,
      allowWebClockIn: policy.allowWebClockIn,
      allowMobileClockIn: policy.allowMobileClockIn,
      allowKioskClockIn: policy.allowKioskClockIn,
      requireScheduleForClockIn: policy.requireScheduleForClockIn,
      requireLocationCapture: policy.requireLocationCapture,
      requireKnownDevice: policy.requireKnownDevice,
      requireGeofenceForClockIn: policy.requireGeofenceForClockIn,
      blockOutsideGeofence: policy.blockOutsideGeofence,
      geofenceGraceMeters: policy.geofenceGraceMeters,
      allowManualAdjustments: policy.allowManualAdjustments,
      graceMinutesLate: policy.graceMinutesLate,
      graceMinutesEarlyLeave: policy.graceMinutesEarlyLeave,
      roundingMinutes: policy.roundingMinutes,
      maxShiftMinutes: policy.maxShiftMinutes,
      dailyOvertimeMinutes: policy.dailyOvertimeMinutes,
      weeklyOvertimeMinutes: policy.weeklyOvertimeMinutes,
      breakRequiredAfterMinutes: policy.breakRequiredAfterMinutes,
      breakDurationMinutes: policy.breakDurationMinutes,
    };
  }

  private manualRecordMetadata(
    existing: AttendanceRecord | null,
    dto: ManualAttendanceRecordDto,
    actorId: string,
    next: {
      actualClockInAt: Date | null;
      actualClockOutAt: Date | null;
      breakMinutes: number;
      locationName: string | null;
      notes: string | null;
    },
    context: Record<string, unknown> = {},
  ): Prisma.InputJsonValue {
    const existingMetadata = this.jsonRecord(existing?.metadata);
    const previousAdjustments = this.jsonRecordArray(existingMetadata.adjustments);
    const adjustedAt = new Date().toISOString();
    const reason = dto.adjustmentReason?.trim();
    const supportingDocumentUrl = dto.supportingDocumentUrl?.trim();
    const adjustment: Record<string, unknown> = {
      adjustedAt,
      adjustedById: actorId,
      reason: reason ?? null,
      supportingDocumentUrl: supportingDocumentUrl ?? null,
      previous: existing
        ? {
            actualClockInAt: existing.actualClockInAt?.toISOString() ?? null,
            actualClockOutAt: existing.actualClockOutAt?.toISOString() ?? null,
            breakMinutes: existing.breakMinutes,
            locationName: existing.locationName,
            notes: existing.notes,
          }
        : null,
      next: {
        actualClockInAt: next.actualClockInAt?.toISOString() ?? null,
        actualClockOutAt: next.actualClockOutAt?.toISOString() ?? null,
        breakMinutes: next.breakMinutes,
        locationName: next.locationName,
        notes: next.notes,
      },
      context,
    };

    return this.toJson({
      ...existingMetadata,
      manual: true,
      adjustedById: actorId,
      adjustedAt,
      adjustmentReason: reason ?? null,
      supportingDocumentUrl: supportingDocumentUrl ?? null,
      ...context,
      adjustments: [...previousAdjustments, adjustment],
    })!;
  }

  private async upsertException(
    data: {
      tenantId: string;
      employeeId: string;
      attendanceRecordId?: string | null;
      scheduleAssignmentId?: string | null;
      type: AttendanceExceptionType;
      occurredAt: Date;
      minutes?: number | null;
      title: string;
      description?: string;
      severity?: string;
      metadata?: Record<string, unknown>;
    },
    client: AttendanceDataClient = this.prisma,
  ) {
    const existing = await client.attendanceException.findFirst({
      where: {
        tenantId: data.tenantId,
        employeeId: data.employeeId,
        attendanceRecordId: data.attendanceRecordId ?? null,
        scheduleAssignmentId: data.scheduleAssignmentId ?? null,
        type: data.type,
        status: { not: AttendanceExceptionStatus.CANCELLED },
      },
    });

    if (existing) {
      return client.attendanceException.update({
        where: { id: existing.id },
        data: {
          occurredAt: data.occurredAt,
          minutes: data.minutes,
          title: data.title,
          description: data.description,
          severity: data.severity ?? existing.severity,
          metadata: this.toJson(data.metadata),
        },
      });
    }

    return client.attendanceException.create({
      data: {
        tenantId: data.tenantId,
        employeeId: data.employeeId,
        attendanceRecordId: data.attendanceRecordId ?? null,
        scheduleAssignmentId: data.scheduleAssignmentId ?? null,
        type: data.type,
        status: AttendanceExceptionStatus.OPEN,
        occurredAt: data.occurredAt,
        minutes: data.minutes,
        title: data.title,
        description: data.description,
        severity: data.severity,
        metadata: this.toJson(data.metadata),
      },
    });
  }

  private async upsertTimesheetEntry(
    timesheetId: string,
    employeeId: string,
    workDate: Date,
    record: AttendanceRecordWithRelations | null,
    assignment: AttendanceAssignment | null,
    client: AttendanceDataClient = this.prisma,
  ) {
    const exceptionCount = await client.attendanceException.count({
      where: {
        employeeId,
        ...(record ? { attendanceRecordId: record.id } : {}),
        ...(assignment ? { scheduleAssignmentId: assignment.id } : {}),
        status: { in: OPEN_EXCEPTION_STATUSES },
      },
    });
    const existing = await client.attendanceTimesheetEntry.findFirst({
      where: {
        timesheetId,
        employeeId,
        workDate: this.startOfDay(workDate),
        ...(record ? { attendanceRecordId: record.id } : {}),
        ...(assignment ? { scheduleAssignmentId: assignment.id } : {}),
      },
    });
    const scheduledMinutes = assignment
      ? this.durationMinutes(assignment.startsAt, assignment.endsAt, assignment.breakMinutes)
      : record?.scheduledMinutes ?? 0;
    const data = {
      tenantId: record?.tenantId ?? assignment?.tenantId ?? '',
      timesheetId,
      employeeId,
      attendanceRecordId: record?.id ?? null,
      scheduleAssignmentId: assignment?.id ?? record?.scheduleAssignmentId ?? null,
      workDate: this.startOfDay(workDate),
      scheduledMinutes,
      actualMinutes: record?.actualMinutes ?? 0,
      breakMinutes: record?.breakMinutes ?? assignment?.breakMinutes ?? 0,
      payableMinutes: record?.payableMinutes ?? 0,
      overtimeMinutes: record?.overtimeMinutes ?? 0,
      exceptionCount,
      status: exceptionCount > 0 ? AttendanceTimesheetEntryStatus.EXCEPTION : AttendanceTimesheetEntryStatus.READY,
    };

    if (!data.tenantId) {
      throw new BadRequestException('Timesheet entry needs a tenant context.');
    }

    return existing
      ? client.attendanceTimesheetEntry.update({ where: { id: existing.id }, data })
      : client.attendanceTimesheetEntry.create({ data });
  }

  private async recalculateTimesheet(timesheetId: string, client: AttendanceDataClient = this.prisma) {
    const entries = await client.attendanceTimesheetEntry.findMany({
      where: { timesheetId },
    });
    const totals = entries.reduce(
      (acc, entry) => ({
        regularMinutes: acc.regularMinutes + Math.max(0, entry.payableMinutes - entry.overtimeMinutes),
        overtimeMinutes: acc.overtimeMinutes + entry.overtimeMinutes,
        breakMinutes: acc.breakMinutes + entry.breakMinutes,
        exceptionCount: acc.exceptionCount + entry.exceptionCount,
      }),
      { regularMinutes: 0, overtimeMinutes: 0, breakMinutes: 0, exceptionCount: 0 },
    );

    return client.attendanceTimesheet.update({
      where: { id: timesheetId },
      data: totals,
      include: this.timesheetInclude,
    });
  }

  private calculateMetrics(input: {
    policy: AttendancePolicy;
    assignment: AttendanceAssignment | null;
    scheduledStartAt?: Date | null;
    scheduledEndAt?: Date | null;
    actualClockInAt?: Date | null;
    actualClockOutAt?: Date | null;
    breakMinutes: number;
  }) {
    const scheduledStartAt = input.assignment?.startsAt ?? input.scheduledStartAt ?? null;
    const scheduledEndAt = input.assignment?.endsAt ?? input.scheduledEndAt ?? null;
    const scheduledBreakMinutes = input.assignment?.breakMinutes ?? input.breakMinutes ?? 0;
    const scheduledMinutes = scheduledStartAt && scheduledEndAt
      ? this.durationMinutes(scheduledStartAt, scheduledEndAt, scheduledBreakMinutes)
      : 0;
    const actualMinutes = input.actualClockInAt && input.actualClockOutAt
      ? this.durationMinutes(input.actualClockInAt, input.actualClockOutAt, 0)
      : 0;
    const breakMinutes = Math.max(0, input.breakMinutes ?? scheduledBreakMinutes);
    const payableBeforeRounding = Math.max(0, actualMinutes - breakMinutes);
    const payableMinutes = this.roundMinutes(payableBeforeRounding, input.policy.roundingMinutes);
    const dailyThreshold = input.policy.dailyOvertimeMinutes ?? (scheduledMinutes > 0 ? scheduledMinutes : null);
    const overtimeMinutes = dailyThreshold ? Math.max(0, payableMinutes - dailyThreshold) : 0;
    const lateMinutes = scheduledStartAt && input.actualClockInAt
      ? Math.max(0, this.durationMinutes(scheduledStartAt, input.actualClockInAt, 0) - input.policy.graceMinutesLate)
      : 0;
    const earlyLeaveMinutes = scheduledEndAt && input.actualClockOutAt
      ? Math.max(0, this.durationMinutes(input.actualClockOutAt, scheduledEndAt, 0) - input.policy.graceMinutesEarlyLeave)
      : 0;

    return {
      scheduledMinutes,
      actualMinutes,
      breakMinutes,
      payableMinutes,
      overtimeMinutes,
      lateMinutes,
      earlyLeaveMinutes,
    };
  }

  private async resolvePunchAssignment(
    tenantId: string,
    employeeId: string,
    assignmentId: string | undefined,
    occurredAt: Date,
  ) {
    if (assignmentId) {
      const assignment = await this.prisma.scheduleAssignment.findFirst({
        where: { id: assignmentId, tenantId, employeeId },
        include: this.assignmentInclude,
      });

      if (!assignment) {
        throw new NotFoundException('Schedule assignment not found for this employee.');
      }

      return assignment;
    }

    const rangeStart = this.addHours(occurredAt, -12);
    const rangeEnd = this.addHours(occurredAt, 12);
    return this.prisma.scheduleAssignment.findFirst({
      where: {
        tenantId,
        employeeId,
        startsAt: { lte: rangeEnd },
        endsAt: { gte: rangeStart },
        status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
      },
      orderBy: [{ startsAt: 'asc' }],
      include: this.assignmentInclude,
    });
  }

  private async countMissedClockIns(tenantId: string, today: Date, tomorrow: Date, employeeScope: EmployeeScope) {
    const now = new Date();
    const cutoff = now < tomorrow ? now : tomorrow;
    const assignments = await this.prisma.scheduleAssignment.findMany({
      where: {
        tenantId,
        startsAt: { gte: today, lt: cutoff },
        status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
        ...employeeScope,
      },
      select: { id: true },
    });

    if (assignments.length === 0) {
      return 0;
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: { tenantId, scheduleAssignmentId: { in: assignments.map((assignment) => assignment.id) } },
      select: { scheduleAssignmentId: true },
    });
    const recorded = new Set(records.map((record) => record.scheduleAssignmentId));
    return assignments.filter((assignment) => !recorded.has(assignment.id)).length;
  }

  private async ensureActivePolicy(tenantId: string, client: AttendanceDataClient = this.prisma) {
    const existing = await client.attendancePolicy.findFirst({
      where: { tenantId, status: AttendancePolicyStatus.ACTIVE, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return existing;
    }

    return client.attendancePolicy.create({
      data: {
        tenantId,
        code: 'STANDARD_ATTENDANCE',
        name: 'Standard attendance policy',
        status: AttendancePolicyStatus.ACTIVE,
        graceMinutesLate: 5,
        graceMinutesEarlyLeave: 5,
        dailyOvertimeMinutes: 480,
        weeklyOvertimeMinutes: 2400,
        maxShiftMinutes: 960,
        autoCreateTimesheetEntries: true,
      },
    });
  }

  private async assertPolicyExists(tenantId: string, policyId: string) {
    const policy = await this.prisma.attendancePolicy.findFirst({
      where: { id: policyId, tenantId, deletedAt: null },
    });

    if (!policy) {
      throw new NotFoundException('Attendance policy not found.');
    }

    return policy;
  }

  private async requireSelfEmployee(actor: AuthenticatedPrincipal) {
    const employee = await this.getSelfEmployeeOrNull(actor);

    if (!employee) {
      throw new ForbiddenException('Your account is not linked to an employee record.');
    }

    return employee;
  }

  private async getSelfEmployeeOrNull(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.employee.findFirst({
      where: {
        tenantId,
        userId: actor.id,
        deletedAt: null,
      },
      include: {
        person: true,
        assignments: {
          where: this.currentPrimaryAssignmentWhere(new Date()),
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          include: {
            organizationNode: true,
            costCenter: true,
            position: true,
            managerEmployee: { include: { person: true } },
          },
        },
      },
    });
  }

  private async employeeScopeWhere(actor: AuthenticatedPrincipal): Promise<EmployeeScope> {
    if (actor.permissions.includes('attendance.write') || actor.permissions.includes('attendance.read')) {
      return {};
    }

    if (actor.permissions.includes('attendance.team.write')) {
      const manager = await this.getSelfEmployeeOrNull(actor);
      if (!manager) {
        return { employeeId: { in: [] } };
      }
      const team = await this.prisma.employeeAssignment.findMany({
        where: {
          tenantId: manager.tenantId,
          isPrimary: true,
          effectiveFrom: { lte: new Date() },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
          AND: [this.reportingScopeWhere(manager.id)],
        },
        select: { employeeId: true },
      });
      return { employeeId: { in: [...new Set([manager.id, ...team.map((item) => item.employeeId)])] } };
    }

    const self = await this.getSelfEmployeeOrNull(actor);
    return self ? { employeeId: self.id } : { employeeId: { in: [] } };
  }

  private async assertCanOperateOnEmployee(actor: AuthenticatedPrincipal, employeeId: string) {
    const scope = await this.employeeScopeWhere(actor);
    if ('employeeId' in scope) {
      const allowed = typeof scope.employeeId === 'string'
        ? scope.employeeId === employeeId
        : scope.employeeId.in.includes(employeeId);

      if (!allowed) {
        throw new ForbiddenException('This employee is outside your attendance scope.');
      }
    }
  }

  private supervisorBoardStatus(bucket: SupervisorBoardBucket, now: Date): SupervisorBoardStatus {
    const openRecord = bucket.records.find((record) => record.status === AttendanceRecordStatus.OPEN);
    const hasActiveBreak = openRecord?.breaks?.some((breakEntry) => !breakEntry.endedAt) ?? false;
    const hasLateSignal = bucket.exceptions.some((exception) => exception.type === AttendanceExceptionType.LATE_ARRIVAL);
    const absenceSignalTypes: AttendanceExceptionType[] = [
      AttendanceExceptionType.ABSENCE,
      AttendanceExceptionType.MISSED_CLOCK_IN,
    ];
    const hasAbsenceSignal = bucket.exceptions.some((exception) => absenceSignalTypes.includes(exception.type));
    const hasCompletedRecord = bucket.records.some((record) => record.status === AttendanceRecordStatus.COMPLETED);
    const hasRecord = bucket.records.length > 0;
    const firstAssignment = [...bucket.assignments].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0];

    if (bucket.correctionRequests.length > 0) {
      return 'NEEDS_REVIEW';
    }

    if (bucket.leaveRequests.length > 0 && !openRecord) {
      return 'ON_LEAVE';
    }

    if (openRecord && hasActiveBreak) {
      return 'ON_BREAK';
    }

    if (openRecord) {
      return hasLateSignal ? 'LATE' : 'CLOCKED_IN';
    }

    if (hasAbsenceSignal && !hasRecord) {
      return 'ABSENT';
    }

    if (bucket.exceptions.length > 0) {
      return hasLateSignal ? 'LATE' : 'EXCEPTION';
    }

    if (hasCompletedRecord) {
      return 'COMPLETED';
    }

    if (firstAssignment) {
      return firstAssignment.startsAt < now ? 'ABSENT' : 'SCHEDULED';
    }

    return hasRecord ? 'UNSCHEDULED' : 'SCHEDULED';
  }

  private payrollPeriodDates(dto: { periodStart: string; periodEnd: string }) {
    const periodStart = this.startOfDay(this.toDate(dto.periodStart));
    const periodEnd = this.endOfDay(this.toDate(dto.periodEnd));

    if (periodEnd <= periodStart) {
      throw new BadRequestException('Payroll period end must be after period start.');
    }

    return { periodStart, periodEnd };
  }

  private async findPayrollTimesheets(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    employeeId?: string,
  ) {
    const employeeScope = await this.employeeScopeWhere(actor);

    if (employeeId) {
      await this.assertCanOperateOnEmployee(actor, employeeId);
    }

    return this.prisma.attendanceTimesheet.findMany({
      where: {
        tenantId,
        periodStart,
        periodEnd,
        ...(employeeId ? { employeeId } : employeeScope),
      },
      orderBy: [{ employeeId: 'asc' }],
      include: this.timesheetInclude,
    });
  }

  private async buildPayrollExportSnapshot(
    tenantId: string,
    timesheets: AttendanceTimesheetWithRelations[],
    periodStart: Date,
    periodEnd: Date,
    client: AttendanceDataClient = this.prisma,
  ) {
    const [holidays, premiumRules] = await Promise.all([
      client.attendanceHoliday.findMany({
        where: {
          tenantId,
          status: AttendanceControlStatus.ACTIVE,
          deletedAt: null,
          date: { gte: periodStart, lte: periodEnd },
        },
      }),
      client.attendancePremiumRule.findMany({
        where: {
          tenantId,
          status: AttendanceControlStatus.ACTIVE,
          deletedAt: null,
          OR: [
            { effectiveFrom: null },
            { effectiveFrom: { lte: periodEnd } },
          ],
          AND: [
            {
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: periodStart } },
              ],
            },
          ],
        },
      }),
    ]);
    const rows: PayrollExportRow[] = timesheets.flatMap((timesheet) =>
      timesheet.entries.map((entry) => {
        const regularMinutes = Math.max(0, entry.payableMinutes - entry.overtimeMinutes);
        const premium = this.calculatePayrollPremium(entry, holidays, premiumRules);
        return {
          employeeId: timesheet.employeeId,
          employeeNumber: timesheet.employee.employeeNumber,
          employeeName: this.employeeDisplayName(timesheet.employee),
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          workDate: entry.workDate.toISOString(),
          timesheetId: timesheet.id,
          timesheetStatus: timesheet.status,
          entryId: entry.id,
          entryStatus: entry.status,
          attendanceRecordId: entry.attendanceRecordId,
          scheduleAssignmentId: entry.scheduleAssignmentId,
          shiftName: entry.scheduleAssignment?.shift?.name ?? '',
          organizationNode: entry.scheduleAssignment?.organizationNode?.name ?? '',
          costCenter: entry.scheduleAssignment?.costCenter?.code ?? entry.scheduleAssignment?.costCenter?.name ?? '',
          position: entry.scheduleAssignment?.position?.title ?? '',
          regularMinutes,
          overtimeMinutes: entry.overtimeMinutes,
          breakMinutes: entry.breakMinutes,
          payableMinutes: entry.payableMinutes,
          premiumMinutes: premium.minutes,
          premiumUnits: premium.units,
          premiumLabels: premium.labels.join('; '),
          exceptionCount: entry.exceptionCount,
        };
      }),
    );
    const employeeIds = new Set(timesheets.map((timesheet) => timesheet.employeeId));
    const totals = rows.reduce<PayrollExportTotals>(
      (acc, row) => ({
        employeeCount: employeeIds.size,
        timesheetCount: timesheets.length,
        rowCount: acc.rowCount + 1,
        regularMinutes: acc.regularMinutes + row.regularMinutes,
        overtimeMinutes: acc.overtimeMinutes + row.overtimeMinutes,
        breakMinutes: acc.breakMinutes + row.breakMinutes,
        grossPayableMinutes: acc.grossPayableMinutes + row.payableMinutes,
        premiumMinutes: acc.premiumMinutes + row.premiumMinutes,
        premiumUnits: acc.premiumUnits + row.premiumUnits,
        exceptionCount: acc.exceptionCount + row.exceptionCount,
      }),
      {
        employeeCount: employeeIds.size,
        timesheetCount: timesheets.length,
        rowCount: 0,
        regularMinutes: 0,
        overtimeMinutes: 0,
        breakMinutes: 0,
        grossPayableMinutes: 0,
        premiumMinutes: 0,
        premiumUnits: 0,
        exceptionCount: 0,
      },
    );

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      generatedAt: new Date().toISOString(),
      totals,
      rows,
    };
  }

  private calculatePayrollPremium(
    entry: AttendanceTimesheetWithRelations['entries'][number],
    holidays: AttendanceHolidayRow[],
    premiumRules: AttendancePremiumRuleRow[],
  ) {
    const labels: string[] = [];
    let minutes = 0;
    let units = 0;
    const workDate = this.startOfDay(entry.workDate);
    const addPremium = (label: string, premiumMinutes: number, multiplier: number) => {
      const roundedMinutes = Math.max(0, Math.min(entry.payableMinutes, Math.round(premiumMinutes)));
      if (roundedMinutes <= 0) {
        return;
      }
      minutes += roundedMinutes;
      units += Number((roundedMinutes * multiplier).toFixed(2));
      labels.push(`${label} x${multiplier}`);
    };

    for (const holiday of holidays) {
      if (holiday.paid && this.formatDate(holiday.date) === this.formatDate(workDate)) {
        addPremium(holiday.name, entry.payableMinutes, holiday.multiplier);
      }
    }

    for (const rule of premiumRules) {
      if (!this.premiumRuleAppliesToEntry(rule, entry)) {
        continue;
      }

      const ruleMinutes = this.premiumRuleMinutes(rule, entry);
      addPremium(rule.name, ruleMinutes, rule.multiplier);
    }

    return {
      minutes,
      units: Number(units.toFixed(2)),
      labels,
    };
  }

  private premiumRuleAppliesToEntry(rule: AttendancePremiumRuleRow, entry: AttendanceTimesheetWithRelations['entries'][number]) {
    const workDate = this.startOfDay(entry.workDate);
    const assignment = entry.scheduleAssignment;

    if (rule.effectiveFrom && workDate < this.startOfDay(rule.effectiveFrom)) {
      return false;
    }

    if (rule.effectiveTo && workDate > this.endOfDay(rule.effectiveTo)) {
      return false;
    }

    const weekday = workDate.getUTCDay();
    const weekdays = rule.weekdays.length > 0
      ? rule.weekdays
      : rule.type === AttendancePremiumRuleType.WEEKEND
        ? [0, 6]
        : [];

    if (weekdays.length > 0 && !weekdays.includes(weekday)) {
      return false;
    }

    if (rule.organizationNodeId && assignment?.organizationNodeId !== rule.organizationNodeId) {
      return false;
    }

    if (rule.costCenterId && assignment?.costCenterId !== rule.costCenterId) {
      return false;
    }

    if (rule.positionId && assignment?.positionId !== rule.positionId) {
      return false;
    }

    if (rule.locationName && assignment?.locationName !== rule.locationName) {
      return false;
    }

    return true;
  }

  private premiumRuleMinutes(rule: AttendancePremiumRuleRow, entry: AttendanceTimesheetWithRelations['entries'][number]) {
    const startsAtMinute = rule.startsAtMinute;
    const endsAtMinute = rule.endsAtMinute;
    const record = entry.attendanceRecord;

    if (
      startsAtMinute !== null &&
      startsAtMinute !== undefined &&
      endsAtMinute !== null &&
      endsAtMinute !== undefined &&
      record?.actualClockInAt &&
      record.actualClockOutAt
    ) {
      return Math.min(
        entry.payableMinutes,
        this.timeWindowOverlapMinutes(record.actualClockInAt, record.actualClockOutAt, startsAtMinute, endsAtMinute),
      );
    }

    return entry.payableMinutes;
  }

  private timeWindowOverlapMinutes(actualStart: Date, actualEnd: Date, startsAtMinute: number, endsAtMinute: number) {
    if (actualEnd <= actualStart) {
      return 0;
    }

    let total = 0;
    let day = this.addDays(this.startOfDay(actualStart), -1);
    const stop = this.addDays(this.startOfDay(actualEnd), 2);

    while (day <= stop) {
      const windowStart = this.addMinutes(day, startsAtMinute);
      const windowEnd = endsAtMinute > startsAtMinute
        ? this.addMinutes(day, endsAtMinute)
        : this.addMinutes(this.addDays(day, 1), endsAtMinute);
      const overlapStart = new Date(Math.max(actualStart.getTime(), windowStart.getTime()));
      const overlapEnd = new Date(Math.min(actualEnd.getTime(), windowEnd.getTime()));

      if (overlapEnd > overlapStart) {
        total += Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60000);
      }

      day = this.addDays(day, 1);
    }

    return total;
  }

  private payrollSnapshotToCsv(rows: PayrollExportRow[]) {
    const headers = [
      'employee_number',
      'employee_name',
      'employee_id',
      'period_start',
      'period_end',
      'work_date',
      'regular_minutes',
      'overtime_minutes',
      'break_minutes',
      'payable_minutes',
      'premium_minutes',
      'premium_units',
      'premium_labels',
      'exception_count',
      'timesheet_id',
      'timesheet_status',
      'entry_id',
      'entry_status',
      'attendance_record_id',
      'schedule_assignment_id',
      'shift_name',
      'organization_node',
      'cost_center',
      'position',
    ];
    const body = rows.map((row) => [
      row.employeeNumber,
      row.employeeName,
      row.employeeId,
      row.periodStart,
      row.periodEnd,
      row.workDate,
      row.regularMinutes,
      row.overtimeMinutes,
      row.breakMinutes,
      row.payableMinutes,
      row.premiumMinutes,
      row.premiumUnits,
      row.premiumLabels,
      row.exceptionCount,
      row.timesheetId,
      row.timesheetStatus,
      row.entryId,
      row.entryStatus,
      row.attendanceRecordId,
      row.scheduleAssignmentId,
      row.shiftName,
      row.organizationNode,
      row.costCenter,
      row.position,
    ]);

    return [headers, ...body].map((line) => line.map((cell) => this.csvCell(cell)).join(',')).join('\n');
  }

  private csvCell(value: unknown) {
    if (value === null || value === undefined) {
      return '';
    }

    const text = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : JSON.stringify(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private payrollFileName(prefix: string, periodStart: Date, periodEnd: Date, employeeId?: string) {
    const employeeSuffix = employeeId ? `-${employeeId.slice(0, 8)}` : '';
    return `${prefix}-${this.formatDate(periodStart)}-${this.formatDate(periodEnd)}${employeeSuffix}.csv`;
  }

  private employeeDisplayName(employee?: BoardEmployee | null) {
    if (!employee) {
      return '';
    }

    const firstName = employee.person?.preferredName || employee.person?.firstName;
    const lastName = employee.person?.lastName;
    return [firstName, lastName].filter(Boolean).join(' ') || employee.employeeNumber;
  }

  private statusCounts(statuses: string[]) {
    const counts = statuses.reduce<Record<string, number>>((acc, status) => {
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([status, count]) => `${status}: ${count}`).join(', ');
  }

  private recordsFilterWhere(query: ListAttendanceRecordsQueryDto) {
    const range = this.queryRange(query, 30);
    return {
      workDate: { gte: range.from, lte: range.to },
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.locationName ? { locationName: { contains: query.locationName, mode: Prisma.QueryMode.insensitive } } : {}),
      ...this.employeeSearchWhere(query),
      ...this.assignmentDimensionWhere(query),
    } satisfies Prisma.AttendanceRecordWhereInput;
  }

  private employeeSearchWhere(query: { employeeSearch?: string }) {
    const search = query.employeeSearch?.trim();
    if (!search) {
      return {};
    }

    return {
      employee: {
        OR: [
          { employeeNumber: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { person: { firstName: { contains: search, mode: Prisma.QueryMode.insensitive } } },
          { person: { lastName: { contains: search, mode: Prisma.QueryMode.insensitive } } },
          { person: { preferredName: { contains: search, mode: Prisma.QueryMode.insensitive } } },
        ],
      },
    };
  }

  private assignmentDimensionWhere(query: {
    organizationNodeId?: string;
    costCenterId?: string;
    positionId?: string;
  }) {
    if (!query.organizationNodeId && !query.costCenterId && !query.positionId) {
      return {};
    }

    return {
      scheduleAssignment: {
        ...(query.organizationNodeId ? { organizationNodeId: query.organizationNodeId } : {}),
        ...(query.costCenterId ? { costCenterId: query.costCenterId } : {}),
        ...(query.positionId ? { positionId: query.positionId } : {}),
      },
    };
  }

  private assignmentDirectDimensionWhere(query: {
    organizationNodeId?: string;
    costCenterId?: string;
    positionId?: string;
  }) {
    return {
      ...(query.organizationNodeId ? { organizationNodeId: query.organizationNodeId } : {}),
      ...(query.costCenterId ? { costCenterId: query.costCenterId } : {}),
      ...(query.positionId ? { positionId: query.positionId } : {}),
    } satisfies Prisma.ScheduleAssignmentWhereInput;
  }

  private queryRange(query: { from?: string; to?: string }, fallbackDays: number) {
    const now = new Date();
    const from = query.from ? this.startOfDay(this.toDate(query.from)) : this.addDays(this.startOfDay(now), -fallbackDays);
    const to = query.to ? this.endOfDay(this.toDate(query.to)) : this.endOfDay(this.addDays(now, fallbackDays));
    return { from, to };
  }

  private currentPrimaryAssignmentWhere(now: Date): Prisma.EmployeeAssignmentWhereInput {
    return {
      isPrimary: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    };
  }

  private reportingScopeWhere(managerEmployeeId: string): Prisma.EmployeeAssignmentWhereInput {
    return {
      OR: [
        { managerEmployeeId },
        { supervisorEmployeeId: managerEmployeeId },
        { unitHeadEmployeeId: managerEmployeeId },
      ],
    };
  }

  private paginate<T extends { id: string }>(items: T[], limit: number) {
    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    return {
      data,
      nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null,
    };
  }

  private limit(value?: number) {
    return Math.min(Math.max(value ?? 50, 1), 100);
  }

  private durationMinutes(startsAt: Date, endsAt: Date, breakMinutes: number) {
    return Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000) - breakMinutes);
  }

  private absoluteMinutes(left: Date, right: Date) {
    return Math.abs(Math.round((left.getTime() - right.getTime()) / 60000));
  }

  private roundMinutes(minutes: number, increment?: number | null) {
    if (!increment || increment <= 1) {
      return minutes;
    }
    return Math.round(minutes / increment) * increment;
  }

  private async evaluateAttendanceControls(
    client: AttendanceDataClient,
    tenantId: string,
    policy: AttendancePolicy,
    assignment: AttendanceAssignment | null,
    input: {
      employeeId: string;
      source: AttendanceSource;
      deviceId?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      locationName?: string | null;
    },
  ): Promise<AttendanceControlEvaluation> {
    const violations: AttendancePolicyViolation[] = [];
    const warnings: AttendancePolicyViolation[] = [];
    const addSignal = (
      severity: AttendancePolicyViolationSeverity,
      code: string,
      message: string,
      field?: string,
    ) => {
      const target = severity === 'BLOCK' ? violations : warnings;
      target.push({ severity, code, message, field });
    };
    const rawDeviceId = input.deviceId?.trim() || null;
    const device = rawDeviceId
      ? await client.attendanceClockDevice.findFirst({
          where: { tenantId, deviceId: rawDeviceId, deletedAt: null },
          include: { geofence: true },
        })
      : null;
    const activeDevice = device?.status === AttendanceControlStatus.ACTIVE ? device : null;
    const sourceRequiresKnownDevice = input.source === AttendanceSource.KIOSK || policy.requireKnownDevice;

    if (input.source === AttendanceSource.KIOSK && (!activeDevice || activeDevice.type !== AttendanceClockDeviceType.KIOSK)) {
      addSignal('BLOCK', 'KIOSK_DEVICE_REQUIRED', 'Kiosk punches must come from an active registered kiosk.', 'deviceId');
    } else if (sourceRequiresKnownDevice && !activeDevice) {
      addSignal('BLOCK', 'DEVICE_REQUIRED', 'This attendance policy requires a known active clock device.', 'deviceId');
    } else if (device && !activeDevice) {
      addSignal('WARN', 'DEVICE_INACTIVE', 'This punch came from a registered device that is not active.', 'deviceId');
    } else if (!device && rawDeviceId) {
      const severity: AttendancePolicyViolationSeverity = policy.requireKnownDevice ? 'BLOCK' : 'WARN';
      addSignal(severity, 'DEVICE_UNKNOWN', 'This punch came from an unregistered clock device.', 'deviceId');
    }

    if (activeDevice?.employeeId && activeDevice.employeeId !== input.employeeId) {
      addSignal('BLOCK', 'DEVICE_ASSIGNED_TO_OTHER_EMPLOYEE', 'This clock device is assigned to another employee.', 'deviceId');
    }

    const geofences = await this.resolveGeofenceCandidates(client, tenantId, assignment, activeDevice?.geofence ?? null);
    const hasCoordinates = typeof input.latitude === 'number' && typeof input.longitude === 'number';
    const geofenceRequired = policy.requireGeofenceForClockIn;
    let nearest: AttendanceGeofenceWithRelations | null = null;
    let distanceMeters: number | null = null;
    let insideGeofence: boolean | null = null;

    if (geofenceRequired && geofences.length === 0) {
      addSignal('BLOCK', 'GEOFENCE_REQUIRED', 'This attendance policy requires an active geofence for clock punches.', 'locationName');
    }

    if (geofenceRequired && geofences.length > 0 && !hasCoordinates && !activeDevice?.geofenceId) {
      addSignal('BLOCK', 'GEOFENCE_COORDINATES_REQUIRED', 'This attendance policy requires clock-in coordinates for geofence validation.', 'latitude');
    }

    if (geofences.length > 0 && hasCoordinates) {
      const ranked = geofences
        .map((geofence) => ({
          geofence,
          distanceMeters: this.distanceMeters(input.latitude!, input.longitude!, geofence.latitude, geofence.longitude),
        }))
        .sort((left, right) => left.distanceMeters - right.distanceMeters);
      nearest = ranked[0]?.geofence ?? null;
      distanceMeters = ranked[0] ? Math.round(ranked[0].distanceMeters) : null;
      const allowedRadius = nearest ? nearest.radiusMeters + policy.geofenceGraceMeters : 0;
      insideGeofence = distanceMeters !== null && distanceMeters <= allowedRadius;

      if (nearest && insideGeofence === false) {
        const severity: AttendancePolicyViolationSeverity = policy.blockOutsideGeofence ? 'BLOCK' : 'WARN';
        addSignal(
          severity,
          'OUTSIDE_GEOFENCE',
          `Punch is ${distanceMeters} meters from ${nearest.name}, outside the ${allowedRadius} meter allowed radius.`,
          'latitude',
        );
      }
    }

    return {
      deviceId: activeDevice?.deviceId ?? rawDeviceId,
      deviceName: activeDevice?.name ?? null,
      deviceType: activeDevice?.type ?? device?.type ?? null,
      geofenceId: nearest?.id ?? activeDevice?.geofenceId ?? null,
      geofenceName: nearest?.name ?? activeDevice?.geofence?.name ?? null,
      distanceMeters,
      insideGeofence,
      violations,
      warnings,
    };
  }

  private async resolveGeofenceCandidates(
    client: AttendanceDataClient,
    tenantId: string,
    assignment: AttendanceAssignment | null,
    deviceGeofence: AttendanceGeofenceWithRelations | AttendanceGeofence | null,
  ) {
    const byId = new Map<string, AttendanceGeofenceWithRelations>();
    const addGeofence = (geofence: AttendanceGeofenceWithRelations | AttendanceGeofence | null) => {
      if (!geofence || geofence.status !== AttendanceControlStatus.ACTIVE || geofence.deletedAt) {
        return;
      }
      byId.set(geofence.id, geofence as AttendanceGeofenceWithRelations);
    };

    addGeofence(deviceGeofence);

    const scoped = await client.attendanceGeofence.findMany({
      where: {
        tenantId,
        status: AttendanceControlStatus.ACTIVE,
        deletedAt: null,
        OR: [
          { organizationNodeId: null, costCenterId: null, positionId: null },
          ...(assignment?.organizationNodeId ? [{ organizationNodeId: assignment.organizationNodeId }] : []),
          ...(assignment?.costCenterId ? [{ costCenterId: assignment.costCenterId }] : []),
          ...(assignment?.positionId ? [{ positionId: assignment.positionId }] : []),
          ...(assignment?.locationName ? [{ locationName: { equals: assignment.locationName, mode: Prisma.QueryMode.insensitive } }] : []),
        ],
      },
      include: this.geofenceInclude,
    });
    for (const geofence of scoped) {
      addGeofence(geofence);
    }

    return [...byId.values()];
  }

  private async syncControlExceptions(
    record: AttendanceRecordWithRelations,
    punch: { id: string; occurredAt: Date },
    controlEvaluation: AttendanceControlEvaluation,
    client: AttendanceDataClient = this.prisma,
  ) {
    const warningCodes = new Set(controlEvaluation.warnings.map((warning) => warning.code));

    if (warningCodes.has('OUTSIDE_GEOFENCE')) {
      await this.upsertException({
        tenantId: record.tenantId,
        employeeId: record.employeeId,
        attendanceRecordId: record.id,
        scheduleAssignmentId: record.scheduleAssignmentId,
        type: AttendanceExceptionType.OUTSIDE_GEOFENCE,
        occurredAt: punch.occurredAt,
        title: 'Outside geofence',
        description: controlEvaluation.geofenceName
          ? `Punch was outside ${controlEvaluation.geofenceName}.`
          : 'Punch was outside an approved attendance geofence.',
        severity: 'HIGH',
        metadata: {
          punchId: punch.id,
          controlEvaluation,
        },
      }, client);
    }

    if (warningCodes.has('DEVICE_UNKNOWN') || warningCodes.has('DEVICE_INACTIVE')) {
      await this.upsertException({
        tenantId: record.tenantId,
        employeeId: record.employeeId,
        attendanceRecordId: record.id,
        scheduleAssignmentId: record.scheduleAssignmentId,
        type: AttendanceExceptionType.UNAPPROVED_LOCATION,
        occurredAt: punch.occurredAt,
        title: 'Unapproved clock device',
        description: 'Punch was recorded from a device that is not approved for attendance.',
        severity: 'MEDIUM',
        metadata: {
          punchId: punch.id,
          controlEvaluation,
        },
      }, client);
    }
  }

  private evaluateAttendancePolicy(input: {
    operation: AttendancePolicyOperation;
    policy: AttendancePolicy;
    source?: AttendanceSource;
    punchType?: AttendancePunchType;
    assignment?: AttendanceAssignment | null;
    workDate?: Date;
    locationName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    actualClockInAt?: Date | null;
    actualClockOutAt?: Date | null;
    breakMinutes?: number | null;
    photoAttestationUrl?: string | null;
    attestationNote?: string | null;
    isExistingRecord?: boolean;
    controlEvaluation?: AttendanceControlEvaluation | null;
  }): AttendancePolicyEvaluation {
    const violations: AttendancePolicyViolation[] = [];
    const warnings: AttendancePolicyViolation[] = [];
    const source = input.source ?? AttendanceSource.WEB;
    const manualOperation = [
      'MANUAL_RECORD',
      'CORRECTION_REQUEST',
      'CORRECTION_APPLY',
    ].includes(input.operation);
    const addViolation = (
      severity: AttendancePolicyViolationSeverity,
      code: string,
      message: string,
      field?: string,
    ) => {
      const target = severity === 'BLOCK' ? violations : warnings;
      target.push({ severity, code, message, field });
    };

    if (source === AttendanceSource.WEB && !input.policy.allowWebClockIn) {
      addViolation('BLOCK', 'WEB_CLOCK_DISABLED', 'Web clock-in is disabled by the active attendance policy.', 'source');
    }

    if (source === AttendanceSource.MOBILE && !input.policy.allowMobileClockIn) {
      addViolation('BLOCK', 'MOBILE_CLOCK_DISABLED', 'Mobile clock-in is disabled by the active attendance policy.', 'source');
    }

    if (source === AttendanceSource.KIOSK && !input.policy.allowKioskClockIn) {
      addViolation('BLOCK', 'KIOSK_CLOCK_DISABLED', 'Kiosk clock-in is disabled by the active attendance policy.', 'source');
    }

    if (manualOperation && !input.policy.allowManualAdjustments) {
      addViolation('BLOCK', 'MANUAL_ADJUSTMENTS_DISABLED', 'Manual attendance adjustments are disabled by the active attendance policy.', 'source');
    }

    if (!manualOperation && input.policy.requirePhotoAttestation && !input.photoAttestationUrl?.trim()) {
      addViolation('BLOCK', 'PHOTO_ATTESTATION_REQUIRED', 'Photo attestation is required by the active attendance policy.', 'photoAttestationUrl');
    }

    if (!manualOperation && input.policy.requireAttestationNote && !input.attestationNote?.trim()) {
      addViolation('BLOCK', 'ATTESTATION_NOTE_REQUIRED', 'An attestation note is required by the active attendance policy.', 'attestationNote');
    }

    if (
      input.policy.requireScheduleForClockIn &&
      !input.assignment &&
      (input.punchType === AttendancePunchType.CLOCK_IN || manualOperation)
    ) {
      addViolation('BLOCK', 'SCHEDULE_REQUIRED', 'A planned shift is required before attendance can be recorded.', 'scheduleAssignmentId');
    }

    if (input.policy.requireLocationCapture) {
      const hasCoordinates = typeof input.latitude === 'number' && typeof input.longitude === 'number';
      const hasLocationName = Boolean(input.locationName?.trim());
      if (!hasCoordinates && !hasLocationName) {
        addViolation('BLOCK', 'LOCATION_REQUIRED', 'Location capture is required by the active attendance policy.', 'locationName');
      }
    }

    if (input.controlEvaluation) {
      violations.push(...input.controlEvaluation.violations);
      warnings.push(...input.controlEvaluation.warnings);
    }

    if (input.actualClockInAt && input.actualClockOutAt && input.actualClockOutAt <= input.actualClockInAt) {
      addViolation('BLOCK', 'INVALID_CLOCK_RANGE', 'Clock-out time must be after clock-in time.', 'actualClockOutAt');
    }

    const nowWithTolerance = this.addMinutes(new Date(), 15);
    if (input.actualClockInAt && input.actualClockInAt > nowWithTolerance) {
      addViolation('BLOCK', 'FUTURE_CLOCK_IN', 'Clock-in time cannot be in the future.', 'actualClockInAt');
    }

    if (input.actualClockOutAt && input.actualClockOutAt > nowWithTolerance) {
      addViolation('BLOCK', 'FUTURE_CLOCK_OUT', 'Clock-out time cannot be in the future.', 'actualClockOutAt');
    }

    if (input.actualClockInAt && input.actualClockOutAt) {
      const rawShiftMinutes = this.durationMinutes(input.actualClockInAt, input.actualClockOutAt, 0);
      if (rawShiftMinutes > input.policy.maxShiftMinutes) {
        addViolation(
          'BLOCK',
          'MAX_SHIFT_EXCEEDED',
          `Recorded work exceeds the ${input.policy.maxShiftMinutes} minute maximum shift policy.`,
          'actualClockOutAt',
        );
      }

      const requiredBreakAfter = input.policy.breakRequiredAfterMinutes;
      const requiredBreak = input.policy.breakDurationMinutes ?? 0;
      if (requiredBreakAfter && requiredBreak > 0 && rawShiftMinutes >= requiredBreakAfter && (input.breakMinutes ?? 0) < requiredBreak) {
        addViolation(
          'WARN',
          'BREAK_REQUIREMENT_NOT_MET',
          `Policy expects at least ${requiredBreak} break minutes after ${requiredBreakAfter} minutes worked.`,
          'breakMinutes',
        );
      }
    }

    return {
      operation: input.operation,
      policyId: input.policy.id,
      accepted: violations.length === 0,
      violations,
      warnings,
    };
  }

  private enforceAttendancePolicy(evaluation: AttendancePolicyEvaluation) {
    if (evaluation.violations.length === 0) {
      return;
    }

    throw new BadRequestException(`Attendance policy violation: ${evaluation.violations.map((item) => item.message).join(' ')}`);
  }

  private async writeTimeline(
    client: AttendanceDataClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
    type: TimelineEventType,
    event: {
      title: string;
      description?: string | null;
      entityType: string;
      entityId: string;
      data?: Record<string, unknown>;
    },
  ) {
    await client.timelineEvent.create({
      data: {
        tenantId,
        employeeId,
        actorUserId: actor.id,
        type,
        title: event.title,
        description: event.description,
        entityType: event.entityType,
        entityId: event.entityId,
        data: this.toJson(event.data),
      },
    });
  }

  private async createAttendanceNotification(
    client: AttendanceDataClient,
    tenantId: string,
    employeeId: string,
    notification: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
    },
  ) {
    const employee = await client.employee.findFirst({
      where: { tenantId, id: employeeId, deletedAt: null },
      select: { id: true, userId: true },
    });

    const created = await client.notification.create({
      data: {
        tenantId,
        channel: NotificationChannel.IN_APP,
        title: notification.title,
        body: notification.body,
        status: NotificationStatus.PENDING,
        data: this.toJson({
          module: 'attendance',
          ...notification.data,
        }),
        recipients: {
          create: [{
            userId: employee?.userId ?? null,
            employeeId,
            status: NotificationStatus.PENDING,
          }],
        },
      },
      include: { recipients: true },
    });

    await this.writeOutbox(client, tenantId, 'notification.created', 'Notification', created.id, {
      notificationId: created.id,
      channel: created.channel,
      module: 'attendance',
      employeeId,
    });
    await this.writeOutbox(client, tenantId, 'notification.delivery.requested', 'Notification', created.id, {
      notificationId: created.id,
      channel: created.channel,
      deliverAfter: new Date().toISOString(),
    });

    return created;
  }

  private async writeAudit(
    client: AttendanceDataClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
    metadata?: Record<string, unknown>,
  ) {
    await client.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.id,
        action,
        module: 'attendance',
        entityType,
        entityId,
        before: this.toJson(before),
        after: this.toJson(after),
        metadata: this.toJson(metadata),
      },
    });
  }

  private async writeOutbox(
    client: AttendanceDataClient,
    tenantId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) {
    await client.outboxMessage.create({
      data: {
        tenantId,
        eventType,
        aggregateType,
        aggregateId,
        payload: this.toJson(payload)!,
      },
    });
  }

  private auditActionForExceptionDecision(status: AttendanceExceptionStatus) {
    if (status === AttendanceExceptionStatus.APPROVED) {
      return AuditAction.APPROVE;
    }

    if (status === AttendanceExceptionStatus.REJECTED) {
      return AuditAction.REJECT;
    }

    return AuditAction.UPDATE;
  }

  private auditActionForTimesheetDecision(status: AttendanceTimesheetStatus) {
    if (status === AttendanceTimesheetStatus.APPROVED || status === AttendanceTimesheetStatus.LOCKED) {
      return AuditAction.APPROVE;
    }

    if (status === AttendanceTimesheetStatus.REJECTED) {
      return AuditAction.REJECT;
    }

    return AuditAction.UPDATE;
  }

  private timelineTypeForTimesheetDecision(status: AttendanceTimesheetStatus) {
    if (status === AttendanceTimesheetStatus.APPROVED || status === AttendanceTimesheetStatus.LOCKED) {
      return TimelineEventType.TIMESHEET_APPROVED;
    }

    if (status === AttendanceTimesheetStatus.REJECTED) {
      return TimelineEventType.TIMESHEET_REJECTED;
    }

    if (status === AttendanceTimesheetStatus.REOPENED) {
      return TimelineEventType.TIMESHEET_REOPENED;
    }

    return TimelineEventType.SYSTEM;
  }

  private punchTitle(type: AttendancePunchType) {
    switch (type) {
      case AttendancePunchType.CLOCK_IN:
        return 'Clocked in';
      case AttendancePunchType.CLOCK_OUT:
        return 'Clocked out';
      case AttendancePunchType.BREAK_START:
        return 'Break started';
      case AttendancePunchType.BREAK_END:
        return 'Break ended';
      default:
        return 'Attendance punch recorded';
    }
  }

  private punchDescription(type: AttendancePunchType, occurredAt: Date) {
    return `${this.punchTitle(type)} at ${occurredAt.toISOString()}`;
  }

  private humanizeEnum(value: string) {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private countBy(values: string[]) {
    const counts = values.reduce<Record<string, number>>((acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  }

  private distanceMeters(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) {
    const radiusMeters = 6371000;
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const deltaLatitude = toRadians(toLatitude - fromLatitude);
    const deltaLongitude = toRadians(toLongitude - fromLongitude);
    const fromLat = toRadians(fromLatitude);
    const toLat = toRadians(toLatitude);
    const a =
      Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
      Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);
    return 2 * radiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private textOrUndefined(value?: string | null) {
    const text = value?.trim();
    return text || undefined;
  }

  private textOrNullForUpdate(value?: string | null) {
    if (value === undefined) {
      return undefined;
    }
    const text = value?.trim();
    return text || null;
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private jsonRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private jsonRecordArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  }

  private toDate(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date value.');
    }
    return date;
  }

  private startOfDay(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private endOfDay(value: Date) {
    const date = this.startOfDay(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private startOfWeek(value: Date) {
    const date = this.startOfDay(value);
    const day = date.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + diff);
    return date;
  }

  private addDays(value: Date, days: number) {
    const date = new Date(value);
    date.setUTCDate(date.getUTCDate() + days);
    return date;
  }

  private addHours(value: Date, hours: number) {
    const date = new Date(value);
    date.setUTCHours(date.getUTCHours() + hours);
    return date;
  }

  private addMinutes(value: Date, minutes: number) {
    const date = new Date(value);
    date.setUTCMinutes(date.getUTCMinutes() + minutes);
    return date;
  }

  private minDate(values: Array<Date | null | undefined>) {
    const dates = values.filter((value): value is Date => Boolean(value));
    if (dates.length === 0) {
      return null;
    }
    return new Date(Math.min(...dates.map((value) => value.getTime())));
  }

  private maxDate(values: Array<Date | null | undefined>) {
    const dates = values.filter((value): value is Date => Boolean(value));
    if (dates.length === 0) {
      return null;
    }
    return new Date(Math.max(...dates.map((value) => value.getTime())));
  }

  private requireTenant(actor: AuthenticatedPrincipal) {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant workspace is required for attendance.');
    }
    return actor.tenantId;
  }

  private readonly assignmentInclude = assignmentInclude;
  private readonly recordInclude = recordInclude;
  private readonly exceptionInclude = exceptionInclude;
  private readonly timesheetInclude = timesheetInclude;
  private readonly correctionRequestInclude = correctionRequestInclude;
  private readonly payrollExportInclude = payrollExportInclude;
  private readonly geofenceInclude = geofenceInclude;
  private readonly clockDeviceInclude = clockDeviceInclude;
  private readonly kioskCredentialSelect = kioskCredentialSelect;
}
