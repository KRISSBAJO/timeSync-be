import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalRequestStatus,
  AuditAction,
  LeaveBlackoutSeverity,
  LeaveCalendarDayType,
  LeaveLedgerEntryType,
  LeavePolicyStatus,
  LeaveRequestStatus,
  ScheduleAssignmentStatus,
  ScheduleCoverageRuleStatus,
  TimelineEventType,
  WorkflowStatus,
  type LeaveRequest,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { ApprovalActionDto } from '../workflows/dto/approval-action.dto';
import { SubmitApprovalRequestDto } from '../workflows/dto/submit-approval-request.dto';
import { ApprovalsService } from '../workflows/approvals.service';
import {
  AdjustLeaveBalanceDto,
  CreateLeaveBlackoutWindowDto,
  CreateLeaveCalendarDayDto,
  CreateLeaveCalendarDto,
  CreateLeaveApprovalRuleDto,
  CreateLeavePolicyDto,
  CreateLeaveRequestDto,
  CreateLeaveTypeDto,
  DecideLeaveRequestDto,
  ListLeaveQueryDto,
  UpdateLeaveBlackoutWindowDto,
  UpdateLeaveCalendarDayDto,
  UpdateLeaveCalendarDto,
  UpdateLeaveApprovalRuleDto,
  UpdateLeavePolicyDto,
  UpdateLeaveTypeDto,
} from './dto/leave.dto';

type EmployeeScope = { employeeId?: string | { in: string[] } };

type LeaveAssignmentContext = {
  organizationNodeId: string | null;
  costCenterId: string | null;
  positionId: string | null;
};

type LeaveCoverageRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

type CalendarDaySnapshot = {
  date: string;
  weekday: number;
  name: string | null;
  type: string;
  isWorkingDay: boolean;
  workdayMinutes: number;
  requestedOverlapMinutes: number;
  countedMinutes: number;
};

type CoverageDaySnapshot = {
  date: string;
  weekday: number;
  scheduledHeadcount: number;
  approvedLeaveCount: number;
  pendingLeaveCount: number;
  requestedEmployeeScheduled: boolean;
  minimumHeadcount: number;
  projectedHeadcount: number;
  ruleCount: number;
  riskLevel: LeaveCoverageRiskLevel;
};

type LeaveCalendarWithRelations = Prisma.LeaveCalendarGetPayload<{
  include: {
    days: true;
    blackoutWindows: { include: { leaveType: true } };
  };
}>;

type ApprovalRoute = {
  workflowId?: string;
  workflowCode?: string;
  triggerKey?: string;
  source: string;
};

const TERMINAL_LEAVE_STATUSES: LeaveRequestStatus[] = [
  LeaveRequestStatus.REJECTED,
  LeaveRequestStatus.CANCELLED,
  LeaveRequestStatus.WITHDRAWN,
  LeaveRequestStatus.REVERSED,
];

const ACTIVE_LEAVE_STATUSES: LeaveRequestStatus[] = [
  LeaveRequestStatus.SUBMITTED,
  LeaveRequestStatus.PENDING_APPROVAL,
  LeaveRequestStatus.APPROVED,
  LeaveRequestStatus.TAKEN,
];

const TERMINAL_ASSIGNMENT_STATUSES: ScheduleAssignmentStatus[] = [
  ScheduleAssignmentStatus.CANCELLED,
  ScheduleAssignmentStatus.DECLINED,
  ScheduleAssignmentStatus.NO_SHOW,
];

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  async getSummary(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const scope = await this.employeeScopeWhere(actor);
    const now = new Date();
    const nextThirty = this.addDays(now, 30);

    const [pendingRequests, approvedUpcoming, activeTypes, balances] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: {
          tenantId,
          ...scope,
          status: LeaveRequestStatus.PENDING_APPROVAL,
        },
      }),
      this.prisma.leaveRequest.count({
        where: {
          tenantId,
          ...scope,
          status: LeaveRequestStatus.APPROVED,
          startAt: { gte: now, lte: nextThirty },
        },
      }),
      this.prisma.leaveType.count({
        where: { tenantId, status: LeavePolicyStatus.ACTIVE, deletedAt: null },
      }),
      this.prisma.leaveBalance.findMany({
        where: { tenantId, ...scope },
        take: 8,
        orderBy: [{ updatedAt: 'desc' }],
        include: this.balanceInclude,
      }),
    ]);

    return {
      generatedAt: now,
      metrics: {
        pendingRequests,
        approvedUpcoming,
        activeTypes,
        balanceRows: balances.length,
      },
      balances,
      permissions: {
        selfLeave: actor.permissions.includes('leave.self'),
        teamLeave: actor.permissions.includes('leave.team.read') || actor.permissions.includes('leave.team.write'),
        manageLeave: actor.permissions.includes('leave.team.write'),
        approveLeave: actor.permissions.includes('leave.approve'),
        managePolicies: actor.permissions.includes('leave.policy.write'),
        readReports: actor.permissions.includes('leave.reports.read'),
      },
    };
  }

  async getMyLeave(actor: AuthenticatedPrincipal, query: ListLeaveQueryDto) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.requireSelfEmployee(actor);
    const range = this.queryRange(query, 90);

    const [balances, requests] = await Promise.all([
      this.prisma.leaveBalance.findMany({
        where: { tenantId, employeeId: employee.id },
        orderBy: [{ leaveType: { name: 'asc' } }],
        include: this.balanceInclude,
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          tenantId,
          employeeId: employee.id,
          startAt: { lte: range.to },
          endAt: { gte: range.from },
          deletedAt: null,
        },
        take: query.limit ?? 30,
        orderBy: [{ startAt: 'desc' }],
        include: this.requestInclude,
      }),
    ]);

    return { employee, balances, requests };
  }

  async listRequests(actor: AuthenticatedPrincipal, query: ListLeaveQueryDto) {
    const tenantId = this.requireTenant(actor);
    const scope = await this.employeeScopeWhere(actor);
    const range = this.queryRange(query, 90);
    const limit = query.limit ?? 50;
    const employeeIdFilter = this.employeeIdWhere(scope, query.employeeId);

    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId: employeeIdFilter,
        leaveTypeId: query.leaveTypeId,
        status: query.status,
        startAt: { lte: range.to },
        endAt: { gte: range.from },
        deletedAt: null,
        employee: query.employeeSearch
          ? {
              OR: [
                { employeeNumber: { contains: query.employeeSearch, mode: 'insensitive' } },
                { person: { firstName: { contains: query.employeeSearch, mode: 'insensitive' } } },
                { person: { lastName: { contains: query.employeeSearch, mode: 'insensitive' } } },
              ],
            }
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.requestInclude,
    });

    return this.paginate(requests, limit);
  }

  async listBalances(actor: AuthenticatedPrincipal, query: ListLeaveQueryDto) {
    const tenantId = this.requireTenant(actor);
    const scope = await this.employeeScopeWhere(actor);
    const limit = query.limit ?? 50;
    const employeeIdFilter = this.employeeIdWhere(scope, query.employeeId);

    const balances = await this.prisma.leaveBalance.findMany({
      where: {
        tenantId,
        employeeId: employeeIdFilter,
        leaveTypeId: query.leaveTypeId,
        employee: query.employeeSearch
          ? {
              OR: [
                { employeeNumber: { contains: query.employeeSearch, mode: 'insensitive' } },
                { person: { firstName: { contains: query.employeeSearch, mode: 'insensitive' } } },
                { person: { lastName: { contains: query.employeeSearch, mode: 'insensitive' } } },
              ],
            }
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ employee: { employeeNumber: 'asc' } }, { leaveType: { name: 'asc' } }],
      include: this.balanceInclude,
    });

    return this.paginate(balances, limit);
  }

  async listTypes(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.leaveType.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async createType(actor: AuthenticatedPrincipal, dto: CreateLeaveTypeDto) {
    const tenantId = this.requireTenant(actor);
    const type = await this.prisma.leaveType.create({
      data: {
        tenantId,
        code: this.normalizeCode(dto.code),
        name: dto.name.trim(),
        description: dto.description,
        category: dto.category?.trim().toUpperCase() ?? 'PTO',
        unit: dto.unit,
        status: dto.status ?? LeavePolicyStatus.ACTIVE,
        paid: dto.paid ?? true,
        requiresDocumentation: dto.requiresDocumentation ?? false,
        color: dto.color,
        metadata: this.toJson(dto.metadata),
      },
    });

    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'LeaveType', type.id, null, {
      code: type.code,
      name: type.name,
    });

    return type;
  }

  async updateType(actor: AuthenticatedPrincipal, typeId: string, dto: UpdateLeaveTypeDto) {
    const tenantId = this.requireTenant(actor);
    const existing = await this.findTypeOrThrow(this.prisma, tenantId, typeId);
    const updated = await this.prisma.leaveType.update({
      where: { id: existing.id },
      data: {
        code: dto.code ? this.normalizeCode(dto.code) : undefined,
        name: dto.name?.trim(),
        description: dto.description,
        category: dto.category?.trim().toUpperCase(),
        unit: dto.unit,
        status: dto.status,
        paid: dto.paid,
        requiresDocumentation: dto.requiresDocumentation,
        color: dto.color,
        metadata: this.toJson(dto.metadata),
      },
    });

    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'LeaveType', updated.id, this.typeState(existing), this.typeState(updated));
    return updated;
  }

  async listPolicies(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.leavePolicy.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: { leaveType: true },
    });
  }

  async createPolicy(actor: AuthenticatedPrincipal, dto: CreateLeavePolicyDto) {
    const tenantId = this.requireTenant(actor);
    await this.findTypeOrThrow(this.prisma, tenantId, dto.leaveTypeId);

    const policy = await this.prisma.leavePolicy.create({
      data: this.policyData(tenantId, dto),
      include: { leaveType: true },
    });

    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'LeavePolicy', policy.id, null, this.policyState(policy));
    return policy;
  }

  async updatePolicy(actor: AuthenticatedPrincipal, policyId: string, dto: UpdateLeavePolicyDto) {
    const tenantId = this.requireTenant(actor);
    const existing = await this.findPolicyOrThrow(this.prisma, tenantId, policyId);
    if (dto.leaveTypeId) {
      await this.findTypeOrThrow(this.prisma, tenantId, dto.leaveTypeId);
    }

    const updated = await this.prisma.leavePolicy.update({
      where: { id: existing.id },
      data: this.policyUpdateData(dto),
      include: { leaveType: true },
    });

    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'LeavePolicy', updated.id, this.policyState(existing), this.policyState(updated));
    return updated;
  }

  async listApprovalRules(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.leaveApprovalRule.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: {
        leaveType: true,
        policy: true,
        workflow: { select: { id: true, code: true, name: true, status: true, module: true, triggerKey: true } },
      },
    });
  }

  async listCalendars(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.leaveCalendar.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { status: 'asc' }, { name: 'asc' }],
      include: this.calendarInclude,
    });
  }

  async createCalendar(actor: AuthenticatedPrincipal, dto: CreateLeaveCalendarDto) {
    const tenantId = this.requireTenant(actor);
    if (dto.isDefault) {
      await this.prisma.leaveCalendar.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const calendar = await this.prisma.leaveCalendar.create({
      data: {
        tenantId,
        code: this.normalizeCode(dto.code),
        name: dto.name.trim(),
        description: dto.description,
        timezone: dto.timezone,
        status: dto.status ?? LeavePolicyStatus.ACTIVE,
        isDefault: dto.isDefault ?? false,
        workWeekdays: dto.workWeekdays ?? [1, 2, 3, 4, 5],
        defaultWorkdayMinutes: dto.defaultWorkdayMinutes ?? 480,
        organizationNodeId: dto.organizationNodeId,
        costCenterId: dto.costCenterId,
        positionId: dto.positionId,
        countryCode: dto.countryCode?.trim().toUpperCase(),
        regionCode: dto.regionCode?.trim().toUpperCase(),
        metadata: this.toJson(dto.metadata),
      },
      include: this.calendarInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'LeaveCalendar', calendar.id, null, this.calendarState(calendar)),
      this.enqueueOutbox(this.prisma, tenantId, 'leave.calendar.created', 'LeaveCalendar', calendar.id, this.calendarState(calendar)),
    ]);

    return calendar;
  }

  async updateCalendar(actor: AuthenticatedPrincipal, calendarId: string, dto: UpdateLeaveCalendarDto) {
    const tenantId = this.requireTenant(actor);
    const existing = await this.findCalendarOrThrow(this.prisma, tenantId, calendarId);
    if (dto.isDefault) {
      await this.prisma.leaveCalendar.updateMany({
        where: { tenantId, isDefault: true, id: { not: existing.id } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.leaveCalendar.update({
      where: { id: existing.id },
      data: {
        code: dto.code ? this.normalizeCode(dto.code) : undefined,
        name: dto.name?.trim(),
        description: dto.description,
        timezone: dto.timezone,
        status: dto.status,
        isDefault: dto.isDefault,
        workWeekdays: dto.workWeekdays,
        defaultWorkdayMinutes: dto.defaultWorkdayMinutes,
        organizationNodeId: dto.organizationNodeId,
        costCenterId: dto.costCenterId,
        positionId: dto.positionId,
        countryCode: dto.countryCode?.trim().toUpperCase(),
        regionCode: dto.regionCode?.trim().toUpperCase(),
        metadata: this.toJson(dto.metadata),
      },
      include: this.calendarInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'LeaveCalendar', updated.id, this.calendarState(existing), this.calendarState(updated)),
      this.enqueueOutbox(this.prisma, tenantId, 'leave.calendar.updated', 'LeaveCalendar', updated.id, this.calendarState(updated)),
    ]);

    return updated;
  }

  async listCalendarDays(actor: AuthenticatedPrincipal, query: ListLeaveQueryDto) {
    const tenantId = this.requireTenant(actor);
    const range = this.queryRange(query, 365);
    return this.prisma.leaveCalendarDay.findMany({
      where: {
        tenantId,
        calendarId: query.calendarId,
        date: { gte: range.from, lte: range.to },
      },
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
      include: { calendar: true },
    });
  }

  async createCalendarDay(actor: AuthenticatedPrincipal, dto: CreateLeaveCalendarDayDto) {
    const tenantId = this.requireTenant(actor);
    const calendar = await this.findCalendarOrThrow(this.prisma, tenantId, dto.calendarId);
    const day = await this.prisma.leaveCalendarDay.upsert({
      where: { calendarId_date: { calendarId: calendar.id, date: this.startOfDay(this.toDate(dto.date)) } },
      create: {
        tenantId,
        calendarId: calendar.id,
        date: this.startOfDay(this.toDate(dto.date)),
        name: dto.name.trim(),
        type: dto.type ?? LeaveCalendarDayType.HOLIDAY,
        paid: dto.paid ?? true,
        workdayMinutes: dto.workdayMinutes,
        metadata: this.toJson(dto.metadata),
      },
      update: {
        name: dto.name.trim(),
        type: dto.type ?? LeaveCalendarDayType.HOLIDAY,
        paid: dto.paid ?? true,
        workdayMinutes: dto.workdayMinutes,
        metadata: this.toJson(dto.metadata),
      },
      include: { calendar: true },
    });

    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'LeaveCalendarDay', day.id, null, {
      calendarId: calendar.id,
      date: day.date.toISOString(),
      type: day.type,
    });

    return day;
  }

  async updateCalendarDay(actor: AuthenticatedPrincipal, dayId: string, dto: UpdateLeaveCalendarDayDto) {
    const tenantId = this.requireTenant(actor);
    const existing = await this.prisma.leaveCalendarDay.findFirst({ where: { id: dayId, tenantId } });
    if (!existing) {
      throw new NotFoundException('Leave calendar day not found.');
    }
    if (dto.calendarId) {
      await this.findCalendarOrThrow(this.prisma, tenantId, dto.calendarId);
    }

    const updated = await this.prisma.leaveCalendarDay.update({
      where: { id: existing.id },
      data: {
        calendarId: dto.calendarId,
        date: dto.date ? this.startOfDay(this.toDate(dto.date)) : undefined,
        name: dto.name?.trim(),
        type: dto.type,
        paid: dto.paid,
        workdayMinutes: dto.workdayMinutes,
        metadata: this.toJson(dto.metadata),
      },
      include: { calendar: true },
    });

    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'LeaveCalendarDay', updated.id, {
      calendarId: existing.calendarId,
      date: existing.date.toISOString(),
      type: existing.type,
    }, {
      calendarId: updated.calendarId,
      date: updated.date.toISOString(),
      type: updated.type,
    });

    return updated;
  }

  async listBlackoutWindows(actor: AuthenticatedPrincipal, query: ListLeaveQueryDto) {
    const tenantId = this.requireTenant(actor);
    const range = this.queryRange(query, 365);
    return this.prisma.leaveBlackoutWindow.findMany({
      where: {
        tenantId,
        deletedAt: null,
        calendarId: query.calendarId,
        leaveTypeId: query.leaveTypeId,
        startsAt: { lte: range.to },
        endsAt: { gte: range.from },
      },
      orderBy: [{ startsAt: 'asc' }, { severity: 'desc' }, { name: 'asc' }],
      include: this.blackoutInclude,
    });
  }

  async createBlackoutWindow(actor: AuthenticatedPrincipal, dto: CreateLeaveBlackoutWindowDto) {
    const tenantId = this.requireTenant(actor);
    await this.validateBlackoutReferences(tenantId, dto);
    const startsAt = this.toDate(dto.startsAt);
    const endsAt = this.toDate(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('Blackout end must be after start.');
    }

    const blackout = await this.prisma.leaveBlackoutWindow.create({
      data: {
        tenantId,
        code: this.normalizeCode(dto.code),
        name: dto.name.trim(),
        description: dto.description,
        startsAt,
        endsAt,
        severity: dto.severity ?? LeaveBlackoutSeverity.BLOCK,
        calendarId: dto.calendarId,
        leaveTypeId: dto.leaveTypeId,
        organizationNodeId: dto.organizationNodeId,
        costCenterId: dto.costCenterId,
        positionId: dto.positionId,
        status: dto.status ?? LeavePolicyStatus.ACTIVE,
        metadata: this.toJson(dto.metadata),
      },
      include: this.blackoutInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'LeaveBlackoutWindow', blackout.id, null, this.blackoutState(blackout)),
      this.enqueueOutbox(this.prisma, tenantId, 'leave.blackout.created', 'LeaveBlackoutWindow', blackout.id, this.blackoutState(blackout)),
    ]);

    return blackout;
  }

  async updateBlackoutWindow(actor: AuthenticatedPrincipal, blackoutId: string, dto: UpdateLeaveBlackoutWindowDto) {
    const tenantId = this.requireTenant(actor);
    const existing = await this.prisma.leaveBlackoutWindow.findFirst({ where: { id: blackoutId, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException('Leave blackout window not found.');
    }
    await this.validateBlackoutReferences(tenantId, dto);
    const startsAt = dto.startsAt ? this.toDate(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? this.toDate(dto.endsAt) : existing.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException('Blackout end must be after start.');
    }

    const updated = await this.prisma.leaveBlackoutWindow.update({
      where: { id: existing.id },
      data: {
        code: dto.code ? this.normalizeCode(dto.code) : undefined,
        name: dto.name?.trim(),
        description: dto.description,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        severity: dto.severity,
        calendarId: dto.calendarId,
        leaveTypeId: dto.leaveTypeId,
        organizationNodeId: dto.organizationNodeId,
        costCenterId: dto.costCenterId,
        positionId: dto.positionId,
        status: dto.status,
        metadata: this.toJson(dto.metadata),
      },
      include: this.blackoutInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'LeaveBlackoutWindow', updated.id, this.blackoutState(existing), this.blackoutState(updated)),
      this.enqueueOutbox(this.prisma, tenantId, 'leave.blackout.updated', 'LeaveBlackoutWindow', updated.id, this.blackoutState(updated)),
    ]);

    return updated;
  }

  async getCalendarView(actor: AuthenticatedPrincipal, query: ListLeaveQueryDto) {
    const tenantId = this.requireTenant(actor);
    const scope = await this.employeeScopeWhere(actor);
    const range = this.queryRange(query, 45);
    const employeeId = this.employeeIdWhere(scope, query.employeeId);
    const [calendars, days, blackoutWindows, requests] = await Promise.all([
      this.listCalendars(actor),
      this.listCalendarDays(actor, query),
      this.listBlackoutWindows(actor, query),
      this.prisma.leaveRequest.findMany({
        where: {
          tenantId,
          employeeId,
          leaveTypeId: query.leaveTypeId,
          status: { in: ACTIVE_LEAVE_STATUSES },
          startAt: { lte: range.to },
          endAt: { gte: range.from },
          deletedAt: null,
        },
        take: query.limit ?? 100,
        orderBy: [{ startAt: 'asc' }],
        include: this.requestInclude,
      }),
    ]);

    return {
      generatedAt: new Date(),
      range,
      calendars,
      days,
      blackoutWindows,
      requests,
    };
  }

  async getReports(actor: AuthenticatedPrincipal, query: ListLeaveQueryDto) {
    const tenantId = this.requireTenant(actor);
    const scope = await this.employeeScopeWhere(actor);
    const range = this.queryRange(query, 180);
    const employeeId = this.employeeIdWhere(scope, query.employeeId);

    const [requests, balances, pendingOverdue] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: {
          tenantId,
          employeeId,
          leaveTypeId: query.leaveTypeId,
          status: query.status,
          startAt: { lte: range.to },
          endAt: { gte: range.from },
          deletedAt: null,
        },
        include: { leaveType: true, employee: { include: { person: true } } },
        orderBy: [{ startAt: 'asc' }],
      }),
      this.prisma.leaveBalance.findMany({
        where: { tenantId, employeeId, leaveTypeId: query.leaveTypeId },
        include: this.balanceInclude,
      }),
      this.prisma.leaveRequest.count({
        where: {
          tenantId,
          employeeId,
          status: LeaveRequestStatus.PENDING_APPROVAL,
          submittedAt: { lt: this.addDays(new Date(), -2) },
          deletedAt: null,
        },
      }),
    ]);

    const usageByType = new Map<string, { leaveTypeId: string; leaveTypeName: string; approvedMinutes: number; pendingMinutes: number; requestCount: number }>();
    for (const request of requests) {
      const key = request.leaveTypeId;
      const row = usageByType.get(key) ?? {
        leaveTypeId: key,
        leaveTypeName: request.leaveType?.name ?? 'Leave',
        approvedMinutes: 0,
        pendingMinutes: 0,
        requestCount: 0,
      };
      row.requestCount += 1;
      if (request.status === LeaveRequestStatus.APPROVED || request.status === LeaveRequestStatus.TAKEN) row.approvedMinutes += request.paidMinutes + request.unpaidMinutes;
      if (request.status === LeaveRequestStatus.PENDING_APPROVAL || request.status === LeaveRequestStatus.SUBMITTED) row.pendingMinutes += request.paidMinutes + request.unpaidMinutes;
      usageByType.set(key, row);
    }

    const balanceLiabilityMinutes = balances.reduce((total, balance) => total + Math.max(0, balance.balanceMinutes - balance.pendingMinutes), 0);
    const coverageRisks = requests.filter((request) => this.readRiskLevel(request.coverageSnapshot) !== 'LOW').length;

    return {
      generatedAt: new Date(),
      range,
      metrics: {
        requestCount: requests.length,
        approvedMinutes: requests.reduce((total, request) => total + (request.status === LeaveRequestStatus.APPROVED ? request.paidMinutes + request.unpaidMinutes : 0), 0),
        pendingRequests: requests.filter((request) => request.status === LeaveRequestStatus.PENDING_APPROVAL).length,
        pendingOverdue,
        balanceLiabilityMinutes,
        coverageRisks,
      },
      usageByType: [...usageByType.values()],
      balances,
      upcoming: requests.filter((request) => request.status === LeaveRequestStatus.APPROVED && request.startAt >= new Date()).slice(0, 10),
      coverageRiskRequests: requests.filter((request) => this.readRiskLevel(request.coverageSnapshot) !== 'LOW').slice(0, 10),
    };
  }

  async createApprovalRule(actor: AuthenticatedPrincipal, dto: CreateLeaveApprovalRuleDto) {
    const tenantId = this.requireTenant(actor);
    await this.validateApprovalRuleReferences(tenantId, dto);

    const rule = await this.prisma.leaveApprovalRule.create({
      data: {
        tenantId,
        code: this.normalizeCode(dto.code),
        name: dto.name.trim(),
        status: dto.status ?? LeavePolicyStatus.ACTIVE,
        priority: dto.priority ?? 100,
        leaveTypeId: dto.leaveTypeId,
        policyId: dto.policyId,
        workflowId: dto.workflowId,
        workflowCode: dto.workflowCode ? this.normalizeCode(dto.workflowCode) : undefined,
        triggerKey: dto.triggerKey ?? 'leave.request.submitted',
        organizationNodeId: dto.organizationNodeId,
        costCenterId: dto.costCenterId,
        positionId: dto.positionId,
        minMinutes: dto.minMinutes,
        maxMinutes: dto.maxMinutes,
        metadata: this.toJson(dto.metadata),
      },
      include: {
        leaveType: true,
        policy: true,
        workflow: { select: { id: true, code: true, name: true, status: true, module: true, triggerKey: true } },
      },
    });

    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'LeaveApprovalRule', rule.id, null, {
      code: rule.code,
      workflowId: rule.workflowId,
      workflowCode: rule.workflowCode,
    });

    return rule;
  }

  async updateApprovalRule(actor: AuthenticatedPrincipal, ruleId: string, dto: UpdateLeaveApprovalRuleDto) {
    const tenantId = this.requireTenant(actor);
    const existing = await this.prisma.leaveApprovalRule.findFirst({ where: { id: ruleId, tenantId, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException('Leave approval rule not found.');
    }
    await this.validateApprovalRuleReferences(tenantId, dto);

    const updated = await this.prisma.leaveApprovalRule.update({
      where: { id: existing.id },
      data: {
        code: dto.code ? this.normalizeCode(dto.code) : undefined,
        name: dto.name?.trim(),
        status: dto.status,
        priority: dto.priority,
        leaveTypeId: dto.leaveTypeId,
        policyId: dto.policyId,
        workflowId: dto.workflowId,
        workflowCode: dto.workflowCode ? this.normalizeCode(dto.workflowCode) : undefined,
        triggerKey: dto.triggerKey,
        organizationNodeId: dto.organizationNodeId,
        costCenterId: dto.costCenterId,
        positionId: dto.positionId,
        minMinutes: dto.minMinutes,
        maxMinutes: dto.maxMinutes,
        metadata: this.toJson(dto.metadata),
      },
      include: {
        leaveType: true,
        policy: true,
        workflow: { select: { id: true, code: true, name: true, status: true, module: true, triggerKey: true } },
      },
    });

    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'LeaveApprovalRule', updated.id, null, {
      code: updated.code,
      workflowId: updated.workflowId,
      workflowCode: updated.workflowCode,
    });

    return updated;
  }

  async adjustBalance(actor: AuthenticatedPrincipal, dto: AdjustLeaveBalanceDto) {
    const tenantId = this.requireTenant(actor);
    await this.assertCanOperateOnEmployee(actor, dto.employeeId);
    const type = await this.findTypeOrThrow(this.prisma, tenantId, dto.leaveTypeId);
    const balance = await this.ensureBalance(this.prisma, tenantId, dto.employeeId, type.id, dto.policyId);

    const updated = await this.prisma.leaveBalance.update({
      where: { id: balance.id },
      data: {
        policyId: dto.policyId ?? balance.policyId,
        balanceMinutes: { increment: dto.minutes },
        accruedMinutes: dto.minutes > 0 ? { increment: dto.minutes } : undefined,
        usedMinutes: dto.minutes < 0 ? { increment: Math.abs(dto.minutes) } : undefined,
        asOfDate: new Date(),
      },
      include: this.balanceInclude,
    });

    await this.prisma.leaveLedgerEntry.create({
      data: {
        tenantId,
        employeeId: dto.employeeId,
        leaveTypeId: type.id,
        balanceId: updated.id,
        type: dto.minutes >= 0 ? LeaveLedgerEntryType.CREDIT_ADJUSTMENT : LeaveLedgerEntryType.DEBIT_ADJUSTMENT,
        minutes: dto.minutes,
        reason: dto.reason,
        actorUserId: actor.id,
        metadata: this.toJson(dto.metadata),
      },
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'LeaveBalance', updated.id, this.balanceState(balance), this.balanceState(updated)),
      this.writeTimeline(this.prisma, actor, tenantId, dto.employeeId, TimelineEventType.LEAVE_BALANCE_ADJUSTED, 'Leave balance adjusted', dto.reason, {
        leaveTypeId: type.id,
        minutes: dto.minutes,
      }),
      this.enqueueOutbox(this.prisma, tenantId, 'leave.balance.adjusted', 'LeaveBalance', updated.id, {
        balanceId: updated.id,
        employeeId: dto.employeeId,
        leaveTypeId: type.id,
        minutes: dto.minutes,
      }),
    ]);

    return updated;
  }

  async createRequest(actor: AuthenticatedPrincipal, dto: CreateLeaveRequestDto) {
    const tenantId = this.requireTenant(actor);
    const employee = dto.employeeId
      ? await this.findEmployeeOrThrow(tenantId, dto.employeeId)
      : await this.requireSelfEmployee(actor);
    await this.assertCanOperateOnEmployee(actor, employee.id, dto.employeeId ? 'manage' : 'self');

    const leaveType = await this.findTypeOrThrow(this.prisma, tenantId, dto.leaveTypeId);
    if (leaveType.requiresDocumentation && !dto.supportingDocumentUrl?.trim()) {
      throw new BadRequestException('Supporting documentation is required for this leave type.');
    }
    const policy = await this.activePolicyForType(tenantId, leaveType.id);
    const startAt = this.toDate(dto.startAt);
    const endAt = this.toDate(dto.endAt);
    if (endAt <= startAt) {
      throw new BadRequestException('Leave end must be after start.');
    }
    const assignment = await this.primaryAssignmentContext(tenantId, employee.id);
    const calendar = await this.resolveCalendarForEmployee(tenantId, dto.calendarId, assignment);
    const calendarEvaluation = await this.evaluateCalendarWindow(tenantId, calendar, leaveType.id, assignment, startAt, endAt);
    if (calendarEvaluation.blockers.length > 0) {
      throw new BadRequestException(calendarEvaluation.blockers[0]);
    }
    const coverageSnapshot = await this.coverageImpactForWindow(tenantId, employee.id, startAt, endAt, assignment);
    const requestedMinutes = dto.requestedMinutes
      ?? (calendarEvaluation.businessMinutes > 0 ? calendarEvaluation.businessMinutes : this.diffMinutes(startAt, endAt));
    this.validateRequestWindow(startAt, endAt, requestedMinutes, policy);
    await this.assertNoOverlap(tenantId, employee.id, startAt, endAt);

    const balance = await this.ensureBalance(this.prisma, tenantId, employee.id, leaveType.id, policy?.id);
    const paidMinutes = leaveType.paid ? requestedMinutes : 0;
    const unpaidMinutes = leaveType.paid ? 0 : requestedMinutes;
    if (paidMinutes > 0) {
      this.assertBalanceAvailable(balance, policy, paidMinutes);
    }

    const approvalRoute = await this.resolveApprovalRoute(tenantId, employee.id, leaveType.id, policy, requestedMinutes);
    if (policy?.requiresApproval !== false && !approvalRoute) {
      throw new BadRequestException('No active leave approval workflow matched this request.');
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leaveRequest.create({
        data: {
          tenantId,
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          policyId: policy?.id,
          status: policy?.requiresApproval === false ? LeaveRequestStatus.SUBMITTED : LeaveRequestStatus.PENDING_APPROVAL,
          startAt,
          endAt,
          requestedMinutes,
          businessMinutes: calendarEvaluation.businessMinutes,
          paidMinutes,
          unpaidMinutes,
          reason: dto.reason.trim(),
          notes: dto.notes,
          supportingDocumentUrl: dto.supportingDocumentUrl,
          submittedById: actor.id,
          submittedAt: new Date(),
          calendarId: calendar?.id,
          balanceSnapshot: this.balanceState(balance),
          calendarSnapshot: calendarEvaluation.snapshot,
          coverageSnapshot,
          workflowSnapshot: approvalRoute ? this.toJson(approvalRoute) : undefined,
          metadata: this.toJson({
            ...(dto.metadata ?? {}),
            calendarWarnings: calendarEvaluation.warnings,
            coverageRiskLevel: coverageSnapshot.riskLevel,
          }),
        },
      });

      if (paidMinutes > 0) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingMinutes: { increment: paidMinutes },
            asOfDate: new Date(),
          },
        });
        await tx.leaveLedgerEntry.create({
          data: {
            tenantId,
            employeeId: employee.id,
            leaveTypeId: leaveType.id,
            balanceId: balance.id,
            requestId: created.id,
            type: LeaveLedgerEntryType.REQUESTED,
            minutes: -paidMinutes,
            reason: dto.reason.trim(),
            actorUserId: actor.id,
          },
        });
      }

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'LeaveRequest', created.id, null, this.requestState(created));
      await this.writeTimeline(tx, actor, tenantId, employee.id, TimelineEventType.LEAVE_REQUESTED, 'Leave requested', dto.reason, {
        leaveRequestId: created.id,
        leaveTypeId: leaveType.id,
        requestedMinutes,
      });
      await this.enqueueOutbox(tx, tenantId, 'leave.request.submitted', 'LeaveRequest', created.id, {
        leaveRequestId: created.id,
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        requestedMinutes,
      });

      if (coverageSnapshot.riskLevel !== 'LOW') {
        await this.writeTimeline(tx, actor, tenantId, employee.id, TimelineEventType.LEAVE_COVERAGE_RISK_FLAGGED, 'Leave coverage risk flagged', coverageSnapshot.warnings[0], {
          leaveRequestId: created.id,
          riskLevel: coverageSnapshot.riskLevel,
          rows: coverageSnapshot.rows,
        });
        await this.enqueueOutbox(tx, tenantId, 'leave.coverage.risk_flagged', 'LeaveRequest', created.id, {
          leaveRequestId: created.id,
          employeeId: employee.id,
          riskLevel: coverageSnapshot.riskLevel,
          warnings: coverageSnapshot.warnings,
        });
      }

      return created;
    });

    if (policy?.requiresApproval === false) {
      await this.applyLeaveOutcome(actor, request.id, ApprovalRequestStatus.APPROVED, 'Auto-approved by leave policy.');
      return this.findRequestOrThrow(this.prisma, tenantId, request.id);
    }

    const approval = await this.approvalsService.submitRequest(actor, this.approvalSubmissionFor(request, leaveType.name, approvalRoute));
    await this.prisma.leaveRequest.update({
      where: { id: request.id },
      data: {
        approvalRequestId: approval.id,
        status: approval.status === ApprovalRequestStatus.APPROVED ? request.status : LeaveRequestStatus.PENDING_APPROVAL,
      },
    });

    if (approval.status === ApprovalRequestStatus.APPROVED) {
      await this.applyLeaveOutcome(actor, request.id, approval.status, 'Leave request auto-approved by workflow.');
    }

    return this.findRequestOrThrow(this.prisma, tenantId, request.id);
  }

  async approveRequest(actor: AuthenticatedPrincipal, requestId: string, dto: DecideLeaveRequestDto) {
    const request = await this.findRequestForDecision(actor, requestId);
    if (!request.approvalRequestId) {
      return this.applyLeaveOutcome(actor, request.id, ApprovalRequestStatus.APPROVED, dto.comment);
    }

    const approval = await this.approvalsService.approveRequest(actor, request.approvalRequestId, this.approvalAction(dto));
    await this.applyLeaveOutcome(actor, request.id, approval.status, dto.comment);
    return this.findRequestOrThrow(this.prisma, request.tenantId, request.id);
  }

  async rejectRequest(actor: AuthenticatedPrincipal, requestId: string, dto: DecideLeaveRequestDto) {
    const request = await this.findRequestForDecision(actor, requestId);
    if (!request.approvalRequestId) {
      return this.applyLeaveOutcome(actor, request.id, ApprovalRequestStatus.REJECTED, dto.comment);
    }

    const approval = await this.approvalsService.rejectRequest(actor, request.approvalRequestId, this.approvalAction(dto));
    await this.applyLeaveOutcome(actor, request.id, approval.status, dto.comment);
    return this.findRequestOrThrow(this.prisma, request.tenantId, request.id);
  }

  async cancelRequest(actor: AuthenticatedPrincipal, requestId: string, dto: DecideLeaveRequestDto) {
    const tenantId = this.requireTenant(actor);
    const request = await this.findRequestOrThrow(this.prisma, tenantId, requestId);
    if (request.employeeId !== (await this.requireSelfEmployee(actor).catch(() => ({ id: '' }))).id && !actor.permissions.includes('leave.team.write')) {
      throw new ForbiddenException('Only the requester or leave manager can cancel this leave request.');
    }

    if (request.approvalRequestId && request.status === LeaveRequestStatus.PENDING_APPROVAL) {
      await this.approvalsService.withdrawRequest(actor, request.approvalRequestId, this.approvalAction(dto));
    }

    await this.applyLeaveOutcome(actor, request.id, ApprovalRequestStatus.CANCELLED, dto.comment);
    return this.findRequestOrThrow(this.prisma, tenantId, request.id);
  }

  private approvalSubmissionFor(
    request: LeaveRequest,
    leaveTypeName: string,
    route: ApprovalRoute | null,
  ): SubmitApprovalRequestDto {
    return {
      workflowId: route?.workflowId,
      workflowCode: route?.workflowCode,
      triggerKey: route?.triggerKey ?? 'leave.request.submitted',
      module: 'leave',
      entityType: 'LeaveRequest',
      entityId: request.id,
      title: `${leaveTypeName} request`,
      description: request.reason,
      payload: {
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        policyId: request.policyId,
        startAt: request.startAt.toISOString(),
        endAt: request.endAt.toISOString(),
        requestedMinutes: request.requestedMinutes,
        businessMinutes: request.businessMinutes,
        paidMinutes: request.paidMinutes,
        unpaidMinutes: request.unpaidMinutes,
        calendarId: request.calendarId,
      },
      metadata: {
        source: 'leave.request',
        leaveRequestId: request.id,
        routeSource: route?.source,
      },
      allowAutoApprovalWithoutWorkflow: false,
    };
  }

  private async applyLeaveOutcome(
    actor: AuthenticatedPrincipal,
    requestId: string,
    approvalStatus: ApprovalRequestStatus,
    comment?: string,
  ) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.$transaction(async (tx) => {
      const request = await this.findRequestOrThrow(tx, tenantId, requestId);
      if (
        approvalStatus !== ApprovalRequestStatus.APPROVED &&
        approvalStatus !== ApprovalRequestStatus.REJECTED &&
        approvalStatus !== ApprovalRequestStatus.CANCELLED &&
        approvalStatus !== ApprovalRequestStatus.WITHDRAWN
      ) {
        return request;
      }

      if (approvalStatus === ApprovalRequestStatus.APPROVED && request.status === LeaveRequestStatus.APPROVED) {
        return request;
      }

      if (
        approvalStatus !== ApprovalRequestStatus.APPROVED &&
        TERMINAL_LEAVE_STATUSES.includes(request.status)
      ) {
        return request;
      }

      const leaveStatus = this.leaveStatusForApproval(approvalStatus);
      const before = this.requestState(request);
      const balance = request.paidMinutes > 0
        ? await this.ensureBalance(tx, tenantId, request.employeeId, request.leaveTypeId, request.policyId ?? undefined)
        : null;

      if (balance && approvalStatus === ApprovalRequestStatus.APPROVED) {
        const existingUsage = await tx.leaveLedgerEntry.findFirst({
          where: { tenantId, requestId: request.id, type: LeaveLedgerEntryType.APPROVED_USAGE },
          select: { id: true },
        });
        if (!existingUsage) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              pendingMinutes: { decrement: request.paidMinutes },
              usedMinutes: { increment: request.paidMinutes },
              balanceMinutes: { decrement: request.paidMinutes },
              asOfDate: new Date(),
            },
          });
          await tx.leaveLedgerEntry.create({
            data: {
              tenantId,
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              balanceId: balance.id,
              requestId: request.id,
              type: LeaveLedgerEntryType.APPROVED_USAGE,
              minutes: -request.paidMinutes,
              reason: comment ?? request.reason,
              actorUserId: actor.id,
            },
          });
        }
      } else if (balance && approvalStatus !== ApprovalRequestStatus.APPROVED) {
        const existingRestore = await tx.leaveLedgerEntry.findFirst({
          where: { tenantId, requestId: request.id, type: LeaveLedgerEntryType.CANCELLED_RESTORE },
          select: { id: true },
        });
        if (!existingRestore) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              pendingMinutes: { decrement: request.paidMinutes },
              asOfDate: new Date(),
            },
          });
          await tx.leaveLedgerEntry.create({
            data: {
              tenantId,
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              balanceId: balance.id,
              requestId: request.id,
              type: LeaveLedgerEntryType.CANCELLED_RESTORE,
              minutes: request.paidMinutes,
              reason: comment ?? request.reason,
              actorUserId: actor.id,
            },
          });
        }
      }

      const updated = await tx.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: leaveStatus,
          decidedById: actor.id,
          decidedAt: new Date(),
          cancelledAt: leaveStatus === LeaveRequestStatus.CANCELLED || leaveStatus === LeaveRequestStatus.WITHDRAWN ? new Date() : undefined,
          metadata: this.mergeJsonObject(request.metadata, {
            lastDecisionComment: comment,
            lastApprovalStatus: approvalStatus,
          }),
        },
        include: this.requestInclude,
      });

      const timelineType =
        leaveStatus === LeaveRequestStatus.APPROVED
          ? TimelineEventType.LEAVE_APPROVED
          : leaveStatus === LeaveRequestStatus.CANCELLED || leaveStatus === LeaveRequestStatus.WITHDRAWN
            ? TimelineEventType.LEAVE_CANCELLED
            : TimelineEventType.LEAVE_REJECTED;

      await this.writeAudit(tx, actor, tenantId, leaveStatus === LeaveRequestStatus.APPROVED ? AuditAction.APPROVE : AuditAction.REJECT, 'LeaveRequest', updated.id, before, this.requestState(updated));
      await this.writeTimeline(tx, actor, tenantId, updated.employeeId, timelineType, this.timelineTitle(timelineType), comment ?? updated.reason, {
        leaveRequestId: updated.id,
        status: updated.status,
      });
      await this.enqueueOutbox(tx, tenantId, `leave.request.${updated.status.toLowerCase()}`, 'LeaveRequest', updated.id, {
        leaveRequestId: updated.id,
        employeeId: updated.employeeId,
        status: updated.status,
      });

      return updated;
    });
  }

  private async resolveApprovalRoute(
    tenantId: string,
    employeeId: string,
    leaveTypeId: string,
    policy: { id: string; workflowCode: string | null; workflowTriggerKey: string | null } | null,
    requestedMinutes: number,
  ): Promise<ApprovalRoute | null> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        tenantId,
        employeeId,
        isPrimary: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { organizationNodeId: true, costCenterId: true, positionId: true },
    });

    const rules = await this.prisma.leaveApprovalRule.findMany({
      where: {
        tenantId,
        status: LeavePolicyStatus.ACTIVE,
        deletedAt: null,
        OR: [{ leaveTypeId }, { leaveTypeId: null }],
        AND: [
          { OR: [{ policyId: policy?.id }, { policyId: null }] },
          { OR: [{ organizationNodeId: assignment?.organizationNodeId ?? undefined }, { organizationNodeId: null }] },
          { OR: [{ costCenterId: assignment?.costCenterId ?? undefined }, { costCenterId: null }] },
          { OR: [{ positionId: assignment?.positionId ?? undefined }, { positionId: null }] },
          { OR: [{ minMinutes: null }, { minMinutes: { lte: requestedMinutes } }] },
          { OR: [{ maxMinutes: null }, { maxMinutes: { gte: requestedMinutes } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      include: { workflow: true },
    });

    const rule = rules[0];
    if (rule?.workflowId) {
      return { workflowId: rule.workflowId, triggerKey: rule.triggerKey, source: `rule:${rule.code}` };
    }
    if (rule?.workflowCode) {
      return { workflowCode: rule.workflowCode, triggerKey: rule.triggerKey, source: `rule:${rule.code}` };
    }
    if (policy?.workflowCode) {
      return { workflowCode: policy.workflowCode, triggerKey: policy.workflowTriggerKey ?? 'leave.request.submitted', source: `policy:${policy.id}` };
    }

    const workflow = await this.prisma.workflow.findFirst({
      where: {
        tenantId,
        module: 'leave',
        status: WorkflowStatus.ACTIVE,
        deletedAt: null,
        triggerKey: policy?.workflowTriggerKey ?? 'leave.request.submitted',
      },
      select: { id: true },
    });

    return workflow ? { workflowId: workflow.id, triggerKey: policy?.workflowTriggerKey ?? 'leave.request.submitted', source: 'module-default' } : null;
  }

  private async activePolicyForType(tenantId: string, leaveTypeId: string) {
    return this.prisma.leavePolicy.findFirst({
      where: {
        tenantId,
        leaveTypeId,
        status: LeavePolicyStatus.ACTIVE,
        deletedAt: null,
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: new Date() } }],
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] }],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async ensureBalance(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    employeeId: string,
    leaveTypeId: string,
    policyId?: string | null,
  ) {
    const existing = await client.leaveBalance.findFirst({
      where: { tenantId, employeeId, leaveTypeId },
    });
    if (existing) {
      return existing;
    }

    return client.leaveBalance.create({
      data: {
        tenantId,
        employeeId,
        leaveTypeId,
        policyId,
      },
    });
  }

  private assertBalanceAvailable(
    balance: { balanceMinutes: number; pendingMinutes: number },
    policy: { allowNegativeBalance: boolean; negativeBalanceLimitMinutes: number } | null,
    minutes: number,
  ) {
    const available = balance.balanceMinutes - balance.pendingMinutes;
    const floor = policy?.allowNegativeBalance ? -Math.abs(policy.negativeBalanceLimitMinutes ?? 0) : 0;
    if (available - minutes < floor) {
      throw new BadRequestException('Insufficient leave balance for this request.');
    }
  }

  private validateRequestWindow(
    startAt: Date,
    endAt: Date,
    requestedMinutes: number,
    policy: { minimumRequestMinutes: number; maximumRequestMinutes: number | null } | null,
  ) {
    if (endAt <= startAt) {
      throw new BadRequestException('Leave end must be after start.');
    }
    if (requestedMinutes < (policy?.minimumRequestMinutes ?? 1)) {
      throw new BadRequestException('Leave request is shorter than the policy minimum.');
    }
    if (policy?.maximumRequestMinutes && requestedMinutes > policy.maximumRequestMinutes) {
      throw new BadRequestException('Leave request exceeds the policy maximum.');
    }
  }

  private async assertNoOverlap(tenantId: string, employeeId: string, startAt: Date, endAt: Date) {
    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        tenantId,
        employeeId,
        status: { in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.PENDING_APPROVAL, LeaveRequestStatus.APPROVED, LeaveRequestStatus.TAKEN] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (overlap) {
      throw new BadRequestException('Another active leave request overlaps this date range.');
    }
  }

  private async findRequestForDecision(actor: AuthenticatedPrincipal, requestId: string) {
    const tenantId = this.requireTenant(actor);
    if (!actor.permissions.includes('leave.approve') && !actor.permissions.includes('leave.team.write')) {
      throw new ForbiddenException('Leave approval permission is required.');
    }
    const request = await this.findRequestOrThrow(this.prisma, tenantId, requestId);
    if (request.status !== LeaveRequestStatus.PENDING_APPROVAL && request.status !== LeaveRequestStatus.SUBMITTED) {
      throw new BadRequestException(`Leave request is already ${request.status}.`);
    }
    return request;
  }

  private async assertCanOperateOnEmployee(actor: AuthenticatedPrincipal, employeeId: string, mode: 'self' | 'manage' = 'manage') {
    if (actor.permissions.includes('leave.team.write') || actor.permissions.includes('leave.policy.write')) {
      return;
    }
    if (mode === 'manage' && !actor.permissions.includes('leave.team.write')) {
      throw new ForbiddenException('Leave management permission is required.');
    }
    const self = await this.requireSelfEmployee(actor);
    if (self.id !== employeeId) {
      throw new ForbiddenException('This employee is outside your leave scope.');
    }
  }

  private async employeeScopeWhere(actor: AuthenticatedPrincipal): Promise<EmployeeScope> {
    if (actor.permissions.includes('leave.team.write') || actor.permissions.includes('leave.policy.write') || actor.permissions.includes('leave.reports.read')) {
      return {};
    }

    if (actor.permissions.includes('leave.team.read') || actor.permissions.includes('leave.approve')) {
      const manager = await this.getSelfEmployeeOrNull(actor);
      if (!manager) return { employeeId: { in: [] } };
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

  private employeeIdWhere(scope: EmployeeScope, requestedEmployeeId?: string) {
    const scopedEmployeeId = scope.employeeId;
    if (!requestedEmployeeId) {
      return scopedEmployeeId;
    }
    if (!scopedEmployeeId) {
      return requestedEmployeeId;
    }
    if (typeof scopedEmployeeId === 'string') {
      return scopedEmployeeId === requestedEmployeeId ? requestedEmployeeId : { in: [] };
    }
    return scopedEmployeeId.in.includes(requestedEmployeeId) ? requestedEmployeeId : { in: [] };
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
      where: { tenantId, userId: actor.id, deletedAt: null },
      include: this.employeeInclude,
    });
  }

  private async findEmployeeOrThrow(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, id: employeeId, deletedAt: null },
      include: this.employeeInclude,
    });
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }
    return employee;
  }

  private async findTypeOrThrow(client: Prisma.TransactionClient | PrismaService, tenantId: string, typeId: string) {
    const type = await client.leaveType.findFirst({ where: { id: typeId, tenantId, deletedAt: null } });
    if (!type) {
      throw new NotFoundException('Leave type not found.');
    }
    return type;
  }

  private async findPolicyOrThrow(client: Prisma.TransactionClient | PrismaService, tenantId: string, policyId: string) {
    const policy = await client.leavePolicy.findFirst({ where: { id: policyId, tenantId, deletedAt: null } });
    if (!policy) {
      throw new NotFoundException('Leave policy not found.');
    }
    return policy;
  }

  private async findRequestOrThrow(client: Prisma.TransactionClient | PrismaService, tenantId: string, requestId: string) {
    const request = await client.leaveRequest.findFirst({
      where: { id: requestId, tenantId, deletedAt: null },
      include: this.requestInclude,
    });
    if (!request) {
      throw new NotFoundException('Leave request not found.');
    }
    return request;
  }

  private async findCalendarOrThrow(client: Prisma.TransactionClient | PrismaService, tenantId: string, calendarId: string) {
    const calendar = await client.leaveCalendar.findFirst({
      where: { id: calendarId, tenantId, deletedAt: null },
      include: this.calendarInclude,
    });
    if (!calendar) {
      throw new NotFoundException('Leave calendar not found.');
    }
    return calendar;
  }

  private async validateBlackoutReferences(tenantId: string, dto: Partial<CreateLeaveBlackoutWindowDto>) {
    await Promise.all([
      dto.calendarId ? this.findCalendarOrThrow(this.prisma, tenantId, dto.calendarId) : Promise.resolve(),
      dto.leaveTypeId ? this.findTypeOrThrow(this.prisma, tenantId, dto.leaveTypeId) : Promise.resolve(),
    ]);
  }

  private async primaryAssignmentContext(tenantId: string, employeeId: string): Promise<LeaveAssignmentContext | null> {
    return this.prisma.employeeAssignment.findFirst({
      where: {
        tenantId,
        employeeId,
        ...this.currentPrimaryAssignmentWhere(new Date()),
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { organizationNodeId: true, costCenterId: true, positionId: true },
    });
  }

  private async resolveCalendarForEmployee(
    tenantId: string,
    requestedCalendarId?: string,
    assignment?: LeaveAssignmentContext | null,
  ): Promise<LeaveCalendarWithRelations | null> {
    if (requestedCalendarId) {
      const requested = await this.findCalendarOrThrow(this.prisma, tenantId, requestedCalendarId);
      if (requested.status !== LeavePolicyStatus.ACTIVE) {
        throw new BadRequestException('The selected leave calendar is not active.');
      }
      return requested;
    }

    const calendars = await this.prisma.leaveCalendar.findMany({
      where: {
        tenantId,
        status: LeavePolicyStatus.ACTIVE,
        deletedAt: null,
        AND: [
          this.nullOrExactCalendarDimension('organizationNodeId', assignment?.organizationNodeId),
          this.nullOrExactCalendarDimension('costCenterId', assignment?.costCenterId),
          this.nullOrExactCalendarDimension('positionId', assignment?.positionId),
        ],
      },
      include: this.calendarInclude,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return calendars
      .sort((left, right) => {
        if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
        return this.calendarSpecificity(right, assignment) - this.calendarSpecificity(left, assignment);
      })[0] ?? null;
  }

  private async evaluateCalendarWindow(
    tenantId: string,
    calendar: LeaveCalendarWithRelations | null,
    leaveTypeId: string,
    assignment: LeaveAssignmentContext | null,
    startAt: Date,
    endAt: Date,
  ) {
    if (!calendar) {
      const fallbackMinutes = this.diffMinutes(startAt, endAt);
      return {
        businessMinutes: fallbackMinutes,
        warnings: ['No active leave calendar matched this employee; duration used raw request time.'],
        blockers: [],
        snapshot: this.toJson({
          calendarId: null,
          businessMinutes: fallbackMinutes,
          warnings: ['No active leave calendar matched this employee; duration used raw request time.'],
          days: [],
          blackouts: [],
        }) as Prisma.InputJsonObject,
      };
    }

    const rangeStart = this.startOfDay(startAt);
    const rangeEnd = this.endOfDay(endAt);
    const [calendarDays, blackoutWindows] = await Promise.all([
      this.prisma.leaveCalendarDay.findMany({
        where: {
          tenantId,
          calendarId: calendar.id,
          date: { gte: rangeStart, lte: rangeEnd },
        },
        orderBy: [{ date: 'asc' }],
      }),
      this.prisma.leaveBlackoutWindow.findMany({
        where: {
          tenantId,
          status: LeavePolicyStatus.ACTIVE,
          deletedAt: null,
          startsAt: { lt: endAt },
          endsAt: { gt: startAt },
          AND: [
            { OR: [{ calendarId: null }, { calendarId: calendar.id }] },
            { OR: [{ leaveTypeId: null }, { leaveTypeId }] },
            this.nullOrExactBlackoutDimension('organizationNodeId', assignment?.organizationNodeId),
            this.nullOrExactBlackoutDimension('costCenterId', assignment?.costCenterId),
            this.nullOrExactBlackoutDimension('positionId', assignment?.positionId),
          ],
        },
        orderBy: [{ severity: 'desc' }, { startsAt: 'asc' }],
      }),
    ]);

    const dayByIso = new Map(calendarDays.map((day) => [day.date.toISOString().slice(0, 10), day]));
    const daySnapshots: CalendarDaySnapshot[] = [];
    let businessMinutes = 0;

    for (let cursor = new Date(rangeStart); cursor <= rangeEnd; cursor = this.addDays(cursor, 1)) {
      const dateKey = cursor.toISOString().slice(0, 10);
      const override = dayByIso.get(dateKey);
      const weekday = cursor.getDay();
      const normalWorkday = calendar.workWeekdays.includes(weekday);
      const isWorkingDay = override?.type === LeaveCalendarDayType.SPECIAL_WORKDAY
        ? true
        : override?.type === LeaveCalendarDayType.HOLIDAY || override?.type === LeaveCalendarDayType.NON_WORKING_DAY
          ? false
          : normalWorkday;
      const workdayMinutes = isWorkingDay
        ? override?.workdayMinutes ?? calendar.defaultWorkdayMinutes
        : 0;
      const overlapMinutes = this.overlapMinutes(startAt, endAt, cursor, this.addDays(cursor, 1));
      const countedMinutes = Math.min(overlapMinutes, workdayMinutes);
      businessMinutes += countedMinutes;
      daySnapshots.push({
        date: dateKey,
        weekday,
        name: override?.name ?? null,
        type: override?.type ?? (normalWorkday ? 'WORKDAY' : LeaveCalendarDayType.NON_WORKING_DAY),
        isWorkingDay,
        workdayMinutes,
        requestedOverlapMinutes: overlapMinutes,
        countedMinutes,
      });
    }

    const blackoutSnapshots = blackoutWindows.map((window) => ({
      id: window.id,
      code: window.code,
      name: window.name,
      severity: window.severity,
      startsAt: window.startsAt.toISOString(),
      endsAt: window.endsAt.toISOString(),
    }));
    const warnings = [
      ...daySnapshots
        .filter((day) => day.requestedOverlapMinutes > 0 && !day.isWorkingDay)
        .map((day) => `${day.date} is not counted as a working leave day on ${calendar.name}.`),
      ...blackoutWindows
        .filter((window) => window.severity === LeaveBlackoutSeverity.WARN)
        .map((window) => `${window.name} overlaps this leave request.`),
    ];
    const blockers = blackoutWindows
      .filter((window) => window.severity === LeaveBlackoutSeverity.BLOCK)
      .map((window) => `${window.name} blocks leave from ${window.startsAt.toISOString()} to ${window.endsAt.toISOString()}.`);

    return {
      businessMinutes,
      warnings,
      blockers,
      snapshot: this.toJson({
        calendarId: calendar.id,
        calendarCode: calendar.code,
        calendarName: calendar.name,
        timezone: calendar.timezone,
        workWeekdays: calendar.workWeekdays,
        defaultWorkdayMinutes: calendar.defaultWorkdayMinutes,
        businessMinutes,
        warnings,
        blockers,
        days: daySnapshots,
        blackouts: blackoutSnapshots,
      }) as Prisma.InputJsonObject,
    };
  }

  private async coverageImpactForWindow(
    tenantId: string,
    employeeId: string,
    startAt: Date,
    endAt: Date,
    assignment: LeaveAssignmentContext | null,
  ) {
    const [assignments, coverageRules] = await Promise.all([
      this.prisma.scheduleAssignment.findMany({
        where: {
          tenantId,
          status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
          startsAt: { lt: endAt },
          endsAt: { gt: startAt },
          ...this.assignmentCoverageScopeWhere(assignment),
        },
        select: {
          id: true,
          employeeId: true,
          workDate: true,
          startsAt: true,
          endsAt: true,
          organizationNodeId: true,
          costCenterId: true,
          positionId: true,
          locationName: true,
        },
      }),
      this.prisma.scheduleCoverageRule.findMany({
        where: {
          tenantId,
          status: ScheduleCoverageRuleStatus.ACTIVE,
          deletedAt: null,
          AND: [
            { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: endAt } }] },
            { OR: [{ effectiveTo: null }, { effectiveTo: { gte: startAt } }] },
            this.nullOrExactCoverageDimension('organizationNodeId', assignment?.organizationNodeId),
            this.nullOrExactCoverageDimension('costCenterId', assignment?.costCenterId),
            this.nullOrExactCoverageDimension('positionId', assignment?.positionId),
          ],
        },
        select: {
          id: true,
          code: true,
          name: true,
          weekdays: true,
          minimumHeadcount: true,
          requiredHeadcount: true,
          organizationNodeId: true,
          costCenterId: true,
          positionId: true,
        },
      }),
    ]);

    const teamEmployeeIds = [...new Set(assignments.map((item) => item.employeeId))];
    const leaveRequests = teamEmployeeIds.length > 0
      ? await this.prisma.leaveRequest.findMany({
          where: {
            tenantId,
            employeeId: { in: teamEmployeeIds },
            status: { in: ACTIVE_LEAVE_STATUSES },
            startAt: { lt: endAt },
            endAt: { gt: startAt },
            deletedAt: null,
          },
          select: {
            id: true,
            employeeId: true,
            status: true,
            startAt: true,
            endAt: true,
          },
        })
      : [];

    const rows: CoverageDaySnapshot[] = [];
    const conflicts = assignments
      .filter((item) => item.employeeId === employeeId)
      .map((item) => ({
        assignmentId: item.id,
        workDate: item.workDate.toISOString(),
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt.toISOString(),
        locationName: item.locationName,
      }));

    for (let cursor = this.startOfDay(startAt); cursor <= this.endOfDay(endAt); cursor = this.addDays(cursor, 1)) {
      const dayStart = new Date(cursor);
      const dayEnd = this.addDays(dayStart, 1);
      const weekday = dayStart.getDay();
      const dayAssignments = assignments.filter((item) => item.startsAt < dayEnd && item.endsAt > dayStart);
      const scheduledEmployeeIds = new Set(dayAssignments.map((item) => item.employeeId));
      const activeLeaves = leaveRequests.filter((item) => item.startAt < dayEnd && item.endAt > dayStart);
      const approvedLeaveEmployeeIds = new Set(activeLeaves
        .filter((item) => item.status === LeaveRequestStatus.APPROVED || item.status === LeaveRequestStatus.TAKEN)
        .map((item) => item.employeeId));
      const pendingLeaveEmployeeIds = new Set(activeLeaves
        .filter((item) => item.status === LeaveRequestStatus.SUBMITTED || item.status === LeaveRequestStatus.PENDING_APPROVAL)
        .map((item) => item.employeeId));
      const matchingRules = coverageRules.filter((rule) => rule.weekdays.length === 0 || rule.weekdays.includes(weekday));
      const minimumHeadcount = Math.max(1, ...matchingRules.map((rule) => rule.minimumHeadcount));
      const requestedEmployeeScheduled = scheduledEmployeeIds.has(employeeId);
      const projectedHeadcount = Math.max(
        0,
        scheduledEmployeeIds.size
          - approvedLeaveEmployeeIds.size
          - (requestedEmployeeScheduled ? 1 : 0),
      );
      const riskLevel: LeaveCoverageRiskLevel = projectedHeadcount < minimumHeadcount
        ? 'HIGH'
        : requestedEmployeeScheduled || pendingLeaveEmployeeIds.size > 0
          ? 'MEDIUM'
          : 'LOW';

      rows.push({
        date: dayStart.toISOString().slice(0, 10),
        weekday,
        scheduledHeadcount: scheduledEmployeeIds.size,
        approvedLeaveCount: approvedLeaveEmployeeIds.size,
        pendingLeaveCount: pendingLeaveEmployeeIds.size,
        requestedEmployeeScheduled,
        minimumHeadcount,
        projectedHeadcount,
        ruleCount: matchingRules.length,
        riskLevel,
      });
    }

    const riskLevel: LeaveCoverageRiskLevel = rows.some((row) => row.riskLevel === 'HIGH')
      ? 'HIGH'
      : rows.some((row) => row.riskLevel === 'MEDIUM')
        ? 'MEDIUM'
        : 'LOW';
    const warnings = rows
      .filter((row) => row.riskLevel !== 'LOW')
      .map((row) => `${row.date} coverage is ${String(row.riskLevel).toLowerCase()} risk after this leave request.`);

    return this.toJson({
      riskLevel,
      warnings,
      conflicts,
      rows,
      generatedAt: new Date().toISOString(),
    }) as Prisma.InputJsonObject & {
      riskLevel: LeaveCoverageRiskLevel;
      warnings: string[];
      rows: CoverageDaySnapshot[];
    };
  }

  private nullOrExactCalendarDimension(
    field: 'organizationNodeId' | 'costCenterId' | 'positionId',
    value?: string | null,
  ): Prisma.LeaveCalendarWhereInput {
    return value ? { OR: [{ [field]: value }, { [field]: null }] } : { [field]: null };
  }

  private nullOrExactBlackoutDimension(
    field: 'organizationNodeId' | 'costCenterId' | 'positionId',
    value?: string | null,
  ): Prisma.LeaveBlackoutWindowWhereInput {
    return value ? { OR: [{ [field]: value }, { [field]: null }] } : { [field]: null };
  }

  private nullOrExactCoverageDimension(
    field: 'organizationNodeId' | 'costCenterId' | 'positionId',
    value?: string | null,
  ): Prisma.ScheduleCoverageRuleWhereInput {
    return value ? { OR: [{ [field]: value }, { [field]: null }] } : { [field]: null };
  }

  private assignmentCoverageScopeWhere(assignment?: LeaveAssignmentContext | null): Prisma.ScheduleAssignmentWhereInput {
    return {
      organizationNodeId: assignment?.organizationNodeId ?? undefined,
      costCenterId: assignment?.costCenterId ?? undefined,
      positionId: assignment?.positionId ?? undefined,
    };
  }

  private calendarSpecificity(calendar: LeaveCalendarWithRelations, assignment?: LeaveAssignmentContext | null) {
    let score = 0;
    if (calendar.organizationNodeId && calendar.organizationNodeId === assignment?.organizationNodeId) score += 3;
    if (calendar.costCenterId && calendar.costCenterId === assignment?.costCenterId) score += 2;
    if (calendar.positionId && calendar.positionId === assignment?.positionId) score += 1;
    return score;
  }

  private overlapMinutes(leftStart: Date, leftEnd: Date, rightStart: Date, rightEnd: Date) {
    const startsAt = Math.max(leftStart.getTime(), rightStart.getTime());
    const endsAt = Math.min(leftEnd.getTime(), rightEnd.getTime());
    if (endsAt <= startsAt) return 0;
    return Math.round((endsAt - startsAt) / 60000);
  }

  private async validateApprovalRuleReferences(tenantId: string, dto: Partial<CreateLeaveApprovalRuleDto>) {
    await Promise.all([
      dto.leaveTypeId ? this.findTypeOrThrow(this.prisma, tenantId, dto.leaveTypeId) : Promise.resolve(),
      dto.policyId ? this.findPolicyOrThrow(this.prisma, tenantId, dto.policyId) : Promise.resolve(),
      dto.workflowId
        ? this.prisma.workflow.findFirst({ where: { id: dto.workflowId, tenantId, deletedAt: null } }).then((workflow) => {
            if (!workflow) throw new BadRequestException('Workflow reference is invalid for this tenant.');
          })
        : Promise.resolve(),
      dto.workflowCode
        ? this.prisma.workflow.findFirst({
            where: {
              tenantId,
              code: this.normalizeCode(dto.workflowCode),
              module: 'leave',
              status: WorkflowStatus.ACTIVE,
              deletedAt: null,
            },
            select: { id: true },
          }).then((workflow) => {
            if (!workflow) throw new BadRequestException('Workflow code must reference an active leave workflow.');
          })
        : Promise.resolve(),
    ]);
  }

  private policyData(tenantId: string, dto: CreateLeavePolicyDto): Prisma.LeavePolicyCreateInput {
    return {
      tenant: { connect: { id: tenantId } },
      leaveType: { connect: { id: dto.leaveTypeId } },
      code: this.normalizeCode(dto.code),
      name: dto.name.trim(),
      description: dto.description,
      status: dto.status ?? LeavePolicyStatus.DRAFT,
      effectiveFrom: dto.effectiveFrom ? this.toDate(dto.effectiveFrom) : undefined,
      effectiveTo: dto.effectiveTo ? this.toDate(dto.effectiveTo) : undefined,
      eligibilityDays: dto.eligibilityDays ?? 0,
      annualAllowanceMinutes: dto.annualAllowanceMinutes ?? 0,
      accrualMethod: dto.accrualMethod ?? 'ANNUAL_GRANT',
      accrualRateMinutes: dto.accrualRateMinutes,
      maxBalanceMinutes: dto.maxBalanceMinutes,
      carryoverLimitMinutes: dto.carryoverLimitMinutes,
      allowNegativeBalance: dto.allowNegativeBalance ?? false,
      negativeBalanceLimitMinutes: dto.negativeBalanceLimitMinutes ?? 0,
      minimumRequestMinutes: dto.minimumRequestMinutes ?? 60,
      maximumRequestMinutes: dto.maximumRequestMinutes,
      requiresApproval: dto.requiresApproval ?? true,
      workflowCode: dto.workflowCode ? this.normalizeCode(dto.workflowCode) : undefined,
      workflowTriggerKey: dto.workflowTriggerKey ?? 'leave.request.submitted',
      metadata: this.toJson(dto.metadata),
    };
  }

  private policyUpdateData(dto: UpdateLeavePolicyDto): Prisma.LeavePolicyUpdateInput {
    return {
      leaveType: dto.leaveTypeId ? { connect: { id: dto.leaveTypeId } } : undefined,
      code: dto.code ? this.normalizeCode(dto.code) : undefined,
      name: dto.name?.trim(),
      description: dto.description,
      status: dto.status,
      effectiveFrom: dto.effectiveFrom ? this.toDate(dto.effectiveFrom) : undefined,
      effectiveTo: dto.effectiveTo ? this.toDate(dto.effectiveTo) : undefined,
      eligibilityDays: dto.eligibilityDays,
      annualAllowanceMinutes: dto.annualAllowanceMinutes,
      accrualMethod: dto.accrualMethod,
      accrualRateMinutes: dto.accrualRateMinutes,
      maxBalanceMinutes: dto.maxBalanceMinutes,
      carryoverLimitMinutes: dto.carryoverLimitMinutes,
      allowNegativeBalance: dto.allowNegativeBalance,
      negativeBalanceLimitMinutes: dto.negativeBalanceLimitMinutes,
      minimumRequestMinutes: dto.minimumRequestMinutes,
      maximumRequestMinutes: dto.maximumRequestMinutes,
      requiresApproval: dto.requiresApproval,
      workflowCode: dto.workflowCode ? this.normalizeCode(dto.workflowCode) : undefined,
      workflowTriggerKey: dto.workflowTriggerKey,
      metadata: this.toJson(dto.metadata),
    };
  }

  private approvalAction(dto: DecideLeaveRequestDto): ApprovalActionDto {
    return {
      comment: dto.comment,
      metadata: dto.metadata,
    };
  }

  private leaveStatusForApproval(status: ApprovalRequestStatus) {
    switch (status) {
      case ApprovalRequestStatus.APPROVED:
        return LeaveRequestStatus.APPROVED;
      case ApprovalRequestStatus.CANCELLED:
        return LeaveRequestStatus.CANCELLED;
      case ApprovalRequestStatus.WITHDRAWN:
        return LeaveRequestStatus.WITHDRAWN;
      default:
        return LeaveRequestStatus.REJECTED;
    }
  }

  private queryRange(query: ListLeaveQueryDto, fallbackDays: number) {
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

  private async writeAudit(
    client: Prisma.TransactionClient | PrismaService,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue,
  ) {
    await client.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.id,
        action,
        module: 'leave',
        entityType,
        entityId,
        before: before ?? undefined,
        after,
      },
    });
  }

  private async writeTimeline(
    client: Prisma.TransactionClient | PrismaService,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
    type: TimelineEventType,
    title: string,
    description: string | undefined,
    data: Record<string, unknown>,
  ) {
    await client.timelineEvent.create({
      data: {
        tenantId,
        employeeId,
        actorUserId: actor.id,
        type,
        title,
        description,
        entityType: 'LeaveRequest',
        entityId: typeof data.leaveRequestId === 'string' ? data.leaveRequestId : employeeId,
        data: this.toJson(data),
      },
    });
  }

  private async enqueueOutbox(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Prisma.InputJsonValue,
  ) {
    await client.outboxMessage.create({
      data: {
        tenantId,
        eventType,
        aggregateType,
        aggregateId,
        payload,
      },
    });
  }

  private requestState(request: Pick<LeaveRequest, 'id' | 'employeeId' | 'leaveTypeId' | 'policyId' | 'calendarId' | 'approvalRequestId' | 'status' | 'startAt' | 'endAt' | 'requestedMinutes' | 'businessMinutes' | 'paidMinutes' | 'unpaidMinutes'>): Prisma.InputJsonObject {
    return {
      id: request.id,
      employeeId: request.employeeId,
      leaveTypeId: request.leaveTypeId,
      policyId: request.policyId,
      calendarId: request.calendarId,
      approvalRequestId: request.approvalRequestId,
      status: request.status,
      startAt: request.startAt.toISOString(),
      endAt: request.endAt.toISOString(),
      requestedMinutes: request.requestedMinutes,
      businessMinutes: request.businessMinutes,
      paidMinutes: request.paidMinutes,
      unpaidMinutes: request.unpaidMinutes,
    };
  }

  private balanceState(balance: { id: string; employeeId: string; leaveTypeId: string; balanceMinutes: number; accruedMinutes: number; usedMinutes: number; pendingMinutes: number }): Prisma.InputJsonObject {
    return {
      id: balance.id,
      employeeId: balance.employeeId,
      leaveTypeId: balance.leaveTypeId,
      balanceMinutes: balance.balanceMinutes,
      accruedMinutes: balance.accruedMinutes,
      usedMinutes: balance.usedMinutes,
      pendingMinutes: balance.pendingMinutes,
    };
  }

  private typeState(type: { id: string; code: string; name: string; status: LeavePolicyStatus; paid: boolean }): Prisma.InputJsonObject {
    return {
      id: type.id,
      code: type.code,
      name: type.name,
      status: type.status,
      paid: type.paid,
    };
  }

  private policyState(policy: { id: string; code: string; name: string; status: LeavePolicyStatus; leaveTypeId: string; annualAllowanceMinutes: number; requiresApproval: boolean }): Prisma.InputJsonObject {
    return {
      id: policy.id,
      code: policy.code,
      name: policy.name,
      status: policy.status,
      leaveTypeId: policy.leaveTypeId,
      annualAllowanceMinutes: policy.annualAllowanceMinutes,
      requiresApproval: policy.requiresApproval,
    };
  }

  private calendarState(calendar: {
    id: string;
    code: string;
    name: string;
    status: LeavePolicyStatus;
    isDefault: boolean;
    workWeekdays: number[];
    defaultWorkdayMinutes: number;
    organizationNodeId?: string | null;
    costCenterId?: string | null;
    positionId?: string | null;
  }): Prisma.InputJsonObject {
    return {
      id: calendar.id,
      code: calendar.code,
      name: calendar.name,
      status: calendar.status,
      isDefault: calendar.isDefault,
      workWeekdays: calendar.workWeekdays,
      defaultWorkdayMinutes: calendar.defaultWorkdayMinutes,
      organizationNodeId: calendar.organizationNodeId ?? null,
      costCenterId: calendar.costCenterId ?? null,
      positionId: calendar.positionId ?? null,
    };
  }

  private blackoutState(blackout: {
    id: string;
    code: string;
    name: string;
    status: LeavePolicyStatus;
    severity: LeaveBlackoutSeverity;
    calendarId?: string | null;
    leaveTypeId?: string | null;
    startsAt: Date;
    endsAt: Date;
  }): Prisma.InputJsonObject {
    return {
      id: blackout.id,
      code: blackout.code,
      name: blackout.name,
      status: blackout.status,
      severity: blackout.severity,
      calendarId: blackout.calendarId ?? null,
      leaveTypeId: blackout.leaveTypeId ?? null,
      startsAt: blackout.startsAt.toISOString(),
      endsAt: blackout.endsAt.toISOString(),
    };
  }

  private readRiskLevel(snapshot: Prisma.JsonValue | null): LeaveCoverageRiskLevel {
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
      const riskLevel = (snapshot as Record<string, unknown>).riskLevel;
      if (riskLevel === 'HIGH' || riskLevel === 'MEDIUM') return riskLevel;
    }
    return 'LOW';
  }

  private timelineTitle(type: TimelineEventType) {
    switch (type) {
      case TimelineEventType.LEAVE_APPROVED:
        return 'Leave approved';
      case TimelineEventType.LEAVE_REJECTED:
        return 'Leave rejected';
      case TimelineEventType.LEAVE_CANCELLED:
        return 'Leave cancelled';
      default:
        return 'Leave requested';
    }
  }

  private mergeJsonObject(value: Prisma.JsonValue | null, patch: Record<string, unknown>) {
    const base = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    return this.toJson({ ...base, ...patch });
  }

  private paginate<T extends { id: string }>(items: T[], limit: number) {
    const hasNextPage = items.length > limit;
    const data = hasNextPage ? items.slice(0, limit) : items;
    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? data.at(-1)?.id ?? null : null,
      },
    };
  }

  private diffMinutes(startAt: Date, endAt: Date) {
    return Math.max(1, Math.round((endAt.getTime() - startAt.getTime()) / 60000));
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private endOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private toDate(value: string) {
    return new Date(value);
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private requireTenant(actor: AuthenticatedPrincipal): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant context is required.');
    }
    return actor.tenantId;
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) return undefined;
    return value as Prisma.InputJsonValue | undefined;
  }

  private get employeeInclude() {
    return {
      person: true,
      assignments: {
        where: this.currentPrimaryAssignmentWhere(new Date()),
        orderBy: { effectiveFrom: 'desc' as const },
        take: 1,
        include: {
          organizationNode: true,
          costCenter: true,
          position: true,
          managerEmployee: { include: { person: true } },
        },
      },
    };
  }

  private get balanceInclude() {
    return {
      employee: { include: { person: true } },
      leaveType: true,
      policy: true,
    };
  }

  private get requestInclude() {
    return {
      employee: { include: { person: true } },
      leaveType: true,
      policy: true,
      calendar: true,
      submittedBy: { select: { id: true, email: true, username: true } },
      decidedBy: { select: { id: true, email: true, username: true } },
      approvalRequest: {
        include: {
          workflow: { select: { id: true, code: true, name: true, module: true, status: true } },
          steps: {
            orderBy: [{ stepOrder: 'asc' as const }],
            include: {
              assignedUser: { select: { id: true, email: true, username: true } },
              assignedRole: { select: { id: true, code: true, name: true } },
            },
          },
          actions: { orderBy: [{ createdAt: 'asc' as const }] },
        },
      },
      ledgerEntries: { orderBy: [{ createdAt: 'asc' as const }] },
    };
  }

  private get calendarInclude() {
    return {
      days: {
        orderBy: [{ date: 'asc' as const }],
        take: 24,
      },
      blackoutWindows: {
        where: { deletedAt: null },
        orderBy: [{ startsAt: 'asc' as const }],
        include: { leaveType: true },
      },
    };
  }

  private get blackoutInclude() {
    return {
      calendar: true,
      leaveType: true,
    };
  }
}
