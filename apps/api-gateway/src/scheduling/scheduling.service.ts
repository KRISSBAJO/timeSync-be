import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  EmployeeStatus,
  EmployeeAvailabilityStatus,
  LeaveRequestStatus,
  OpenShiftClaimStatus,
  OpenShiftStatus,
  OvertimeApprovalMode,
  OvertimePolicyMode,
  OvertimeRequestStatus,
  Prisma,
  ScheduleAssignmentSource,
  ScheduleAssignmentStatus,
  ScheduleCoverageRuleStatus,
  SchedulePolicyStatus,
  ScheduleStatus,
  ScheduleSwapRequestStatus,
  ScheduleWeekStart,
  ShiftStatus,
  TimelineEventType,
  type OpenShift,
  type PrismaClient,
  type ScheduleAssignment,
  type SchedulePolicy,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import {
  AssignOpenShiftDto,
  AvailabilityApplyMode,
  BulkCreateScheduleAssignmentsDto,
  CreateAvailabilityDto,
  CreateCoverageRuleDto,
  CreateOpenShiftDto,
  CreateOvertimeRequestDto,
  CreateScheduleAssignmentDto,
  CreateSchedulePeriodDto,
  CreateSchedulePolicyDto,
  CreateScheduleSwapRequestDto,
  CreateWorkShiftDto,
  DecideScheduleSwapRequestDto,
  DecideOpenShiftClaimDto,
  DecideOvertimeRequestDto,
  ListAvailabilityQueryDto,
  ListCoverageRulesQueryDto,
  ListOpenShiftEligibleEmployeesQueryDto,
  ListOpenShiftsQueryDto,
  ListScheduleAssignmentsQueryDto,
  ListOpenShiftClaimsQueryDto,
  ListSchedulableEmployeesQueryDto,
  ListScheduleSwapRequestsQueryDto,
  ListSchedulingQueryDto,
  LockSchedulePeriodDto,
  PlannerSummaryQueryDto,
  SchedulePlannerView,
  ScheduleUnassignmentMode,
  UnassignScheduleAssignmentDto,
  UpdateCoverageRuleDto,
  UpdateOpenShiftDto,
  UpdateScheduleAssignmentDto,
  UpdateScheduleAssignmentStatusDto,
  UpdateSchedulePolicyDto,
  UpdateWorkShiftDto,
} from './dto/scheduling.dto';

type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

type SchedulingScope = {
  organizationNodeId?: string | null;
  costCenterId?: string | null;
  positionId?: string | null;
};

type AssignmentScope = {
  organizationNodeId: string | null;
  costCenterId: string | null;
  positionId: string | null;
};

const AFRICA_ISO2 = new Set([
  'DZ',
  'AO',
  'BJ',
  'BW',
  'BF',
  'BI',
  'CM',
  'CV',
  'CF',
  'TD',
  'KM',
  'CG',
  'CD',
  'CI',
  'DJ',
  'EG',
  'GQ',
  'ER',
  'SZ',
  'ET',
  'GA',
  'GM',
  'GH',
  'GN',
  'GW',
  'KE',
  'LS',
  'LR',
  'LY',
  'MG',
  'MW',
  'ML',
  'MR',
  'MU',
  'MA',
  'MZ',
  'NA',
  'NE',
  'NG',
  'RW',
  'ST',
  'SN',
  'SC',
  'SL',
  'SO',
  'ZA',
  'SS',
  'SD',
  'TZ',
  'TG',
  'TN',
  'UG',
  'ZM',
  'ZW',
]);

const TERMINAL_ASSIGNMENT_STATUSES: ScheduleAssignmentStatus[] = [
  ScheduleAssignmentStatus.CANCELLED,
  ScheduleAssignmentStatus.DECLINED,
  ScheduleAssignmentStatus.NO_SHOW,
];

const LOCKED_ASSIGNMENT_STATUSES: ScheduleAssignmentStatus[] = [
  ...TERMINAL_ASSIGNMENT_STATUSES,
  ScheduleAssignmentStatus.COMPLETED,
];

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const activePolicy = await this.ensureActivePolicy(tenantId);
    const employeeScope = await this.employeeScopeWhere(actor);
    const openShiftVisibility = await this.openShiftVisibilityWhere(actor);
    const openShiftFilters = [openShiftVisibility].filter(Boolean) as Prisma.OpenShiftWhereInput[];
    const today = this.startOfDay(new Date());
    const nextWeek = new Date(today);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);

    const [
      shifts,
      periods,
      assignmentsToday,
      openShifts,
      pendingClaims,
      pendingOvertime,
      unavailableToday,
      upcomingAssignments,
    ] = await Promise.all([
      this.prisma.workShift.count({ where: { tenantId, deletedAt: null, status: ShiftStatus.ACTIVE } }),
      this.prisma.schedulePeriod.count({
        where: { tenantId, deletedAt: null, status: { in: [ScheduleStatus.DRAFT, ScheduleStatus.PUBLISHED] } },
      }),
      this.prisma.scheduleAssignment.count({
        where: {
          tenantId,
          workDate: today,
          status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
          ...employeeScope,
        },
      }),
      !activePolicy.allowOpenShiftPickup
        ? Promise.resolve(0)
        : this.prisma.openShift.count({
            where: {
              tenantId,
              status: OpenShiftStatus.OPEN,
              AND: openShiftFilters.length > 0 ? openShiftFilters : undefined,
            },
          }),
      this.prisma.openShiftClaim.count({
        where: { tenantId, status: OpenShiftClaimStatus.REQUESTED, ...employeeScope },
      }),
      this.prisma.overtimeRequest.count({
        where: { tenantId, status: OvertimeRequestStatus.REQUESTED, ...employeeScope },
      }),
      this.prisma.employeeAvailability.count({
        where: { tenantId, date: today, status: EmployeeAvailabilityStatus.UNAVAILABLE, ...employeeScope },
      }),
      this.prisma.scheduleAssignment.findMany({
        where: {
          tenantId,
          startsAt: { gte: today, lt: nextWeek },
          status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
          ...employeeScope,
        },
        orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
        take: 12,
        include: this.assignmentInclude,
      }),
    ]);

    return {
      activePolicy,
      metrics: {
        shifts,
        periods,
        assignmentsToday,
        openShifts,
        pendingClaims,
        pendingOvertime,
        unavailableToday,
      },
      upcomingAssignments,
      capabilities: {
        tenantScheduling: actor.permissions.includes('scheduling.write'),
        teamScheduling: actor.permissions.includes('scheduling.team.write'),
        selfScheduling: actor.permissions.includes('scheduling.self'),
        overtimeEnabled: activePolicy.overtimeMode !== OvertimePolicyMode.DISABLED,
        openShiftPickup: activePolicy.allowOpenShiftPickup,
      },
    };
  }

  async getPlannerSummary(actor: AuthenticatedPrincipal, query: PlannerSummaryQueryDto) {
    const tenantId = this.requireTenant(actor);
    const activePolicy = await this.ensureActivePolicy(tenantId);
    const { from, to } = this.plannerRange(query, activePolicy.weekStartsOn);
    const employeeScope = await this.employeeScopeWhere(actor);
    const scopedEmployeeFilters: Prisma.ScheduleAssignmentWhereInput[] = [];
    const scopedAvailabilityFilters: Prisma.EmployeeAvailabilityWhereInput[] = [];
    const assignmentDimensions = this.assignmentDimensionWhere(query);
    const openShiftDimensions = this.openShiftDimensionWhere(query);
    const openShiftVisibility = await this.openShiftVisibilityWhere(actor);
    const availabilityDimensions = this.availabilityDimensionWhere(query);
    const assignmentEmployeeSearch = this.assignmentEmployeeSearchWhere(query.employeeSearch);
    const availabilityEmployeeSearch = this.availabilityEmployeeSearchWhere(query.employeeSearch);

    if (Object.keys(employeeScope).length > 0) {
      scopedEmployeeFilters.push(employeeScope);
      scopedAvailabilityFilters.push(employeeScope);
    }
    if (query.employeeId) {
      scopedEmployeeFilters.push({ employeeId: query.employeeId });
      scopedAvailabilityFilters.push({ employeeId: query.employeeId });
    }
    if (assignmentEmployeeSearch) {
      scopedEmployeeFilters.push(assignmentEmployeeSearch);
    }
    if (availabilityEmployeeSearch) {
      scopedAvailabilityFilters.push(availabilityEmployeeSearch);
    }

    const assignmentWhere: Prisma.ScheduleAssignmentWhereInput = {
      tenantId,
      ...assignmentDimensions,
      workDate: { gte: from, lte: to },
      AND: scopedEmployeeFilters.length > 0 ? scopedEmployeeFilters : undefined,
      status: query.assignmentStatus ?? { notIn: TERMINAL_ASSIGNMENT_STATUSES },
    };
    const openShiftWhere: Prisma.OpenShiftWhereInput = {
      tenantId,
      workDate: { gte: from, lte: to },
      status: OpenShiftStatus.OPEN,
      AND: [openShiftVisibility, openShiftDimensions].filter(Boolean) as Prisma.OpenShiftWhereInput[],
    };
    const availabilityWhere: Prisma.EmployeeAvailabilityWhereInput = {
      tenantId,
      date: { gte: from, lte: to },
      AND: [...scopedAvailabilityFilters, ...(availabilityDimensions ? [availabilityDimensions] : [])].length > 0
        ? [...scopedAvailabilityFilters, ...(availabilityDimensions ? [availabilityDimensions] : [])]
        : undefined,
      status: query.availabilityStatus,
    };

    const [assignmentGroups, openShiftGroups, availabilityGroups, claimGroups, coverageRules] = await Promise.all([
      this.prisma.scheduleAssignment.groupBy({
        by: ['workDate'],
        where: assignmentWhere,
        _count: { _all: true },
      }),
      this.prisma.openShift.groupBy({
        by: ['workDate'],
        where: openShiftWhere,
        _count: { _all: true },
        _sum: { requiredHeadcount: true, claimedHeadcount: true },
      }),
      this.prisma.employeeAvailability.groupBy({
        by: ['date', 'status'],
        where: availabilityWhere,
        _count: { _all: true },
      }),
      this.prisma.openShiftClaim.groupBy({
        by: ['status'],
        where: {
          tenantId,
          ...employeeScope,
          ...(this.hasScheduleDimensionFilter(query) ? { openShift: openShiftDimensions } : {}),
          requestedAt: { gte: from, lte: this.endOfDay(to) },
        },
        _count: { _all: true },
      }),
      this.prisma.scheduleCoverageRule.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: ScheduleCoverageRuleStatus.ACTIVE,
          ...this.coverageRuleDimensionWhere(query),
          OR: [
            { effectiveFrom: null },
            { effectiveFrom: { lte: to } },
          ],
          AND: [
            {
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: from } },
              ],
            },
          ],
        },
        select: {
          weekdays: true,
          requiredHeadcount: true,
          minimumHeadcount: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      }),
    ]);

    const assignmentCounts = new Map(assignmentGroups.map((item) => [this.dateKey(item.workDate), item._count._all]));
    const openShiftCounts = new Map(
      openShiftGroups.map((item) => [
        this.dateKey(item.workDate),
        {
          count: item._count._all,
          requiredHeadcount: item._sum.requiredHeadcount ?? 0,
          claimedHeadcount: item._sum.claimedHeadcount ?? 0,
        },
      ]),
    );
    const availabilityCounts = new Map<
      string,
      {
        total: number;
        available: number;
        preferred: number;
        unavailable: number;
      }
    >();

    for (const item of availabilityGroups) {
      const key = this.dateKey(item.date);
      const current = availabilityCounts.get(key) ?? {
        total: 0,
        available: 0,
        preferred: 0,
        unavailable: 0,
      };
      current.total += item._count._all;
      if (item.status === EmployeeAvailabilityStatus.AVAILABLE) current.available += item._count._all;
      if (item.status === EmployeeAvailabilityStatus.PREFERRED) current.preferred += item._count._all;
      if (item.status === EmployeeAvailabilityStatus.UNAVAILABLE) current.unavailable += item._count._all;
      availabilityCounts.set(key, current);
    }

    const coverageDemandCounts = new Map<
      string,
      {
        requiredHeadcount: number;
        minimumHeadcount: number;
        ruleCount: number;
      }
    >();

    for (const date of this.dateSequence(from, to)) {
      const key = this.dateKey(date);
      const demand = coverageRules.reduce(
        (total, rule) => {
          const effectiveFrom = rule.effectiveFrom ? this.startOfDay(rule.effectiveFrom) : null;
          const effectiveTo = rule.effectiveTo ? this.startOfDay(rule.effectiveTo) : null;
          const applies =
            rule.weekdays.includes(date.getUTCDay()) &&
            (!effectiveFrom || effectiveFrom <= date) &&
            (!effectiveTo || effectiveTo >= date);

          return applies
            ? {
                requiredHeadcount: total.requiredHeadcount + rule.requiredHeadcount,
                minimumHeadcount: total.minimumHeadcount + rule.minimumHeadcount,
                ruleCount: total.ruleCount + 1,
              }
            : total;
        },
        { requiredHeadcount: 0, minimumHeadcount: 0, ruleCount: 0 },
      );

      coverageDemandCounts.set(key, demand);
    }

    const days = this.dateSequence(from, to).map((date) => {
      const key = this.dateKey(date);
      const open = openShiftCounts.get(key) ?? { count: 0, requiredHeadcount: 0, claimedHeadcount: 0 };
      const availability = availabilityCounts.get(key) ?? {
        total: 0,
        available: 0,
        preferred: 0,
        unavailable: 0,
      };
      const demand = coverageDemandCounts.get(key) ?? {
        requiredHeadcount: 0,
        minimumHeadcount: 0,
        ruleCount: 0,
      };
      const plannedCoverage = (assignmentCounts.get(key) ?? 0) + open.requiredHeadcount;

      return {
        date: date.toISOString(),
        assignmentCount: assignmentCounts.get(key) ?? 0,
        openShiftCount: open.count,
        openShiftSlots: open.requiredHeadcount,
        claimedOpenShiftSlots: open.claimedHeadcount,
        availabilityCount: availability.total,
        availableCount: availability.available,
        preferredCount: availability.preferred,
        unavailableCount: availability.unavailable,
        coverageRuleCount: demand.ruleCount,
        coverageRequiredHeadcount: demand.requiredHeadcount,
        coverageMinimumHeadcount: demand.minimumHeadcount,
        coverageGap: Math.max(0, demand.requiredHeadcount - plannedCoverage),
      };
    });

    const claimCountByStatus = Object.fromEntries(
      claimGroups.map((item) => [item.status, item._count._all]),
    ) as Partial<Record<OpenShiftClaimStatus, number>>;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      days,
      totals: days.reduce(
        (totals, day) => ({
          assignmentCount: totals.assignmentCount + day.assignmentCount,
          openShiftCount: totals.openShiftCount + day.openShiftCount,
          openShiftSlots: totals.openShiftSlots + day.openShiftSlots,
          claimedOpenShiftSlots: totals.claimedOpenShiftSlots + day.claimedOpenShiftSlots,
          availabilityCount: totals.availabilityCount + day.availabilityCount,
          availableCount: totals.availableCount + day.availableCount,
          preferredCount: totals.preferredCount + day.preferredCount,
          unavailableCount: totals.unavailableCount + day.unavailableCount,
          coverageRuleCount: totals.coverageRuleCount + day.coverageRuleCount,
          coverageRequiredHeadcount: totals.coverageRequiredHeadcount + day.coverageRequiredHeadcount,
          coverageMinimumHeadcount: totals.coverageMinimumHeadcount + day.coverageMinimumHeadcount,
          coverageGap: totals.coverageGap + day.coverageGap,
          pendingClaimCount: totals.pendingClaimCount,
          approvedClaimCount: totals.approvedClaimCount,
          rejectedClaimCount: totals.rejectedClaimCount,
        }),
        {
          assignmentCount: 0,
          openShiftCount: 0,
          openShiftSlots: 0,
          claimedOpenShiftSlots: 0,
          availabilityCount: 0,
          availableCount: 0,
          preferredCount: 0,
          unavailableCount: 0,
          coverageRuleCount: 0,
          coverageRequiredHeadcount: 0,
          coverageMinimumHeadcount: 0,
          coverageGap: 0,
          pendingClaimCount: claimCountByStatus.REQUESTED ?? 0,
          approvedClaimCount: claimCountByStatus.APPROVED ?? 0,
          rejectedClaimCount: claimCountByStatus.REJECTED ?? 0,
        },
      ),
    };
  }

  async listPolicies(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    await this.ensureActivePolicy(tenantId);

    return this.prisma.schedulePolicy.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { country: true },
    });
  }

  async listSchedulableEmployees(
    actor: AuthenticatedPrincipal,
    query: ListSchedulableEmployeesQueryDto,
  ) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 40;
    const now = new Date();
    const assignmentScope = this.currentPrimaryAssignmentWhere(now, this.employeeCandidateDimensionWhere(query));
    const search = this.employeeSearchWhere(query.employeeSearch);

    return this.prisma.employee.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: query.status ?? { in: [EmployeeStatus.ACTIVE, EmployeeStatus.PROBATION, EmployeeStatus.PREBOARDING] },
        AND: [
          search,
          Object.keys(assignmentScope).length > 0 ? { assignments: { some: assignmentScope } } : null,
        ].filter(Boolean) as Prisma.EmployeeWhereInput[],
      },
      orderBy: [{ person: { firstName: 'asc' } }, { employeeNumber: 'asc' }],
      take: limit,
      include: this.employeeCandidateInclude(now),
    });
  }

  async createPolicy(actor: AuthenticatedPrincipal, dto: CreateSchedulePolicyDto) {
    const tenantId = this.requireTenant(actor);
    const status = dto.status ?? SchedulePolicyStatus.DRAFT;

    return this.prisma.$transaction(async (tx) => {
      if (status === SchedulePolicyStatus.ACTIVE) {
        await tx.schedulePolicy.updateMany({
          where: { tenantId, status: SchedulePolicyStatus.ACTIVE, deletedAt: null },
          data: { status: SchedulePolicyStatus.ARCHIVED },
        });
      }

      const policy = await tx.schedulePolicy.create({
        data: {
          tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description,
          status,
          countryId: dto.countryId,
          timezone: dto.timezone,
          weekStartsOn: dto.weekStartsOn ?? ScheduleWeekStart.MONDAY,
          standardHoursPerDay: dto.standardHoursPerDay,
          standardHoursPerWeek: dto.standardHoursPerWeek,
          overtimeMode: dto.overtimeMode ?? OvertimePolicyMode.DISABLED,
          overtimeApprovalMode: dto.overtimeApprovalMode ?? OvertimeApprovalMode.MANAGER,
          overtimeMultiplier: dto.overtimeMultiplier ?? 1.5,
          doubleTimeMultiplier: dto.doubleTimeMultiplier,
          weekendOvertime: dto.weekendOvertime ?? false,
          holidayOvertime: dto.holidayOvertime ?? false,
          allowSelfScheduling: dto.allowSelfScheduling ?? false,
          allowOpenShiftPickup: dto.allowOpenShiftPickup ?? false,
          allowManagerAssignment: dto.allowManagerAssignment ?? true,
          allowHrAssignment: dto.allowHrAssignment ?? true,
          maxConsecutiveDays: dto.maxConsecutiveDays,
          minRestHours: dto.minRestHours,
          graceMinutesEarly: dto.graceMinutesEarly ?? 0,
          graceMinutesLate: dto.graceMinutesLate ?? 0,
          roundingMinutes: dto.roundingMinutes,
          metadata: this.toJson(dto.metadata),
        },
        include: { country: true },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'scheduling.policy', policy.id, null, policy);
      return policy;
    });
  }

  async updatePolicy(actor: AuthenticatedPrincipal, policyId: string, dto: UpdateSchedulePolicyDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.findPolicyOrThrow(tenantId, policyId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.status === SchedulePolicyStatus.ACTIVE && before.status !== SchedulePolicyStatus.ACTIVE) {
        await tx.schedulePolicy.updateMany({
          where: { tenantId, status: SchedulePolicyStatus.ACTIVE, deletedAt: null, id: { not: policyId } },
          data: { status: SchedulePolicyStatus.ARCHIVED },
        });
      }

      const policy = await tx.schedulePolicy.update({
        where: { id: policyId },
        data: {
          code: dto.code ? dto.code.trim().toUpperCase() : undefined,
          name: dto.name?.trim(),
          description: dto.description,
          status: dto.status,
          countryId: dto.countryId,
          timezone: dto.timezone,
          weekStartsOn: dto.weekStartsOn,
          standardHoursPerDay: dto.standardHoursPerDay,
          standardHoursPerWeek: dto.standardHoursPerWeek,
          overtimeMode: dto.overtimeMode,
          overtimeApprovalMode: dto.overtimeApprovalMode,
          overtimeMultiplier: dto.overtimeMultiplier,
          doubleTimeMultiplier: dto.doubleTimeMultiplier,
          weekendOvertime: dto.weekendOvertime,
          holidayOvertime: dto.holidayOvertime,
          allowSelfScheduling: dto.allowSelfScheduling,
          allowOpenShiftPickup: dto.allowOpenShiftPickup,
          allowManagerAssignment: dto.allowManagerAssignment,
          allowHrAssignment: dto.allowHrAssignment,
          maxConsecutiveDays: dto.maxConsecutiveDays,
          minRestHours: dto.minRestHours,
          graceMinutesEarly: dto.graceMinutesEarly,
          graceMinutesLate: dto.graceMinutesLate,
          roundingMinutes: dto.roundingMinutes,
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
        include: { country: true },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'scheduling.policy', policy.id, before, policy);
      return policy;
    });
  }

  async activatePolicy(actor: AuthenticatedPrincipal, policyId: string) {
    return this.updatePolicy(actor, policyId, { status: SchedulePolicyStatus.ACTIVE });
  }

  async archivePolicy(actor: AuthenticatedPrincipal, policyId: string) {
    return this.updatePolicy(actor, policyId, { status: SchedulePolicyStatus.ARCHIVED });
  }

  async listShifts(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.workShift.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { startTime: 'asc' }, { name: 'asc' }],
    });
  }

  async createShift(actor: AuthenticatedPrincipal, dto: CreateWorkShiftDto) {
    const tenantId = this.requireTenant(actor);
    const shape = this.normalizeShift(dto);

    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.workShift.create({
        data: {
          tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description,
          status: dto.status ?? ShiftStatus.ACTIVE,
          startTime: dto.startTime,
          endTime: dto.endTime,
          durationMinutes: shape.durationMinutes,
          breakMinutes: dto.breakMinutes ?? 0,
          paidBreak: dto.paidBreak ?? false,
          crossesMidnight: shape.crossesMidnight,
          timezone: dto.timezone,
          color: dto.color,
          isOvertimeEligible: dto.isOvertimeEligible ?? true,
          requiresApproval: dto.requiresApproval ?? false,
          minHeadcount: dto.minHeadcount ?? 1,
          maxHeadcount: dto.maxHeadcount,
          metadata: this.toJson(dto.metadata),
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'scheduling.shift', shift.id, null, shift);
      return shift;
    });
  }

  async updateShift(actor: AuthenticatedPrincipal, shiftId: string, dto: UpdateWorkShiftDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.findShiftOrThrow(tenantId, shiftId);
    const nextStart = dto.startTime ?? before.startTime;
    const nextEnd = dto.endTime ?? before.endTime;
    const shape = this.normalizeShift({
      startTime: nextStart,
      endTime: nextEnd,
      breakMinutes: dto.breakMinutes ?? before.breakMinutes,
      code: dto.code ?? before.code,
      name: dto.name ?? before.name,
    });

    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.workShift.update({
        where: { id: shiftId },
        data: {
          code: dto.code ? dto.code.trim().toUpperCase() : undefined,
          name: dto.name?.trim(),
          description: dto.description,
          status: dto.status,
          startTime: dto.startTime,
          endTime: dto.endTime,
          durationMinutes: shape.durationMinutes,
          breakMinutes: dto.breakMinutes,
          paidBreak: dto.paidBreak,
          crossesMidnight: shape.crossesMidnight,
          timezone: dto.timezone,
          color: dto.color,
          isOvertimeEligible: dto.isOvertimeEligible,
          requiresApproval: dto.requiresApproval,
          minHeadcount: dto.minHeadcount,
          maxHeadcount: dto.maxHeadcount,
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'scheduling.shift', shift.id, before, shift);
      return shift;
    });
  }

  async listCoverageRules(actor: AuthenticatedPrincipal, query: ListCoverageRulesQueryDto) {
    const tenantId = this.requireTenant(actor);
    const { from, to } = this.range(query);
    const limit = query.limit ?? 50;
    const search = query.search?.trim();

    const rules = await this.prisma.scheduleCoverageRule.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: query.status,
        ...this.coverageRuleDimensionWhere(query),
        shiftId: query.shiftId,
        ...(from || to
          ? {
              AND: [
                { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: to ?? from } }] },
                { OR: [{ effectiveTo: null }, { effectiveTo: { gte: from ?? to } }] },
              ],
            }
          : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { organizationNode: { name: { contains: search, mode: 'insensitive' } } },
                { costCenter: { name: { contains: search, mode: 'insensitive' } } },
                { position: { title: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ status: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      include: this.coverageRuleInclude,
    });

    return this.paginate(rules, limit);
  }

  async createCoverageRule(actor: AuthenticatedPrincipal, dto: CreateCoverageRuleDto) {
    const tenantId = this.requireTenant(actor);
    this.assertCoverageRuleHasOperationalScope(dto);
    this.assertCoverageTimes(dto.startsAtTime, dto.endsAtTime);
    this.assertCoverageHeadcount(dto.requiredHeadcount, dto.minimumHeadcount);

    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.scheduleCoverageRule.create({
        data: {
          tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description,
          policyId: dto.policyId,
          shiftId: dto.shiftId,
          organizationNodeId: dto.organizationNodeId,
          costCenterId: dto.costCenterId,
          positionId: dto.positionId,
          weekdays: [...new Set(dto.weekdays)].sort((left, right) => left - right),
          startsAtTime: dto.startsAtTime,
          endsAtTime: dto.endsAtTime,
          timezone: dto.timezone,
          locationName: dto.locationName,
          requiredHeadcount: dto.requiredHeadcount ?? 1,
          minimumHeadcount: dto.minimumHeadcount ?? dto.requiredHeadcount ?? 1,
          effectiveFrom: dto.effectiveFrom ? this.startOfDay(this.toDate(dto.effectiveFrom)) : undefined,
          effectiveTo: dto.effectiveTo ? this.startOfDay(this.toDate(dto.effectiveTo)) : undefined,
          status: dto.status ?? ScheduleCoverageRuleStatus.DRAFT,
          createdById: actor.id,
          metadata: this.toJson(dto.metadata),
        },
        include: this.coverageRuleInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'scheduling.coverage_rule', rule.id, null, rule);
      await this.writeOutbox(tx, tenantId, 'schedule.coverage_rule.created', 'ScheduleCoverageRule', rule.id, {
        code: rule.code,
        status: rule.status,
        requiredHeadcount: rule.requiredHeadcount,
      });
      return rule;
    });
  }

  async updateCoverageRule(actor: AuthenticatedPrincipal, ruleId: string, dto: UpdateCoverageRuleDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.findCoverageRuleOrThrow(tenantId, ruleId);
    const nextScope = { ...before, ...dto };
    this.assertCoverageRuleHasOperationalScope(nextScope);
    this.assertCoverageTimes(dto.startsAtTime ?? before.startsAtTime ?? undefined, dto.endsAtTime ?? before.endsAtTime ?? undefined);
    this.assertCoverageHeadcount(
      dto.requiredHeadcount ?? before.requiredHeadcount,
      dto.minimumHeadcount ?? before.minimumHeadcount,
    );

    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.scheduleCoverageRule.update({
        where: { id: ruleId },
        data: {
          code: dto.code ? dto.code.trim().toUpperCase() : undefined,
          name: dto.name?.trim(),
          description: dto.description,
          policyId: dto.policyId,
          shiftId: dto.shiftId,
          organizationNodeId: dto.organizationNodeId,
          costCenterId: dto.costCenterId,
          positionId: dto.positionId,
          weekdays: dto.weekdays ? [...new Set(dto.weekdays)].sort((left, right) => left - right) : undefined,
          startsAtTime: dto.startsAtTime,
          endsAtTime: dto.endsAtTime,
          timezone: dto.timezone,
          locationName: dto.locationName,
          requiredHeadcount: dto.requiredHeadcount,
          minimumHeadcount: dto.minimumHeadcount,
          effectiveFrom: dto.effectiveFrom ? this.startOfDay(this.toDate(dto.effectiveFrom)) : undefined,
          effectiveTo: dto.effectiveTo ? this.startOfDay(this.toDate(dto.effectiveTo)) : undefined,
          status: dto.status,
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
        include: this.coverageRuleInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'scheduling.coverage_rule', rule.id, before, rule);
      await this.writeOutbox(tx, tenantId, 'schedule.coverage_rule.updated', 'ScheduleCoverageRule', rule.id, {
        code: rule.code,
        status: rule.status,
        requiredHeadcount: rule.requiredHeadcount,
      });
      return rule;
    });
  }

  async listPeriods(actor: AuthenticatedPrincipal, query: ListSchedulingQueryDto) {
    const tenantId = this.requireTenant(actor);
    const { from, to } = this.range(query);

    return this.prisma.schedulePeriod.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(from || to
          ? {
              startsOn: { lte: to ?? undefined },
              endsOn: { gte: from ?? undefined },
            }
          : {}),
      },
      take: query.limit ?? 50,
      orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createPeriod(actor: AuthenticatedPrincipal, dto: CreateSchedulePeriodDto) {
    const tenantId = this.requireTenant(actor);
    const startsOn = this.toDate(dto.startsOn);
    const endsOn = this.toDate(dto.endsOn);
    if (endsOn <= startsOn) {
      throw new BadRequestException('Schedule period end must be after start.');
    }

    return this.prisma.schedulePeriod.create({
      data: {
        tenantId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        startsOn,
        endsOn,
        timezone: dto.timezone,
        status: dto.status ?? ScheduleStatus.DRAFT,
        createdById: actor.id,
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  async publishPeriod(actor: AuthenticatedPrincipal, periodId: string) {
    const tenantId = this.requireTenant(actor);
    const period = await this.findPeriodOrThrow(tenantId, periodId);

    if (period.status === ScheduleStatus.LOCKED) {
      throw new BadRequestException('This schedule period is already locked.');
    }
    if (period.status === ScheduleStatus.ARCHIVED) {
      throw new BadRequestException('Archived schedule periods cannot be published.');
    }

    return this.prisma.schedulePeriod.update({
      where: { id: periodId },
      data: {
        status: ScheduleStatus.PUBLISHED,
        publishedById: actor.id,
        publishedAt: new Date(),
      },
    });
  }

  async lockPeriod(actor: AuthenticatedPrincipal, periodId: string, dto: LockSchedulePeriodDto) {
    const tenantId = this.requireTenant(actor);
    const period = await this.findPeriodOrThrow(tenantId, periodId);

    if (period.status === ScheduleStatus.ARCHIVED) {
      throw new BadRequestException('Archived schedule periods cannot be locked.');
    }
    if (period.status === ScheduleStatus.LOCKED) {
      return period;
    }

    return this.prisma.schedulePeriod.update({
      where: { id: periodId },
      data: {
        status: ScheduleStatus.LOCKED,
        lockedAt: new Date(),
        metadata: this.toJson({
          ...(this.jsonObject(period.metadata) ?? {}),
          lockNote: dto.note?.trim() || undefined,
          lockedById: actor.id,
          lockedAt: new Date().toISOString(),
        }),
      },
    });
  }

  async listAssignments(actor: AuthenticatedPrincipal, query: ListScheduleAssignmentsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const { from, to } = this.range(query);
    const limit = query.limit ?? 50;
    const andFilters = [
      this.assignmentEmployeeSearchWhere(query.employeeSearch),
    ].filter(Boolean) as Prisma.ScheduleAssignmentWhereInput[];

    const assignments = await this.prisma.scheduleAssignment.findMany({
      where: {
        tenantId,
        ...this.assignmentDimensionWhere(query),
        AND: andFilters.length > 0 ? andFilters : undefined,
        employeeId: query.employeeId,
        scheduleId: query.scheduleId,
        status: query.status,
        ...(from || to ? { startsAt: { gte: from ?? undefined, lte: to ?? undefined } } : {}),
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: this.assignmentInclude,
    });

    return this.paginate(assignments, limit);
  }

  async getAssignment(actor: AuthenticatedPrincipal, assignmentId: string) {
    const tenantId = this.requireTenant(actor);
    const assignment = await this.findAssignmentOrThrow(tenantId, assignmentId);

    if (this.canManageSchedules(actor)) {
      await this.assertCanManageAssignment(actor, tenantId, assignment.employeeId);
      return assignment;
    }

    const employee = await this.getSelfEmployeeOrThrow(actor);
    if (assignment.employeeId !== employee.id) {
      throw new ForbiddenException('This schedule assignment is outside your employee record.');
    }

    return assignment;
  }

  async createAssignment(actor: AuthenticatedPrincipal, dto: CreateScheduleAssignmentDto) {
    const tenantId = this.requireTenant(actor);
    return this.createAssignmentForScope(actor, tenantId, dto, ScheduleAssignmentSource.HR_MANAGER);
  }

  async createTeamAssignment(actor: AuthenticatedPrincipal, dto: CreateScheduleAssignmentDto) {
    const tenantId = this.requireTenant(actor);
    const manager = await this.getSelfEmployeeOrThrow(actor);
    await this.assertReportingScopeMember(tenantId, manager.id, dto.employeeId);
    return this.createAssignmentForScope(actor, tenantId, dto, ScheduleAssignmentSource.MANAGER);
  }

  async createBulkAssignments(actor: AuthenticatedPrincipal, dto: BulkCreateScheduleAssignmentsDto) {
    const tenantId = this.requireTenant(actor);
    return this.createBulkAssignmentsForScope(actor, tenantId, dto, ScheduleAssignmentSource.HR_MANAGER);
  }

  async createTeamBulkAssignments(actor: AuthenticatedPrincipal, dto: BulkCreateScheduleAssignmentsDto) {
    const tenantId = this.requireTenant(actor);
    const manager = await this.getSelfEmployeeOrThrow(actor);

    for (const employeeId of dto.employeeIds) {
      await this.assertReportingScopeMember(tenantId, manager.id, employeeId);
    }

    return this.createBulkAssignmentsForScope(actor, tenantId, dto, ScheduleAssignmentSource.MANAGER);
  }

  async updateAssignment(
    actor: AuthenticatedPrincipal,
    assignmentId: string,
    dto: UpdateScheduleAssignmentDto,
  ) {
    const tenantId = this.requireTenant(actor);
    this.assertCanManageSchedules(actor);
    const before = await this.findAssignmentOrThrow(tenantId, assignmentId);
    await this.assertCanManageAssignment(actor, tenantId, before.employeeId);

    const nextEmployeeId = dto.employeeId ?? before.employeeId;
    if (nextEmployeeId !== before.employeeId) {
      await this.assertCanManageAssignment(actor, tenantId, nextEmployeeId);
    }

    const changesWorkShape = Boolean(dto.employeeId || dto.shiftId || dto.workDate || dto.startsAt || dto.endsAt);
    if (LOCKED_ASSIGNMENT_STATUSES.includes(before.status) && changesWorkShape) {
      throw new BadRequestException('Completed, declined, cancelled, or no-show assignments cannot be rescheduled.');
    }

    return this.prisma.$transaction(async (tx) => {
      const employee = await this.findEmployeeOrThrow(tenantId, nextEmployeeId, tx);
      const policy = await this.ensureActivePolicy(tenantId, dto.policyId ?? before.policyId ?? undefined, tx);
      const shiftId = dto.shiftId ?? before.shiftId ?? undefined;
      const shift = shiftId ? await this.findShiftOrThrow(tenantId, shiftId, tx) : null;
      const startsAt = dto.startsAt ? this.toDate(dto.startsAt) : before.startsAt;
      const endsAt = dto.endsAt ? this.toDate(dto.endsAt) : before.endsAt;
      this.assertValidTimeWindow(startsAt, endsAt);
      await this.assertSchedulePeriodWritable(tx, tenantId, before.scheduleId ?? undefined);
      await this.assertSchedulePeriodWritable(tx, tenantId, dto.scheduleId ?? before.scheduleId ?? undefined);
      await this.assertNoHardConflict(tx, tenantId, employee.id, startsAt, endsAt, assignmentId);

      const breakMinutes = dto.breakMinutes ?? shift?.breakMinutes ?? before.breakMinutes;
      const overtimeMinutes = shift?.isOvertimeEligible === false
        ? 0
        : await this.calculateOvertimeMinutes(
            tx,
            tenantId,
            employee.id,
            startsAt,
            endsAt,
            breakMinutes,
            policy,
            assignmentId,
          );

      const assignment = await tx.scheduleAssignment.update({
        where: { id: assignmentId },
        data: {
          scheduleId: dto.scheduleId,
          employeeId: employee.id,
          shiftId,
          policyId: policy.id,
          organizationNodeId: dto.organizationNodeId,
          costCenterId: dto.costCenterId,
          positionId: dto.positionId,
          managerEmployeeId: dto.managerEmployeeId,
          workDate: dto.workDate ? this.startOfDay(this.toDate(dto.workDate)) : before.workDate,
          startsAt,
          endsAt,
          breakMinutes,
          timezone: dto.timezone ?? shift?.timezone ?? policy.timezone ?? before.timezone,
          locationName: dto.locationName,
          isOpenShift: dto.isOpenShift,
          isOvertime: dto.isOvertime ?? overtimeMinutes > 0,
          overtimeMinutes,
          notes: dto.notes,
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
        include: this.assignmentInclude,
      });

      await this.writeTimeline(tx, actor, tenantId, employee.id, TimelineEventType.SCHEDULE_ASSIGNED, {
        title: 'Schedule assignment updated',
        description: `${employee.employeeNumber} schedule was updated for ${assignment.workDate.toISOString().slice(0, 10)}.`,
        entityType: 'ScheduleAssignment',
        entityId: assignment.id,
      });
      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'scheduling.assignment',
        assignment.id,
        before,
        assignment,
      );
      await this.writeOutbox(tx, tenantId, 'schedule.assignment.updated', 'ScheduleAssignment', assignment.id, {
        employeeId: employee.id,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        overtimeMinutes,
      });

      return assignment;
    });
  }

  async listTeamAssignments(actor: AuthenticatedPrincipal, query: ListScheduleAssignmentsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const manager = await this.getSelfEmployeeOrThrow(actor);
    const { from, to } = this.range(query);
    const limit = query.limit ?? 50;
    const andFilters = [
      {
        employee: {
          assignments: {
            some: {
              isPrimary: true,
              effectiveFrom: { lte: new Date() },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
              AND: [this.reportingScopeWhere(manager.id)],
            },
          },
        },
      },
      this.assignmentEmployeeSearchWhere(query.employeeSearch),
    ].filter(Boolean) as Prisma.ScheduleAssignmentWhereInput[];

    const assignments = await this.prisma.scheduleAssignment.findMany({
      where: {
        tenantId,
        ...this.assignmentDimensionWhere(query),
        employeeId: query.employeeId,
        scheduleId: query.scheduleId,
        status: query.status,
        AND: andFilters,
        ...(from || to ? { startsAt: { gte: from ?? undefined, lte: to ?? undefined } } : {}),
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: this.assignmentInclude,
    });

    return this.paginate(assignments, limit);
  }

  async listTeamEmployees(actor: AuthenticatedPrincipal, query: ListSchedulableEmployeesQueryDto) {
    const tenantId = this.requireTenant(actor);
    const manager = await this.getSelfEmployeeOrThrow(actor);
    const limit = query.limit ?? 40;
    const now = new Date();
    const search = this.employeeSearchWhere(query.employeeSearch);

    return this.prisma.employee.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: query.status ?? { in: [EmployeeStatus.ACTIVE, EmployeeStatus.PROBATION, EmployeeStatus.PREBOARDING] },
        AND: [search].filter(Boolean) as Prisma.EmployeeWhereInput[],
        assignments: {
          some: {
            ...this.currentPrimaryAssignmentWhere(now, {
              ...this.employeeCandidateDimensionWhere(query),
              AND: [this.reportingScopeWhere(manager.id)],
            }),
          },
        },
      },
      orderBy: [{ person: { firstName: 'asc' } }, { employeeNumber: 'asc' }],
      take: limit,
      include: this.employeeCandidateInclude(now),
    });
  }

  async createSelfAssignment(actor: AuthenticatedPrincipal, dto: Omit<CreateScheduleAssignmentDto, 'employeeId'>) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.getSelfEmployeeOrThrow(actor);
    const policy = await this.ensureActivePolicy(tenantId, dto.policyId);

    if (!policy.allowSelfScheduling) {
      throw new ForbiddenException('Self scheduling is not enabled for this workplace.');
    }

    return this.createAssignmentForScope(
      actor,
      tenantId,
      { ...dto, employeeId: employee.id },
      ScheduleAssignmentSource.SELF_SERVICE,
    );
  }

  async updateAssignmentStatus(
    actor: AuthenticatedPrincipal,
    assignmentId: string,
    dto: UpdateScheduleAssignmentStatusDto,
  ) {
    const tenantId = this.requireTenant(actor);
    const before = await this.findAssignmentOrThrow(tenantId, assignmentId);
    if (this.canManageSchedules(actor)) {
      await this.assertCanManageAssignment(actor, tenantId, before.employeeId);
    } else {
      const employee = await this.getSelfEmployeeOrThrow(actor);
      if (employee.id !== before.employeeId) {
        throw new ForbiddenException('You can only update your own schedule assignment.');
      }
      const selfServiceStatuses: ScheduleAssignmentStatus[] = [
        ScheduleAssignmentStatus.CONFIRMED,
        ScheduleAssignmentStatus.DECLINED,
      ];
      if (!selfServiceStatuses.includes(dto.status)) {
        throw new ForbiddenException('This status change requires a scheduler or manager.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertSchedulePeriodWritable(tx, tenantId, before.scheduleId ?? undefined);
      const assignment = await tx.scheduleAssignment.update({
        where: { id: assignmentId },
        data: {
          status: dto.status,
          notes: dto.note ?? undefined,
          confirmedAt: dto.status === ScheduleAssignmentStatus.CONFIRMED ? new Date() : undefined,
          cancelledAt: dto.status === ScheduleAssignmentStatus.CANCELLED ? new Date() : undefined,
        },
        include: this.assignmentInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'scheduling.assignment',
        assignment.id,
        before,
        assignment,
      );
      return assignment;
    });
  }

  async unassignAssignment(
    actor: AuthenticatedPrincipal,
    assignmentId: string,
    dto: UnassignScheduleAssignmentDto,
  ) {
    const tenantId = this.requireTenant(actor);
    this.assertCanManageSchedules(actor);
    const before = await this.findAssignmentOrThrow(tenantId, assignmentId);
    await this.assertCanManageAssignment(actor, tenantId, before.employeeId);
    const mode = dto.mode ?? ScheduleUnassignmentMode.CANCEL_ONLY;
    const reason = dto.reason?.trim();

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.scheduleAssignment.update({
        where: { id: assignmentId },
        data: {
          status: ScheduleAssignmentStatus.CANCELLED,
          cancelledAt: new Date(),
          notes: reason ?? before.notes,
          metadata: this.toJson({
            ...(this.jsonObject(before.metadata) ?? {}),
            unassignmentMode: mode,
            unassignmentReason: reason,
            unassignedById: actor.id,
            unassignedAt: new Date().toISOString(),
          }),
        },
        include: this.assignmentInclude,
      });

      const existingClaim = await tx.openShiftClaim.findFirst({
        where: { assignmentId },
        include: { openShift: true },
      });
      let returnedOpenShift: OpenShift | null = null;

      if (existingClaim) {
        const openShift = existingClaim.openShift;
        const nextClaimed = Math.max(0, openShift.claimedHeadcount - 1);
        const nextRequired =
          mode === ScheduleUnassignmentMode.CANCEL_ONLY
            ? Math.max(0, openShift.requiredHeadcount - 1)
            : openShift.requiredHeadcount;
        const nextStatus =
          mode === ScheduleUnassignmentMode.RETURN_TO_OPEN_SHIFT
            ? OpenShiftStatus.OPEN
            : nextRequired === 0
              ? OpenShiftStatus.CANCELLED
              : nextClaimed >= nextRequired
                ? OpenShiftStatus.CLAIMED
                : OpenShiftStatus.OPEN;

        await tx.openShiftClaim.update({
          where: { id: existingClaim.id },
          data: {
            status: OpenShiftClaimStatus.CANCELLED,
            note: reason,
            decidedAt: new Date(),
            decidedById: actor.id,
          },
        });

        returnedOpenShift = await tx.openShift.update({
          where: { id: openShift.id },
          data: {
            claimedHeadcount: nextClaimed,
            requiredHeadcount: Math.max(1, nextRequired),
            status: nextStatus,
          },
          include: this.openShiftInclude,
        });
      } else if (mode === ScheduleUnassignmentMode.RETURN_TO_OPEN_SHIFT) {
        returnedOpenShift = await tx.openShift.create({
          data: {
            tenantId,
            scheduleId: before.scheduleId,
            shiftId: before.shiftId,
            policyId: before.policyId,
            organizationNodeId: before.organizationNodeId,
            costCenterId: before.costCenterId,
            positionId: before.positionId,
            workDate: before.workDate,
            startsAt: before.startsAt,
            endsAt: before.endsAt,
            breakMinutes: before.breakMinutes,
            timezone: before.timezone,
            locationName: before.locationName,
            requiredHeadcount: 1,
            claimedHeadcount: 0,
            status: OpenShiftStatus.OPEN,
            pickupRequiresApproval: true,
            publishedAt: new Date(),
            createdById: actor.id,
            notes: reason ?? `Returned from cancelled assignment ${before.id}.`,
            metadata: this.toJson({
              returnedFromAssignmentId: before.id,
              returnedById: actor.id,
            }),
          },
          include: this.openShiftInclude,
        });
      }

      await this.writeTimeline(tx, actor, tenantId, before.employeeId, TimelineEventType.SCHEDULE_ASSIGNED, {
        title: mode === ScheduleUnassignmentMode.RETURN_TO_OPEN_SHIFT ? 'Shift returned to open coverage' : 'Shift unassigned',
        description: reason ?? 'The employee was removed from this scheduled work.',
        entityType: 'ScheduleAssignment',
        entityId: assignment.id,
      });
      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'scheduling.assignment',
        assignment.id,
        before,
        { assignment, returnedOpenShift },
      );
      await this.writeOutbox(tx, tenantId, 'schedule.assignment.unassigned', 'ScheduleAssignment', assignment.id, {
        employeeId: before.employeeId,
        mode,
        openShiftId: returnedOpenShift?.id,
      });

      return { assignment, openShift: returnedOpenShift };
    });
  }

  async confirmMyAssignment(actor: AuthenticatedPrincipal, assignmentId: string) {
    const employee = await this.getSelfEmployeeOrThrow(actor);
    const assignment = await this.findAssignmentOrThrow(employee.tenantId, assignmentId);
    if (assignment.employeeId !== employee.id) {
      throw new ForbiddenException('You can only confirm your own schedule assignment.');
    }
    return this.updateAssignmentStatus(actor, assignmentId, {
      status: ScheduleAssignmentStatus.CONFIRMED,
    });
  }

  async listOpenShifts(actor: AuthenticatedPrincipal, query: ListOpenShiftsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const { from, to } = this.range(query);
    const limit = query.limit ?? 50;
    const include = await this.openShiftIncludeForActor(actor);
    const visibilityWhere = await this.openShiftVisibilityWhere(actor);
    const dimensionWhere = this.openShiftDimensionWhere(query);
    const andFilters = [visibilityWhere, dimensionWhere].filter(Boolean) as Prisma.OpenShiftWhereInput[];

    const openShifts = await this.prisma.openShift.findMany({
      where: {
        tenantId,
        AND: andFilters.length > 0 ? andFilters : undefined,
        status: query.status,
        ...(from || to ? { startsAt: { gte: from ?? undefined, lte: to ?? undefined } } : {}),
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include,
    });

    return this.paginate(openShifts, limit);
  }

  async getOpenShift(actor: AuthenticatedPrincipal, openShiftId: string) {
    const tenantId = this.requireTenant(actor);
    const include = await this.openShiftIncludeForActor(actor);
    const openShift = await this.prisma.openShift.findFirst({
      where: { id: openShiftId, tenantId },
      include,
    });

    if (!openShift) {
      throw new NotFoundException('Open shift not found.');
    }

    if (this.canManageSchedules(actor)) {
      await this.assertCanManageOpenShiftScope(actor, tenantId, openShift);
      return openShift;
    }

    const visibilityWhere = await this.openShiftVisibilityWhere(actor);
    const visible = await this.prisma.openShift.findFirst({
      where: {
        id: openShiftId,
        tenantId,
        AND: visibilityWhere ? [visibilityWhere] : undefined,
      },
      select: { id: true },
    });

    if (!visible) {
      throw new ForbiddenException('This open shift is outside your current work scope.');
    }

    return openShift;
  }

  async listEligibleEmployeesForOpenShift(
    actor: AuthenticatedPrincipal,
    openShiftId: string,
    query: ListOpenShiftEligibleEmployeesQueryDto,
  ) {
    const tenantId = this.requireTenant(actor);
    this.assertCanManageSchedules(actor);
    const openShift = await this.findOpenShiftOrThrow(this.prisma, tenantId, openShiftId);
    await this.assertCanManageOpenShiftScope(actor, tenantId, openShift);
    this.assertOpenShiftHasTarget(openShift);
    this.assertOpenShiftClaimable(openShift);

    const limit = query.limit ?? 50;
    const now = new Date();
    const activeAssignmentFilters: Prisma.EmployeeAssignmentWhereInput[] = [
      {
        tenantId,
        isPrimary: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        organizationNodeId: openShift.organizationNodeId ?? undefined,
        costCenterId: openShift.costCenterId ?? undefined,
        positionId: openShift.positionId ?? undefined,
      },
    ];

    if (!actor.permissions.includes('scheduling.write')) {
      const manager = await this.getSelfEmployeeOrThrow(actor);
      activeAssignmentFilters.push({
        OR: [
          { employeeId: manager.id },
          this.reportingScopeWhere(manager.id),
        ],
      });
    }

    const employeeFilters: Prisma.EmployeeWhereInput[] = [
      {
        tenantId,
        deletedAt: null,
        status: {
          in: [
            EmployeeStatus.PREBOARDING,
            EmployeeStatus.ACTIVE,
            EmployeeStatus.PROBATION,
          ],
        },
        assignments: {
          some: {
            AND: activeAssignmentFilters,
          },
        },
        scheduleAssignments: {
          none: {
            tenantId,
            status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
            startsAt: { lt: openShift.endsAt },
            endsAt: { gt: openShift.startsAt },
          },
        },
        employeeAvailabilities: {
          none: {
            tenantId,
            status: EmployeeAvailabilityStatus.UNAVAILABLE,
            date: this.startOfDay(openShift.startsAt),
            OR: [
              { startsAt: null },
              { endsAt: null },
              {
                startsAt: { lt: openShift.endsAt },
                endsAt: { gt: openShift.startsAt },
              },
            ],
          },
        },
        openShiftClaims: {
          none: {
            tenantId,
            openShiftId,
            status: {
              in: [
                OpenShiftClaimStatus.REQUESTED,
                OpenShiftClaimStatus.APPROVED,
              ],
            },
          },
        },
      },
    ];
    const employeeSearch = this.employeeSearchWhere(query.employeeSearch);
    if (employeeSearch) {
      employeeFilters.push(employeeSearch);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        AND: employeeFilters,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ person: { firstName: 'asc' } }, { employeeNumber: 'asc' }, { id: 'asc' }],
      include: {
        person: true,
        assignments: {
          where: {
            isPrimary: true,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          include: {
            organizationNode: true,
            costCenter: true,
            position: true,
          },
        },
      },
    });

    return this.paginate(employees, limit);
  }

  async createOpenShift(actor: AuthenticatedPrincipal, dto: CreateOpenShiftDto) {
    const tenantId = this.requireTenant(actor);
    this.assertOpenShiftHasTarget(dto);
    await this.assertCanManageOpenShiftScope(actor, tenantId, dto);
    await this.assertSchedulePeriodWritable(this.prisma, tenantId, dto.scheduleId);
    const policy = await this.ensureActivePolicy(tenantId, dto.policyId);
    const shift = dto.shiftId ? await this.findShiftOrThrow(tenantId, dto.shiftId) : null;
    const startsAt = this.toDate(dto.startsAt);
    const endsAt = this.toDate(dto.endsAt);
    this.assertValidTimeWindow(startsAt, endsAt);

    return this.prisma.openShift.create({
      data: {
        tenantId,
        scheduleId: dto.scheduleId,
        shiftId: dto.shiftId,
        policyId: policy.id,
        organizationNodeId: dto.organizationNodeId,
        costCenterId: dto.costCenterId,
        positionId: dto.positionId,
        workDate: this.startOfDay(this.toDate(dto.workDate)),
        startsAt,
        endsAt,
        breakMinutes: dto.breakMinutes ?? shift?.breakMinutes ?? 0,
        timezone: dto.timezone ?? shift?.timezone ?? policy.timezone,
        locationName: dto.locationName,
        requiredHeadcount: dto.requiredHeadcount ?? shift?.minHeadcount ?? 1,
        pickupRequiresApproval: dto.pickupRequiresApproval ?? true,
        publishedAt: new Date(),
        expiresAt: dto.expiresAt ? this.toDate(dto.expiresAt) : undefined,
        createdById: actor.id,
        notes: dto.notes,
        metadata: this.toJson(dto.metadata),
      },
      include: this.openShiftInclude,
    });
  }

  async updateOpenShift(actor: AuthenticatedPrincipal, openShiftId: string, dto: UpdateOpenShiftDto) {
    const tenantId = this.requireTenant(actor);
    this.assertCanManageSchedules(actor);

    return this.prisma.$transaction(async (tx) => {
      const before = await this.findOpenShiftOrThrow(tx, tenantId, openShiftId);
      const nextScope = { ...before, ...dto };
      this.assertOpenShiftHasTarget(nextScope);
      await this.assertCanManageOpenShiftScope(actor, tenantId, before);
      await this.assertCanManageOpenShiftScope(actor, tenantId, nextScope);
      await this.assertSchedulePeriodWritable(tx, tenantId, before.scheduleId ?? undefined);
      await this.assertSchedulePeriodWritable(tx, tenantId, dto.scheduleId ?? before.scheduleId ?? undefined);
      if (
        before.claimedHeadcount > 0 &&
        (dto.shiftId || dto.workDate || dto.startsAt || dto.endsAt || dto.organizationNodeId || dto.costCenterId || dto.positionId)
      ) {
        throw new BadRequestException(
          'This open shift already has approved or pending coverage. Cancel or unassign claims before changing work details.',
        );
      }

      const policy = await this.ensureActivePolicy(tenantId, dto.policyId ?? before.policyId ?? undefined, tx);
      const shiftId = dto.shiftId ?? before.shiftId ?? undefined;
      const shift = shiftId ? await this.findShiftOrThrow(tenantId, shiftId, tx) : null;
      const startsAt = dto.startsAt ? this.toDate(dto.startsAt) : before.startsAt;
      const endsAt = dto.endsAt ? this.toDate(dto.endsAt) : before.endsAt;
      this.assertValidTimeWindow(startsAt, endsAt);
      const requiredHeadcount = dto.requiredHeadcount ?? before.requiredHeadcount;
      if (requiredHeadcount < before.claimedHeadcount) {
        throw new BadRequestException('Required headcount cannot be lower than the number of claimed slots.');
      }
      if (dto.status === OpenShiftStatus.CLAIMED && before.claimedHeadcount < requiredHeadcount) {
        throw new BadRequestException('Only fully claimed open shifts can be marked as claimed.');
      }

      const openShift = await tx.openShift.update({
        where: { id: openShiftId },
        data: {
          scheduleId: dto.scheduleId,
          shiftId,
          policyId: policy.id,
          organizationNodeId: dto.organizationNodeId,
          costCenterId: dto.costCenterId,
          positionId: dto.positionId,
          workDate: dto.workDate ? this.startOfDay(this.toDate(dto.workDate)) : before.workDate,
          startsAt,
          endsAt,
          breakMinutes: dto.breakMinutes ?? shift?.breakMinutes ?? before.breakMinutes,
          timezone: dto.timezone ?? shift?.timezone ?? policy.timezone ?? before.timezone,
          locationName: dto.locationName,
          requiredHeadcount,
          pickupRequiresApproval: dto.pickupRequiresApproval,
          expiresAt: dto.expiresAt ? this.toDate(dto.expiresAt) : undefined,
          status: dto.status,
          notes: dto.notes,
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
        include: this.openShiftInclude,
      });

      if (dto.status === OpenShiftStatus.CANCELLED || dto.status === OpenShiftStatus.EXPIRED) {
        await tx.openShiftClaim.updateMany({
          where: {
            tenantId,
            openShiftId,
            status: OpenShiftClaimStatus.REQUESTED,
          },
          data: {
            status: OpenShiftClaimStatus.CANCELLED,
            note: dto.notes ?? 'Open shift is no longer available.',
            decidedAt: new Date(),
            decidedById: actor.id,
          },
        });
      }

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'scheduling.open_shift', openShift.id, before, openShift);
      await this.writeOutbox(tx, tenantId, 'schedule.open_shift.updated', 'OpenShift', openShift.id, {
        status: openShift.status,
        startsAt: openShift.startsAt.toISOString(),
        endsAt: openShift.endsAt.toISOString(),
        requiredHeadcount: openShift.requiredHeadcount,
        claimedHeadcount: openShift.claimedHeadcount,
      });

      return openShift;
    });
  }

  async assignOpenShift(actor: AuthenticatedPrincipal, openShiftId: string, dto: AssignOpenShiftDto) {
    const tenantId = this.requireTenant(actor);
    this.assertCanManageSchedules(actor);
    const employee = await this.findEmployeeOrThrow(tenantId, dto.employeeId);
    await this.assertCanManageAssignment(actor, tenantId, employee.id);
    const note = dto.note?.trim();

    return this.prisma.$transaction(async (tx) => {
      const openShift = await this.findOpenShiftOrThrow(tx, tenantId, openShiftId);
      await this.assertCanManageOpenShiftScope(actor, tenantId, openShift);
      await this.assertEmployeeEligibleForOpenShift(tx, tenantId, employee.id, openShift);
      this.assertOpenShiftClaimable(openShift);
      const existingClaim = await tx.openShiftClaim.findUnique({
        where: {
          openShiftId_employeeId: {
            openShiftId,
            employeeId: employee.id,
          },
        },
        include: { assignment: true },
      });

      if (
        existingClaim?.assignment &&
        !LOCKED_ASSIGNMENT_STATUSES.includes(existingClaim.assignment.status)
      ) {
        throw new ConflictException('This employee already has active coverage for this open shift.');
      }

      const claim = existingClaim
        ? await tx.openShiftClaim.update({
            where: { id: existingClaim.id },
            data: {
              status: OpenShiftClaimStatus.APPROVED,
              note,
              decidedAt: new Date(),
              decidedById: actor.id,
              assignmentId: null,
            },
          })
        : await tx.openShiftClaim.create({
            data: {
              tenantId,
              openShiftId,
              employeeId: employee.id,
              userId: employee.userId,
              status: OpenShiftClaimStatus.APPROVED,
              note,
              decidedAt: new Date(),
              decidedById: actor.id,
            },
          });

      const assignment = await this.createAssignmentFromOpenShift(tx, actor, openShift, employee.id, claim.id);
      const updatedClaim = await tx.openShiftClaim.findUnique({
        where: { id: claim.id },
        include: this.claimInclude,
      });

      await this.writeTimeline(tx, actor, tenantId, employee.id, TimelineEventType.OPEN_SHIFT_CLAIMED, {
        title: 'Open shift assigned',
        description: `${employee.employeeNumber} was assigned to open work on ${openShift.workDate.toISOString().slice(0, 10)}.`,
        entityType: 'OpenShiftClaim',
        entityId: claim.id,
      });
      await this.writeOutbox(tx, tenantId, 'schedule.open_shift.direct_assigned', 'OpenShiftClaim', claim.id, {
        openShiftId,
        employeeId: employee.id,
        assignmentId: assignment.id,
      });

      return { claim: updatedClaim, assignment };
    });
  }

  async claimOpenShift(actor: AuthenticatedPrincipal, openShiftId: string) {
    const tenantId = this.requireTenant(actor);
    const employee = await this.getSelfEmployeeOrThrow(actor);
    const policy = await this.ensureActivePolicy(tenantId);

    if (!policy.allowOpenShiftPickup) {
      throw new ForbiddenException('Open shift pickup is not enabled for this workplace.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const openShift = await this.findOpenShiftOrThrow(tx, tenantId, openShiftId);
        this.assertOpenShiftClaimable(openShift);
        await this.assertEmployeeEligibleForOpenShift(tx, tenantId, employee.id, openShift);
        const existingClaim = await tx.openShiftClaim.findUnique({
          where: {
            openShiftId_employeeId: {
              openShiftId,
              employeeId: employee.id,
            },
          },
        });

        if (existingClaim) {
          throw this.openShiftClaimConflict(existingClaim.status);
        }

        const claimStatus = openShift.pickupRequiresApproval
          ? OpenShiftClaimStatus.REQUESTED
          : OpenShiftClaimStatus.APPROVED;

        const claim = await tx.openShiftClaim.create({
          data: {
            tenantId,
            openShiftId,
            employeeId: employee.id,
            userId: actor.id,
            status: claimStatus,
            decidedAt: claimStatus === OpenShiftClaimStatus.APPROVED ? new Date() : undefined,
            decidedById: claimStatus === OpenShiftClaimStatus.APPROVED ? actor.id : undefined,
          },
          include: this.claimInclude,
        });

        let assignment: ScheduleAssignment | null = null;
        if (claimStatus === OpenShiftClaimStatus.APPROVED) {
          assignment = await this.createAssignmentFromOpenShift(tx, actor, openShift, employee.id, claim.id);
        }

        await this.writeTimeline(tx, actor, tenantId, employee.id, TimelineEventType.OPEN_SHIFT_CLAIMED, {
          title: claimStatus === OpenShiftClaimStatus.APPROVED ? 'Open shift picked up' : 'Open shift requested',
          description: `${employee.employeeNumber} requested an open shift on ${openShift.workDate.toISOString().slice(0, 10)}.`,
          entityType: 'OpenShiftClaim',
          entityId: claim.id,
        });

        await this.writeOutbox(tx, tenantId, 'schedule.open_shift.claimed', 'OpenShiftClaim', claim.id, {
          openShiftId,
          employeeId: employee.id,
          assignmentId: assignment?.id,
          status: claim.status,
        });

        return assignment ? { claim: { ...claim, assignment }, assignment } : { claim };
      });
    } catch (caught) {
      if (this.isUniqueConstraintError(caught, ['openShiftId', 'employeeId'])) {
        const existingClaim = await this.prisma.openShiftClaim.findUnique({
          where: {
            openShiftId_employeeId: {
              openShiftId,
              employeeId: employee.id,
            },
          },
        });

        throw this.openShiftClaimConflict(existingClaim?.status ?? OpenShiftClaimStatus.REQUESTED);
      }

      throw caught;
    }
  }

  async listOpenShiftClaims(actor: AuthenticatedPrincipal, query: ListOpenShiftClaimsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const { from, to } = this.range(query);
    const employeeScope = await this.employeeScopeWhere(actor);
    const openShiftVisibility = await this.openShiftVisibilityWhere(actor);
    const openShiftDimensions = this.openShiftDimensionWhere(query);
    const employeeSearch = this.employeeSearchWhere(query.employeeSearch);
    const limit = query.limit ?? 50;
    const search = query.search?.trim();
    const claimFilters: Prisma.OpenShiftClaimWhereInput[] = [];
    const openShiftFilters: Prisma.OpenShiftWhereInput[] = [];

    if (Object.keys(employeeScope).length > 0) {
      claimFilters.push(employeeScope);
    }
    if (query.employeeId) {
      claimFilters.push({ employeeId: query.employeeId });
    }
    if (employeeSearch) {
      claimFilters.push({ employee: employeeSearch });
    }
    if (openShiftVisibility) {
      openShiftFilters.push(openShiftVisibility);
    }
    if (this.hasScheduleDimensionFilter(query)) {
      openShiftFilters.push(openShiftDimensions);
    }
    if (from || to) {
      openShiftFilters.push({
        workDate: {
          gte: from ?? undefined,
          lte: to ?? undefined,
        },
      });
    }

    const claims = await this.prisma.openShiftClaim.findMany({
      where: {
        tenantId,
        AND: claimFilters.length > 0 ? claimFilters : undefined,
        status: query.status,
        openShift: openShiftFilters.length > 0 ? { AND: openShiftFilters } : undefined,
        ...(search
          ? {
              OR: [
                { employee: { employeeNumber: { contains: search, mode: 'insensitive' } } },
                { employee: { person: { firstName: { contains: search, mode: 'insensitive' } } } },
                { employee: { person: { lastName: { contains: search, mode: 'insensitive' } } } },
                { employee: { person: { preferredName: { contains: search, mode: 'insensitive' } } } },
                { openShift: { shift: { name: { contains: search, mode: 'insensitive' } } } },
                { openShift: { position: { title: { contains: search, mode: 'insensitive' } } } },
                { openShift: { organizationNode: { name: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      include: this.claimInclude,
    });

    return this.paginate(claims, limit);
  }

  async decideOpenShiftClaim(
    actor: AuthenticatedPrincipal,
    claimId: string,
    dto: DecideOpenShiftClaimDto,
  ) {
    const tenantId = this.requireTenant(actor);
    const canDecide =
      actor.permissions.includes('scheduling.write') ||
      actor.permissions.includes('scheduling.team.write');

    if (!canDecide) {
      throw new ForbiddenException('Only HR schedulers or managers can decide open-shift requests.');
    }

    if (dto.status === OpenShiftClaimStatus.REQUESTED) {
      throw new BadRequestException('Use approve, reject, or cancel for a claim decision.');
    }
    const decisionNote = dto.note?.trim();
    if (dto.status === OpenShiftClaimStatus.REJECTED && !decisionNote) {
      throw new BadRequestException('A rejection reason is required so the employee can understand the decision.');
    }
    const employeeScope = await this.employeeScopeWhere(actor);

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.openShiftClaim.findFirst({
        where: { id: claimId, tenantId, ...employeeScope },
        include: this.claimInclude,
      });
      if (!claim) {
        throw new NotFoundException('Open shift claim not found.');
      }

      let assignment: ScheduleAssignment | null = null;
      if (dto.status === OpenShiftClaimStatus.APPROVED && !claim.assignmentId) {
        const openShift = await this.findOpenShiftOrThrow(tx, tenantId, claim.openShiftId);
        this.assertOpenShiftClaimable(openShift);
        assignment = await this.createAssignmentFromOpenShift(tx, actor, openShift, claim.employeeId, claim.id);
      }

      const updated = await tx.openShiftClaim.update({
        where: { id: claimId },
        data: {
          status: dto.status,
          note: decisionNote,
          decidedAt: new Date(),
          decidedById: actor.id,
          assignmentId: assignment?.id,
        },
        include: this.claimInclude,
      });

      await this.writeTimeline(tx, actor, tenantId, claim.employeeId, TimelineEventType.OPEN_SHIFT_CLAIMED, {
        title: this.openShiftDecisionTitle(dto.status),
        description:
          dto.status === OpenShiftClaimStatus.REJECTED
            ? `Open shift pickup was rejected: ${decisionNote}`
            : `Open shift pickup was ${dto.status.toLowerCase()}.`,
        entityType: 'OpenShiftClaim',
        entityId: claim.id,
      });

      await this.writeOutbox(tx, tenantId, 'schedule.open_shift.claim_decided', 'OpenShiftClaim', claim.id, {
        openShiftId: claim.openShiftId,
        employeeId: claim.employeeId,
        assignmentId: assignment?.id ?? claim.assignmentId,
        status: dto.status,
        note: decisionNote,
      });

      return { claim: updated, assignment };
    });
  }

  async listOvertime(actor: AuthenticatedPrincipal, query: ListSchedulingQueryDto) {
    const tenantId = this.requireTenant(actor);
    const { from, to } = this.range(query);
    const employeeScope = await this.employeeScopeWhere(actor);
    const limit = query.limit ?? 50;

    const requests = await this.prisma.overtimeRequest.findMany({
      where: {
        tenantId,
        ...employeeScope,
        ...(from || to ? { requestDate: { gte: from ?? undefined, lte: to ?? undefined } } : {}),
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ requestDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      include: this.overtimeInclude,
    });

    return this.paginate(requests, limit);
  }

  async requestOvertime(actor: AuthenticatedPrincipal, dto: CreateOvertimeRequestDto) {
    const tenantId = this.requireTenant(actor);
    const selfOnly = !actor.permissions.includes('scheduling.write');
    const employee = dto.employeeId && !selfOnly
      ? await this.findEmployeeOrThrow(tenantId, dto.employeeId)
      : await this.getSelfEmployeeOrThrow(actor);
    const policy = await this.ensureActivePolicy(tenantId, dto.policyId);
    if (policy.overtimeMode === OvertimePolicyMode.DISABLED) {
      throw new BadRequestException('Overtime is disabled for this workplace policy.');
    }

    const startsAt = this.toDate(dto.startsAt);
    const endsAt = this.toDate(dto.endsAt);
    this.assertValidTimeWindow(startsAt, endsAt);
    const minutes = this.durationMinutes(startsAt, endsAt, 0);
    const status =
      policy.overtimeApprovalMode === OvertimeApprovalMode.NONE
        ? OvertimeRequestStatus.APPROVED
        : OvertimeRequestStatus.REQUESTED;

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.overtimeRequest.create({
        data: {
          tenantId,
          employeeId: employee.id,
          assignmentId: dto.assignmentId,
          policyId: policy.id,
          requestedById: actor.id,
          status,
          approvalMode: policy.overtimeApprovalMode,
          requestDate: this.startOfDay(this.toDate(dto.requestDate)),
          startsAt,
          endsAt,
          minutes,
          multiplier: policy.overtimeMultiplier,
          reason: dto.reason,
          metadata: this.toJson(dto.metadata),
          decidedAt: status === OvertimeRequestStatus.APPROVED ? new Date() : undefined,
          decidedById: status === OvertimeRequestStatus.APPROVED ? actor.id : undefined,
        },
        include: this.overtimeInclude,
      });

      await this.writeTimeline(tx, actor, tenantId, employee.id, TimelineEventType.OVERTIME_REQUESTED, {
        title: status === OvertimeRequestStatus.APPROVED ? 'Overtime approved' : 'Overtime requested',
        description: `${employee.employeeNumber} requested ${minutes} minutes of overtime.`,
        entityType: 'OvertimeRequest',
        entityId: request.id,
      });

      return request;
    });
  }

  async decideOvertime(actor: AuthenticatedPrincipal, requestId: string, dto: DecideOvertimeRequestDto) {
    const tenantId = this.requireTenant(actor);
    const request = await this.prisma.overtimeRequest.findFirst({
      where: { id: requestId, tenantId },
      include: this.overtimeInclude,
    });
    if (!request) {
      throw new NotFoundException('Overtime request not found.');
    }

    if (!actor.permissions.includes('scheduling.write')) {
      const manager = await this.getSelfEmployeeOrThrow(actor);
      await this.assertReportingScopeMember(tenantId, manager.id, request.employeeId);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.overtimeRequest.update({
        where: { id: requestId },
        data: {
          status: dto.status,
          decisionNote: dto.decisionNote,
          decidedAt: new Date(),
          decidedById: actor.id,
        },
        include: this.overtimeInclude,
      });

      if (dto.status === OvertimeRequestStatus.APPROVED) {
        await this.writeTimeline(tx, actor, tenantId, request.employeeId, TimelineEventType.OVERTIME_APPROVED, {
          title: 'Overtime approved',
          description: `${request.employee.employeeNumber} overtime was approved.`,
          entityType: 'OvertimeRequest',
          entityId: request.id,
        });
      }

      return updated;
    });
  }

  async listSwapRequests(actor: AuthenticatedPrincipal, query: ListScheduleSwapRequestsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const { from, to } = this.range(query);
    const limit = query.limit ?? 50;
    const visibleEmployeeIds = await this.visibleEmployeeIdsForActor(actor);
    const employeeSearch = this.employeeSearchWhere(query.employeeSearch);
    const assignmentDimensions = this.assignmentDimensionWhere(query);
    const whereFilters: Prisma.ScheduleSwapRequestWhereInput[] = [];

    if (visibleEmployeeIds) {
      whereFilters.push({
        OR: [
          { requesterEmployeeId: { in: visibleEmployeeIds } },
          { targetEmployeeId: { in: visibleEmployeeIds } },
          { assignment: { employeeId: { in: visibleEmployeeIds } } },
        ],
      });
    }
    if (query.employeeId) {
      whereFilters.push({
        OR: [
          { requesterEmployeeId: query.employeeId },
          { targetEmployeeId: query.employeeId },
          { assignment: { employeeId: query.employeeId } },
        ],
      });
    }
    if (employeeSearch) {
      whereFilters.push({
        OR: [
          { requesterEmployee: employeeSearch },
          { targetEmployee: employeeSearch },
          { assignment: { employee: employeeSearch } },
        ],
      });
    }

    const requests = await this.prisma.scheduleSwapRequest.findMany({
      where: {
        tenantId,
        status: query.status,
        assignmentId: query.assignmentId,
        AND: whereFilters.length > 0 ? whereFilters : undefined,
        assignment: {
          ...assignmentDimensions,
          ...(from || to ? { startsAt: { gte: from ?? undefined, lte: to ?? undefined } } : {}),
        },
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      include: this.swapRequestInclude,
    });

    return this.paginate(requests, limit);
  }

  async createSwapRequest(actor: AuthenticatedPrincipal, dto: CreateScheduleSwapRequestDto) {
    const tenantId = this.requireTenant(actor);
    const requester = await this.getSelfEmployeeOrThrow(actor);
    const assignment = await this.findAssignmentOrThrow(tenantId, dto.assignmentId);

    if (assignment.employeeId !== requester.id) {
      throw new ForbiddenException('You can only request a swap for your own schedule assignment.');
    }
    if (TERMINAL_ASSIGNMENT_STATUSES.includes(assignment.status)) {
      throw new BadRequestException('Cancelled, declined, no-show, or completed assignments cannot be swapped.');
    }
    if (assignment.startsAt < new Date()) {
      throw new BadRequestException('Past assignments cannot be swapped.');
    }

    if (dto.targetEmployeeId) {
      if (dto.targetEmployeeId === requester.id) {
        throw new BadRequestException('Choose a different employee for a targeted swap request.');
      }
      await this.assertEmployeeEligibleForOpenShift(this.prisma, tenantId, dto.targetEmployeeId, assignment);
    }

    const duplicate = await this.prisma.scheduleSwapRequest.findFirst({
      where: {
        tenantId,
        assignmentId: assignment.id,
        requesterEmployeeId: requester.id,
        status: ScheduleSwapRequestStatus.REQUESTED,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('This shift already has an open swap request.');
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.scheduleSwapRequest.create({
        data: {
          tenantId,
          assignmentId: assignment.id,
          requesterEmployeeId: requester.id,
          targetEmployeeId: dto.targetEmployeeId,
          reason: dto.reason,
          metadata: this.toJson(dto.metadata),
        },
        include: this.swapRequestInclude,
      });

      await this.writeTimeline(tx, actor, tenantId, requester.id, TimelineEventType.SCHEDULE_ASSIGNED, {
        title: 'Shift swap requested',
        description: dto.reason ?? 'The employee requested a shift swap or coverage change.',
        entityType: 'ScheduleSwapRequest',
        entityId: request.id,
      });
      await this.writeOutbox(tx, tenantId, 'schedule.swap.requested', 'ScheduleSwapRequest', request.id, {
        assignmentId: assignment.id,
        requesterEmployeeId: requester.id,
        targetEmployeeId: dto.targetEmployeeId,
      });

      return request;
    });
  }

  async decideSwapRequest(actor: AuthenticatedPrincipal, requestId: string, dto: DecideScheduleSwapRequestDto) {
    const tenantId = this.requireTenant(actor);
    const request = await this.prisma.scheduleSwapRequest.findFirst({
      where: { id: requestId, tenantId },
      include: this.swapRequestInclude,
    });

    if (!request) {
      throw new NotFoundException('Schedule swap request not found.');
    }
    if (request.status !== ScheduleSwapRequestStatus.REQUESTED) {
      throw new BadRequestException('Only requested schedule swaps can be decided.');
    }
    if (dto.status === ScheduleSwapRequestStatus.REQUESTED) {
      throw new BadRequestException('Use approve, reject, cancel, or complete for a swap decision.');
    }
    if (dto.status === ScheduleSwapRequestStatus.REJECTED && !dto.decisionNote?.trim()) {
      throw new BadRequestException('A rejection reason is required for a shift swap decision.');
    }

    const isRequesterCancel =
      dto.status === ScheduleSwapRequestStatus.CANCELLED &&
      request.requesterEmployee.userId === actor.id;
    if (!isRequesterCancel) {
      const canDecide =
        actor.permissions.includes('scheduling.write') ||
        actor.permissions.includes('scheduling.team.write');
      if (!canDecide) {
        throw new ForbiddenException('Only HR schedulers or managers can decide schedule swap requests.');
      }
      await this.assertCanManageAssignment(actor, tenantId, request.assignment.employeeId);
      if (request.targetEmployeeId) {
        await this.assertCanManageAssignment(actor, tenantId, request.targetEmployeeId);
      }
    }

    let reassignedAssignment: ScheduleAssignment | null = null;
    if (dto.status === ScheduleSwapRequestStatus.APPROVED && request.targetEmployeeId) {
      reassignedAssignment = await this.updateAssignment(actor, request.assignmentId, {
        employeeId: request.targetEmployeeId,
        notes: dto.decisionNote ?? request.reason ?? undefined,
      });
    }

    const finalStatus =
      dto.status === ScheduleSwapRequestStatus.APPROVED && reassignedAssignment
        ? ScheduleSwapRequestStatus.COMPLETED
        : dto.status;

    const updated = await this.prisma.scheduleSwapRequest.update({
      where: { id: requestId },
      data: {
        status: finalStatus,
        decisionNote: dto.decisionNote,
        decidedAt: new Date(),
        decidedById: actor.id,
        completedAt: finalStatus === ScheduleSwapRequestStatus.COMPLETED ? new Date() : undefined,
      },
      include: this.swapRequestInclude,
    });

    await this.prisma.outboxMessage.create({
      data: {
        tenantId,
        eventType: 'schedule.swap.decided',
        aggregateType: 'ScheduleSwapRequest',
        aggregateId: updated.id,
        payload: this.toJson({
          assignmentId: updated.assignmentId,
          requesterEmployeeId: updated.requesterEmployeeId,
          targetEmployeeId: updated.targetEmployeeId,
          status: updated.status,
          decisionNote: updated.decisionNote,
          reassignedAssignmentId: reassignedAssignment?.id,
        })!,
      },
    });

    return { swapRequest: updated, assignment: reassignedAssignment };
  }

  async listAvailability(actor: AuthenticatedPrincipal, query: ListAvailabilityQueryDto) {
    const tenantId = this.requireTenant(actor);
    const { from, to } = this.range(query);
    const employeeScope = await this.employeeScopeWhere(actor);
    const limit = query.limit ?? 50;
    const andFilters: Prisma.EmployeeAvailabilityWhereInput[] = [];

    if (Object.keys(employeeScope).length > 0) {
      andFilters.push(employeeScope);
    }
    if (query.employeeId) {
      andFilters.push({ employeeId: query.employeeId });
    }
    const employeeSearchFilter = this.availabilityEmployeeSearchWhere(query.employeeSearch);
    if (employeeSearchFilter) {
      andFilters.push(employeeSearchFilter);
    }
    const dimensionFilter = this.availabilityDimensionWhere(query);
    if (dimensionFilter) {
      andFilters.push(dimensionFilter);
    }

    const availability = await this.prisma.employeeAvailability.findMany({
      where: {
        tenantId,
        AND: andFilters.length > 0 ? andFilters : undefined,
        status: query.status,
        ...(from || to ? { date: { gte: from ?? undefined, lte: to ?? undefined } } : {}),
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: { employee: { include: { person: true } } },
    });

    return this.paginate(availability, limit);
  }

  async createAvailability(actor: AuthenticatedPrincipal, dto: CreateAvailabilityDto) {
    const tenantId = this.requireTenant(actor);
    const selfOnly = !actor.permissions.includes('scheduling.write');
    const employee = dto.employeeId && !selfOnly
      ? await this.findEmployeeOrThrow(tenantId, dto.employeeId)
      : await this.getSelfEmployeeOrThrow(actor);
    const policy = await this.ensureActivePolicy(tenantId);
    const dates = this.expandAvailabilityDates(dto, policy.weekStartsOn);
    if ((dto.startsAt && !dto.endsAt) || (!dto.startsAt && dto.endsAt)) {
      throw new BadRequestException('Availability time windows require both start and end times.');
    }
    if (dto.startsAt && dto.endsAt) {
      this.assertValidTimeWindow(this.timeOnDate(dates[0], dto.startsAt), this.timeOnDate(dates[0], dto.endsAt));
    }
    const recurringRule = dto.recurringRule ?? this.availabilityRecurringRule(dto, dates);
    const metadata = {
      ...(dto.metadata ?? {}),
      applyMode: dto.applyMode ?? AvailabilityApplyMode.SINGLE_DAY,
      selectedWeekdays: dto.weekdays,
      batchSize: dates.length,
    };

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.replaceExisting) {
        await tx.employeeAvailability.deleteMany({
          where: {
            tenantId,
            employeeId: employee.id,
            date: { in: dates },
          },
        });
      }

      const records = [];

      for (const date of dates) {
        records.push(
          await tx.employeeAvailability.create({
            data: {
              tenantId,
              employeeId: employee.id,
              date,
              startsAt: dto.startsAt ? this.timeOnDate(date, dto.startsAt) : undefined,
              endsAt: dto.endsAt ? this.timeOnDate(date, dto.endsAt) : undefined,
              timezone: dto.timezone ?? policy.timezone,
              status: dto.status ?? EmployeeAvailabilityStatus.AVAILABLE,
              reason: dto.reason,
              recurringRule,
              createdById: actor.id,
              metadata: this.toJson(metadata),
            },
            include: { employee: { include: { person: true } } },
          }),
        );
      }

      return records;
    });

    return created.length === 1
      ? created[0]
      : {
          count: created.length,
          data: created,
          appliedDates: dates.map((date) => date.toISOString()),
        };
  }

  async getMySchedule(actor: AuthenticatedPrincipal, query: ListSchedulingQueryDto) {
    const employee = await this.getSelfEmployeeOrThrow(actor);
    const assignments = await this.listAssignments(actor, {
      ...query,
      employeeId: employee.id,
      limit: query.limit ?? 50,
    });
    const openShifts = await this.listOpenShifts(actor, { ...query, limit: 25 });
    const openShiftClaims = await this.listOpenShiftClaims(actor, { ...query, limit: 25 });
    const overtime = await this.listOvertime(actor, { ...query, limit: 25 });
    const availability = await this.listAvailability(actor, { ...query, limit: 25 });

    return {
      employee,
      assignments,
      openShifts,
      openShiftClaims,
      overtime,
      availability,
    };
  }

  private async createAssignmentForScope(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    dto: CreateScheduleAssignmentDto,
    source: ScheduleAssignmentSource,
  ) {
    return this.prisma.$transaction((tx) =>
      this.createAssignmentInsideTransaction(tx, actor, tenantId, dto, source),
    );
  }

  private async createBulkAssignmentsForScope(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    dto: BulkCreateScheduleAssignmentsDto,
    source: ScheduleAssignmentSource,
  ) {
    const employeeIds = [...new Set(dto.employeeIds.map((id) => id.trim()).filter(Boolean))];
    const workDates = [...new Set(dto.workDates.map((date) => this.dateKey(this.startOfDay(this.toDate(date)))))];
    const totalPlannedRows = employeeIds.length * workDates.length;

    if (totalPlannedRows === 0) {
      throw new BadRequestException('Select at least one employee and one work date.');
    }
    if (totalPlannedRows > 500) {
      throw new BadRequestException('Bulk scheduling is limited to 500 assignment rows per request. Narrow the date or employee selection.');
    }
    await this.assertSchedulePeriodWritable(this.prisma, tenantId, dto.scheduleId);

    const created: ScheduleAssignment[] = [];
    const skipped: Array<{
      employeeId: string;
      workDate: string;
      reason: string;
    }> = [];
    const skipConflicts = dto.skipConflicts ?? true;

    for (const employeeId of employeeIds) {
      if (source === ScheduleAssignmentSource.MANAGER) {
        await this.assertCanManageAssignment(actor, tenantId, employeeId);
      }

      for (const workDate of workDates) {
        const day = this.startOfDay(this.toDate(workDate));
        const startsAt = this.timePartsOnDate(day, dto.startsAtTime);
        const endsOnSameDay = this.timePartsOnDate(day, dto.endsAtTime);
        const endsAt = endsOnSameDay <= startsAt ? this.addDays(endsOnSameDay, 1) : endsOnSameDay;

        try {
          const assignment = await this.createAssignmentForScope(
            actor,
            tenantId,
            {
              employeeId,
              scheduleId: dto.scheduleId,
              shiftId: dto.shiftId,
              policyId: dto.policyId,
              organizationNodeId: dto.organizationNodeId,
              costCenterId: dto.costCenterId,
              positionId: dto.positionId,
              managerEmployeeId: dto.managerEmployeeId,
              workDate: day.toISOString(),
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              breakMinutes: dto.breakMinutes,
              timezone: dto.timezone,
              locationName: dto.locationName,
              notes: dto.notes,
              metadata: {
                ...(dto.metadata ?? {}),
                bulkCreated: true,
                bulkCreatedById: actor.id,
              },
            },
            source,
          );
          created.push(assignment);
        } catch (caught) {
          if (!skipConflicts) {
            throw caught;
          }
          skipped.push({
            employeeId,
            workDate,
            reason: caught instanceof Error ? caught.message : 'Assignment could not be created.',
          });
        }
      }
    }

    return {
      requested: totalPlannedRows,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    };
  }

  private async createAssignmentInsideTransaction(
    tx: Tx,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    dto: CreateScheduleAssignmentDto,
    source: ScheduleAssignmentSource,
  ) {
    const employee = await this.findEmployeeOrThrow(tenantId, dto.employeeId, tx);
    const policy = await this.ensureActivePolicy(tenantId, dto.policyId, tx);
    const shift = dto.shiftId ? await this.findShiftOrThrow(tenantId, dto.shiftId, tx) : null;
    const startsAt = this.toDate(dto.startsAt);
    const endsAt = this.toDate(dto.endsAt);
    this.assertValidTimeWindow(startsAt, endsAt);
    await this.assertSchedulePeriodWritable(tx, tenantId, dto.scheduleId);

    if (source === ScheduleAssignmentSource.MANAGER && !policy.allowManagerAssignment) {
      throw new ForbiddenException('Manager schedule assignment is disabled by workplace policy.');
    }
    if (source === ScheduleAssignmentSource.HR_MANAGER && !policy.allowHrAssignment) {
      throw new ForbiddenException('HR schedule assignment is disabled by workplace policy.');
    }

    await this.assertNoHardConflict(tx, tenantId, employee.id, startsAt, endsAt);

    const breakMinutes = dto.breakMinutes ?? shift?.breakMinutes ?? 0;
    const overtimeMinutes = shift?.isOvertimeEligible === false
      ? 0
      : await this.calculateOvertimeMinutes(tx, tenantId, employee.id, startsAt, endsAt, breakMinutes, policy);
    const primaryAssignment = employee.assignments[0];

    const assignment = await tx.scheduleAssignment.create({
      data: {
        tenantId,
        scheduleId: dto.scheduleId,
        employeeId: employee.id,
        shiftId: dto.shiftId,
        policyId: policy.id,
        organizationNodeId: dto.organizationNodeId ?? primaryAssignment?.organizationNodeId,
        costCenterId: dto.costCenterId ?? primaryAssignment?.costCenterId,
        positionId: dto.positionId ?? primaryAssignment?.positionId,
        managerEmployeeId: dto.managerEmployeeId ?? primaryAssignment?.managerEmployeeId,
        assignedById: actor.id,
        source,
        status: ScheduleAssignmentStatus.ASSIGNED,
        workDate: this.startOfDay(this.toDate(dto.workDate)),
        startsAt,
        endsAt,
        breakMinutes,
        timezone: dto.timezone ?? shift?.timezone ?? policy.timezone,
        locationName: dto.locationName,
        isOpenShift: dto.isOpenShift ?? source === ScheduleAssignmentSource.OPEN_SHIFT,
        isOvertime: dto.isOvertime ?? overtimeMinutes > 0,
        overtimeMinutes,
        notes: dto.notes,
        metadata: this.toJson({
          ...(dto.metadata ?? {}),
          overtimePolicyMode: policy.overtimeMode,
          overtimeMultiplier: policy.overtimeMultiplier,
        }),
      },
      include: this.assignmentInclude,
    });

    await this.writeTimeline(tx, actor, tenantId, employee.id, TimelineEventType.SCHEDULE_ASSIGNED, {
      title: 'Schedule assigned',
      description: `${employee.employeeNumber} was assigned to a shift on ${assignment.workDate.toISOString().slice(0, 10)}.`,
      entityType: 'ScheduleAssignment',
      entityId: assignment.id,
    });

    await this.writeOutbox(tx, tenantId, 'schedule.assignment.created', 'ScheduleAssignment', assignment.id, {
      employeeId: employee.id,
      source,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      overtimeMinutes,
    });

    await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'scheduling.assignment', assignment.id, null, assignment);
    return assignment;
  }

  private async createAssignmentFromOpenShift(
    tx: Tx,
    actor: AuthenticatedPrincipal,
    openShift: OpenShift,
    employeeId: string,
    claimId: string,
  ) {
    await this.assertEmployeeEligibleForOpenShift(tx, openShift.tenantId, employeeId, openShift);

    const assignment = await this.createAssignmentInsideTransaction(
      tx,
      actor,
      openShift.tenantId,
      {
        employeeId,
        scheduleId: openShift.scheduleId ?? undefined,
        shiftId: openShift.shiftId ?? undefined,
        policyId: openShift.policyId ?? undefined,
        organizationNodeId: openShift.organizationNodeId ?? undefined,
        costCenterId: openShift.costCenterId ?? undefined,
        positionId: openShift.positionId ?? undefined,
        workDate: openShift.workDate.toISOString(),
        startsAt: openShift.startsAt.toISOString(),
        endsAt: openShift.endsAt.toISOString(),
        breakMinutes: openShift.breakMinutes,
        timezone: openShift.timezone ?? undefined,
        locationName: openShift.locationName ?? undefined,
        isOpenShift: true,
        metadata: { openShiftId: openShift.id, claimId },
      },
      ScheduleAssignmentSource.OPEN_SHIFT,
    );

    const nextClaimed = openShift.claimedHeadcount + 1;
    await tx.openShift.update({
      where: { id: openShift.id },
      data: {
        claimedHeadcount: nextClaimed,
        status: nextClaimed >= openShift.requiredHeadcount ? OpenShiftStatus.CLAIMED : OpenShiftStatus.OPEN,
      },
    });

    await tx.openShiftClaim.update({
      where: { id: claimId },
      data: { assignmentId: assignment.id },
    });

    return assignment;
  }

  private async calculateOvertimeMinutes(
    client: Tx,
    tenantId: string,
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
    breakMinutes: number,
    policy: SchedulePolicy,
    excludeAssignmentId?: string,
  ) {
    if (policy.overtimeMode === OvertimePolicyMode.DISABLED) {
      return 0;
    }

    const workedMinutes = this.durationMinutes(startsAt, endsAt, breakMinutes);
    const dailyThreshold = Math.round((policy.standardHoursPerDay ?? 8) * 60);
    const weeklyThreshold = Math.round((policy.standardHoursPerWeek ?? 40) * 60);
    const isWeekend = [0, 6].includes(startsAt.getUTCDay());
    const dailyOvertime = Math.max(0, workedMinutes - dailyThreshold);
    const week = this.weekRange(startsAt, policy.weekStartsOn);

    const weekAssignments = await client.scheduleAssignment.findMany({
      where: {
        id: excludeAssignmentId ? { not: excludeAssignmentId } : undefined,
        tenantId,
        employeeId,
        startsAt: { gte: week.start, lt: week.end },
        status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
      },
      select: { startsAt: true, endsAt: true, breakMinutes: true },
    });
    const existingWeekMinutes = weekAssignments.reduce(
      (sum, item) => sum + this.durationMinutes(item.startsAt, item.endsAt, item.breakMinutes),
      0,
    );
    const weeklyOvertime = Math.max(0, existingWeekMinutes + workedMinutes - weeklyThreshold);
    const weekendOvertime = policy.weekendOvertime && isWeekend ? workedMinutes : 0;

    switch (policy.overtimeMode) {
      case OvertimePolicyMode.DAILY:
        return Math.max(dailyOvertime, weekendOvertime);
      case OvertimePolicyMode.WEEKLY:
        return Math.max(weeklyOvertime, weekendOvertime);
      case OvertimePolicyMode.DAILY_AND_WEEKLY:
      case OvertimePolicyMode.CUSTOM:
        return Math.max(dailyOvertime, weeklyOvertime, weekendOvertime);
      default:
        return 0;
    }
  }

  private async ensureActivePolicy(tenantId: string, policyId?: string, client: PrismaService | Tx = this.prisma) {
    if (policyId) {
      const policy = await client.schedulePolicy.findFirst({
        where: { id: policyId, tenantId, deletedAt: null },
      });
      if (!policy) {
        throw new NotFoundException('Schedule policy not found.');
      }
      return policy;
    }

    const active = await client.schedulePolicy.findFirst({
      where: { tenantId, status: SchedulePolicyStatus.ACTIVE, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    if (active) {
      return active;
    }

    const tenant = await client.tenant.findUnique({
      where: { id: tenantId },
      include: { country: true },
    });
    const countryCode = tenant?.country?.iso2?.toUpperCase();
    const africaDefault = countryCode ? AFRICA_ISO2.has(countryCode) : false;

    return client.schedulePolicy.create({
      data: {
        tenantId,
        code: africaDefault ? 'DEFAULT_NO_OVERTIME' : 'DEFAULT_STANDARD',
        name: africaDefault ? 'Default no-overtime scheduling policy' : 'Default standard scheduling policy',
        description: africaDefault
          ? 'Default policy for workplaces that do not operate overtime by default.'
          : 'Default policy with standard weekly overtime governance.',
        status: SchedulePolicyStatus.ACTIVE,
        countryId: tenant?.countryId,
        timezone: tenant?.country?.defaultTimezone ?? 'UTC',
        weekStartsOn: africaDefault ? ScheduleWeekStart.MONDAY : ScheduleWeekStart.MONDAY,
        standardHoursPerDay: africaDefault ? null : 8,
        standardHoursPerWeek: africaDefault ? null : 40,
        overtimeMode: africaDefault ? OvertimePolicyMode.DISABLED : OvertimePolicyMode.DAILY_AND_WEEKLY,
        overtimeApprovalMode: africaDefault ? OvertimeApprovalMode.HR : OvertimeApprovalMode.MANAGER,
        overtimeMultiplier: 1.5,
        allowSelfScheduling: false,
        allowOpenShiftPickup: false,
        allowManagerAssignment: true,
        allowHrAssignment: true,
        metadata: {
          generatedBy: 'schedule-policy-bootstrap',
          regionalDefault: africaDefault ? 'NO_OVERTIME' : 'STANDARD_OVERTIME',
        },
      },
    });
  }

  private async findPolicyOrThrow(tenantId: string, policyId: string) {
    const policy = await this.prisma.schedulePolicy.findFirst({
      where: { id: policyId, tenantId, deletedAt: null },
      include: { country: true },
    });
    if (!policy) {
      throw new NotFoundException('Schedule policy not found.');
    }
    return policy;
  }

  private async findShiftOrThrow(tenantId: string, shiftId: string, client: PrismaService | Tx = this.prisma) {
    const shift = await client.workShift.findFirst({
      where: { id: shiftId, tenantId, deletedAt: null },
    });
    if (!shift) {
      throw new NotFoundException('Work shift not found.');
    }
    return shift;
  }

  private async findCoverageRuleOrThrow(tenantId: string, ruleId: string) {
    const rule = await this.prisma.scheduleCoverageRule.findFirst({
      where: { id: ruleId, tenantId, deletedAt: null },
      include: this.coverageRuleInclude,
    });
    if (!rule) {
      throw new NotFoundException('Coverage demand rule not found.');
    }
    return rule;
  }

  private async findPeriodOrThrow(tenantId: string, periodId: string) {
    const period = await this.prisma.schedulePeriod.findFirst({
      where: { id: periodId, tenantId, deletedAt: null },
    });
    if (!period) {
      throw new NotFoundException('Schedule period not found.');
    }
    return period;
  }

  private async assertSchedulePeriodWritable(client: PrismaService | Tx, tenantId: string, scheduleId?: string | null) {
    if (!scheduleId) {
      return;
    }

    const period = await client.schedulePeriod.findFirst({
      where: { id: scheduleId, tenantId, deletedAt: null },
      select: { name: true, status: true },
    });

    if (!period) {
      throw new NotFoundException('Schedule period not found.');
    }
    if (period.status === ScheduleStatus.LOCKED) {
      throw new BadRequestException(`Schedule period "${period.name}" is locked. Reopen or create a new period before changing coverage.`);
    }
    if (period.status === ScheduleStatus.ARCHIVED) {
      throw new BadRequestException(`Schedule period "${period.name}" is archived and cannot be changed.`);
    }
  }

  private async findAssignmentOrThrow(tenantId: string, assignmentId: string) {
    const assignment = await this.prisma.scheduleAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      include: this.assignmentInclude,
    });
    if (!assignment) {
      throw new NotFoundException('Schedule assignment not found.');
    }
    return assignment;
  }

  private async findOpenShiftOrThrow(client: Tx, tenantId: string, openShiftId: string) {
    const openShift = await client.openShift.findFirst({
      where: { id: openShiftId, tenantId },
      include: this.openShiftInclude,
    });
    if (!openShift) {
      throw new NotFoundException('Open shift not found.');
    }
    return openShift;
  }

  private async findEmployeeOrThrow(tenantId: string, employeeId: string, client: PrismaService | Tx = this.prisma) {
    const employee = await client.employee.findFirst({
      where: { id: employeeId, tenantId, deletedAt: null },
      include: { person: true, assignments: { where: { isPrimary: true }, orderBy: { effectiveFrom: 'desc' }, take: 1 } },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }
    return employee;
  }

  private async getSelfEmployeeOrThrow(actor: AuthenticatedPrincipal) {
    const employee = await this.getSelfEmployeeOrNull(actor);
    if (!employee) {
      throw new ForbiddenException('Your account is not linked to an employee profile.');
    }
    return employee;
  }

  private async getSelfEmployeeOrNull(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.employee.findFirst({
      where: { tenantId, userId: actor.id, deletedAt: null },
      include: { person: true },
    });
  }

  private async assertReportingScopeMember(tenantId: string, leaderEmployeeId: string, employeeId: string) {
    if (leaderEmployeeId === employeeId) {
      return;
    }

    const match = await this.prisma.employeeAssignment.findFirst({
      where: {
        tenantId,
        employeeId,
        isPrimary: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        AND: [this.reportingScopeWhere(leaderEmployeeId)],
      },
      select: { id: true },
    });
    if (!match) {
      throw new ForbiddenException('This employee is outside your current reporting group.');
    }
  }

  private reportingScopeWhere(leaderEmployeeId: string): Prisma.EmployeeAssignmentWhereInput {
    return {
      OR: [
        { managerEmployeeId: leaderEmployeeId },
        { supervisorEmployeeId: leaderEmployeeId },
        { unitHeadEmployeeId: leaderEmployeeId },
      ],
    };
  }

  private assertOpenShiftHasTarget(scope: SchedulingScope) {
    if (!scope.organizationNodeId && !scope.costCenterId && !scope.positionId) {
      throw new BadRequestException(
        'Open shifts must be targeted to an organization unit, cost center, or position before employees can pick them up.',
      );
    }
  }

  private canManageSchedules(actor: AuthenticatedPrincipal) {
    return actor.permissions.includes('scheduling.write') || actor.permissions.includes('scheduling.team.write');
  }

  private assertCanManageSchedules(actor: AuthenticatedPrincipal) {
    if (!this.canManageSchedules(actor)) {
      throw new ForbiddenException('This scheduling action requires HR scheduling or manager scheduling access.');
    }
  }

  private async assertCanManageAssignment(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
  ) {
    if (actor.permissions.includes('scheduling.write')) {
      return;
    }
    if (!actor.permissions.includes('scheduling.team.write')) {
      throw new ForbiddenException('This scheduling action requires HR scheduling or manager scheduling access.');
    }

    const manager = await this.getSelfEmployeeOrThrow(actor);
    await this.assertReportingScopeMember(tenantId, manager.id, employeeId);
  }

  private async assertCanManageOpenShiftScope(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    scope: SchedulingScope,
  ) {
    if (actor.permissions.includes('scheduling.write')) {
      return;
    }
    if (!actor.permissions.includes('scheduling.team.write')) {
      throw new ForbiddenException('This scheduling action requires HR scheduling or manager scheduling access.');
    }

    const manager = await this.getSelfEmployeeOrThrow(actor);
    const now = new Date();
    const assignments = await this.prisma.employeeAssignment.findMany({
      where: {
        tenantId,
        isPrimary: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        AND: [
          {
            OR: [
              { employeeId: manager.id },
              this.reportingScopeWhere(manager.id),
            ],
          },
        ],
      },
      select: {
        organizationNodeId: true,
        costCenterId: true,
        positionId: true,
      },
      take: 500,
    });

    if (!assignments.some((assignment) => this.openShiftScopeMatchesAssignment(scope, assignment))) {
      throw new ForbiddenException('This open shift is outside your current reporting scope.');
    }
  }

  private async assertEmployeeEligibleForOpenShift(
    client: PrismaService | Tx,
    tenantId: string,
    employeeId: string,
    scope: SchedulingScope & Partial<Pick<OpenShift, 'startsAt' | 'endsAt'>>,
  ) {
    this.assertOpenShiftHasTarget(scope);
    const now = new Date();
    const assignment = await client.employeeAssignment.findFirst({
      where: {
        tenantId,
        employeeId,
        isPrimary: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      select: {
        organizationNodeId: true,
        costCenterId: true,
        positionId: true,
      },
    });

    if (!assignment || !this.openShiftScopeMatchesAssignment(scope, assignment)) {
      throw new ForbiddenException(
        'This open shift is outside the employee current assignment scope.',
      );
    }
    if (scope.startsAt && scope.endsAt) {
      await this.assertNoHardConflict(client, tenantId, employeeId, scope.startsAt, scope.endsAt);
    }
  }

  private openShiftScopeMatchesAssignment(scope: SchedulingScope, assignment: AssignmentScope) {
    if (!scope.organizationNodeId && !scope.costCenterId && !scope.positionId) {
      return false;
    }

    return (
      (!scope.organizationNodeId || scope.organizationNodeId === assignment.organizationNodeId) &&
      (!scope.costCenterId || scope.costCenterId === assignment.costCenterId) &&
      (!scope.positionId || scope.positionId === assignment.positionId)
    );
  }

  private async assertNoHardConflict(
    client: Tx,
    tenantId: string,
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
    excludeAssignmentId?: string,
  ) {
    const conflict = await client.scheduleAssignment.findFirst({
      where: {
        id: excludeAssignmentId ? { not: excludeAssignmentId } : undefined,
        tenantId,
        employeeId,
        status: { notIn: TERMINAL_ASSIGNMENT_STATUSES },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new BadRequestException('This employee already has a schedule assignment in that time window.');
    }

    const approvedLeave = await client.leaveRequest.findFirst({
      where: {
        tenantId,
        employeeId,
        status: { in: [LeaveRequestStatus.APPROVED, LeaveRequestStatus.TAKEN] },
        startAt: { lt: endsAt },
        endAt: { gt: startsAt },
        deletedAt: null,
      },
      select: { reason: true, startAt: true, endAt: true },
    });

    if (approvedLeave) {
      throw new BadRequestException(
        `This employee is on approved leave from ${approvedLeave.startAt.toISOString()} to ${approvedLeave.endAt.toISOString()}.`,
      );
    }

    const unavailableWindow = await client.employeeAvailability.findFirst({
      where: {
        tenantId,
        employeeId,
        status: EmployeeAvailabilityStatus.UNAVAILABLE,
        date: this.startOfDay(startsAt),
        OR: [
          { startsAt: null },
          { endsAt: null },
          {
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        ],
      },
      select: { reason: true },
    });

    if (unavailableWindow) {
      throw new BadRequestException(
        unavailableWindow.reason
          ? `This employee is unavailable in that time window. Reason: ${unavailableWindow.reason}`
          : 'This employee is unavailable in that time window.',
      );
    }
  }

  private assertOpenShiftClaimable(openShift: OpenShift) {
    if (openShift.status !== OpenShiftStatus.OPEN) {
      throw new BadRequestException('This open shift is no longer available.');
    }
    if (openShift.expiresAt && openShift.expiresAt < new Date()) {
      throw new BadRequestException('This open shift has expired.');
    }
    if (openShift.claimedHeadcount >= openShift.requiredHeadcount) {
      throw new BadRequestException('This open shift is already fully claimed.');
    }
  }

  private assertCoverageRuleHasOperationalScope(scope: SchedulingScope & { locationName?: string | null }) {
    if (!scope.organizationNodeId && !scope.costCenterId && !scope.positionId && !scope.locationName?.trim()) {
      throw new BadRequestException(
        'Coverage demand rules must be tied to an organization unit, cost center, position, or named location.',
      );
    }
  }

  private assertCoverageTimes(startsAtTime?: string | null, endsAtTime?: string | null) {
    if ((startsAtTime && !endsAtTime) || (!startsAtTime && endsAtTime)) {
      throw new BadRequestException('Coverage demand time windows require both start and end times.');
    }
    if (!startsAtTime || !endsAtTime) {
      return;
    }

    this.normalizeShift({
      startTime: startsAtTime,
      endTime: endsAtTime,
      breakMinutes: 0,
      code: 'COVERAGE',
      name: 'Coverage demand',
    });
  }

  private assertCoverageHeadcount(requiredHeadcount?: number | null, minimumHeadcount?: number | null) {
    const required = requiredHeadcount ?? 1;
    const minimum = minimumHeadcount ?? required;
    if (minimum > required) {
      throw new BadRequestException('Minimum coverage cannot be greater than required coverage.');
    }
  }

  private normalizeShift(dto: Pick<CreateWorkShiftDto, 'startTime' | 'endTime' | 'breakMinutes' | 'code' | 'name'>) {
    const [startHour, startMinute] = dto.startTime.split(':').map(Number);
    const [endHour, endMinute] = dto.endTime.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    let end = endHour * 60 + endMinute;
    const crossesMidnight = end <= start;
    if (crossesMidnight) {
      end += 24 * 60;
    }
    const durationMinutes = end - start;
    if (durationMinutes <= 0) {
      throw new BadRequestException('Shift end time must be after start time.');
    }
    if ((dto.breakMinutes ?? 0) > durationMinutes) {
      throw new BadRequestException('Break minutes cannot exceed shift duration.');
    }
    return { durationMinutes, crossesMidnight };
  }

  private range(query: ListSchedulingQueryDto) {
    return {
      from: query.from ? this.toDate(query.from) : undefined,
      to: query.to ? this.toDate(query.to) : undefined,
    };
  }

  private plannerRange(query: PlannerSummaryQueryDto, weekStartsOn: ScheduleWeekStart) {
    const view = query.view ?? SchedulePlannerView.WEEK;
    const anchor = this.startOfDay(query.from ? this.toDate(query.from) : new Date());
    let from = anchor;
    let to = anchor;

    if (query.from && query.to) {
      from = this.startOfDay(this.toDate(query.from));
      to = this.startOfDay(this.toDate(query.to));
    } else if (view === SchedulePlannerView.DAY) {
      from = anchor;
      to = anchor;
    } else if (view === SchedulePlannerView.MONTH) {
      from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
      to = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
    } else {
      const week = this.weekRange(anchor, weekStartsOn);
      from = week.start;
      to = this.addDays(week.start, 6);
    }

    if (to < from) {
      to = from;
    }

    const maxWindowDays = view === SchedulePlannerView.MONTH ? 62 : 35;
    const maxTo = this.addDays(from, maxWindowDays - 1);

    return {
      from,
      to: to > maxTo ? maxTo : to,
    };
  }

  private dateSequence(from: Date, to: Date) {
    const days: Date[] = [];
    const cursor = new Date(from);

    while (cursor <= to) {
      days.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return days;
  }

  private dateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private endOfDay(value: Date) {
    const end = new Date(value);
    end.setUTCHours(23, 59, 59, 999);
    return end;
  }

  private addDays(value: Date, days: number) {
    const date = new Date(value);
    date.setUTCDate(date.getUTCDate() + days);
    return date;
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

  private expandAvailabilityDates(dto: CreateAvailabilityDto, weekStartsOn: ScheduleWeekStart) {
    const mode = dto.applyMode ?? AvailabilityApplyMode.SINGLE_DAY;
    const anchorDate = this.startOfDay(this.toDate(dto.date));

    if (mode === AvailabilityApplyMode.SINGLE_DAY) {
      return [anchorDate];
    }

    const week = this.weekRange(anchorDate, weekStartsOn);
    const selectedWeekdays =
      mode === AvailabilityApplyMode.ALL_WEEK
        ? [0, 1, 2, 3, 4, 5, 6]
        : [...new Set(dto.weekdays ?? [])].sort((left, right) => left - right);

    if (selectedWeekdays.length === 0) {
      throw new BadRequestException('Select at least one weekday for weekly availability.');
    }

    return selectedWeekdays
      .map((weekday) => {
        const date = new Date(week.start);
        const offset = (weekday - this.weekStartDay(weekStartsOn) + 7) % 7;
        date.setUTCDate(date.getUTCDate() + offset);
        return date;
      })
      .sort((left, right) => left.getTime() - right.getTime());
  }

  private availabilityRecurringRule(dto: CreateAvailabilityDto, dates: Date[]) {
    if (dates.length <= 1) {
      return undefined;
    }

    const byDay = dates.map((date) => this.weekdayCode(date.getUTCDay())).join(',');

    return `FREQ=WEEKLY;BYDAY=${byDay};COUNT=${dates.length}`;
  }

  private weekRange(date: Date, weekStartsOn: ScheduleWeekStart) {
    const start = this.startOfDay(date);
    const day = start.getUTCDay();
    const weekStartDay = this.weekStartDay(weekStartsOn);
    const diff = (day - weekStartDay + 7) % 7;
    start.setUTCDate(start.getUTCDate() - diff);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end };
  }

  private weekStartDay(weekStartsOn: ScheduleWeekStart) {
    return weekStartsOn === ScheduleWeekStart.SUNDAY ? 0 : weekStartsOn === ScheduleWeekStart.SATURDAY ? 6 : 1;
  }

  private weekdayCode(day: number) {
    return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][day] ?? 'MO';
  }

  private durationMinutes(startsAt: Date, endsAt: Date, breakMinutes: number) {
    return Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000) - breakMinutes);
  }

  private assertValidTimeWindow(startsAt: Date, endsAt: Date) {
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Invalid schedule time window.');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('Schedule end time must be after start time.');
    }
  }

  private toDate(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date value.');
    }
    return date;
  }

  private timeOnDate(date: Date, timeValue: string) {
    const source = this.toDate(timeValue);
    const result = new Date(date);
    result.setUTCHours(source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), 0);
    return result;
  }

  private timePartsOnDate(date: Date, timeValue: string) {
    const [hours, minutes] = timeValue.split(':').map(Number);
    const result = new Date(date);
    result.setUTCHours(hours, minutes, 0, 0);
    return result;
  }

  private startOfDay(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private requireTenant(actor: AuthenticatedPrincipal) {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant workspace is required for scheduling.');
    }
    return actor.tenantId;
  }

  private async employeeScopeWhere(actor: AuthenticatedPrincipal): Promise<
    | Record<string, never>
    | { employeeId: string }
    | { employeeId: { in: string[] } }
  > {
    if (actor.permissions.includes('scheduling.write')) {
      return {};
    }

    if (actor.permissions.includes('scheduling.team.write')) {
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
      return { employeeId: { in: [manager.id, ...team.map((item) => item.employeeId)] } };
    }

    const self = await this.getSelfEmployeeOrNull(actor);
    return self ? { employeeId: self.id } : { employeeId: { in: [] } };
  }

  private async visibleEmployeeIdsForActor(actor: AuthenticatedPrincipal) {
    if (actor.permissions.includes('scheduling.write')) {
      return null;
    }

    const self = await this.getSelfEmployeeOrNull(actor);
    if (!self) {
      return [];
    }

    if (!actor.permissions.includes('scheduling.team.write')) {
      return [self.id];
    }

    const team = await this.prisma.employeeAssignment.findMany({
      where: {
        tenantId: self.tenantId,
        isPrimary: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        AND: [this.reportingScopeWhere(self.id)],
      },
      select: { employeeId: true },
    });

    return [...new Set([self.id, ...team.map((item) => item.employeeId)])];
  }

  private async openShiftVisibilityWhere(actor: AuthenticatedPrincipal): Promise<Prisma.OpenShiftWhereInput | null> {
    if (actor.permissions.includes('scheduling.write')) {
      return null;
    }

    const employee = await this.getSelfEmployeeOrNull(actor);
    if (!employee) {
      return { id: { in: [] } };
    }

    const now = new Date();
    const assignmentWhere: Prisma.EmployeeAssignmentWhereInput = {
      tenantId: employee.tenantId,
      isPrimary: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      ...(actor.permissions.includes('scheduling.team.write')
        ? {
            AND: [
              {
                OR: [
                  { employeeId: employee.id },
                  { managerEmployeeId: employee.id },
                  { supervisorEmployeeId: employee.id },
                  { unitHeadEmployeeId: employee.id },
                ],
              },
            ],
          }
        : { employeeId: employee.id }),
    };

    const assignments = await this.prisma.employeeAssignment.findMany({
      where: assignmentWhere,
      select: {
        organizationNodeId: true,
        costCenterId: true,
        positionId: true,
      },
      take: 500,
    });

    return this.openShiftVisibilityForAssignments(assignments);
  }

  private openShiftVisibilityForAssignments(assignments: AssignmentScope[]): Prisma.OpenShiftWhereInput {
    const scopeFilters = assignments.map((assignment) => this.openShiftWhereForAssignmentScope(assignment));

    return scopeFilters.length > 0 ? { OR: scopeFilters } : { id: { in: [] } };
  }

  private openShiftWhereForAssignmentScope(assignment: AssignmentScope): Prisma.OpenShiftWhereInput {
    const noMatch = '__no_matching_assignment_dimension__';

    return {
      AND: [
        this.targetedOpenShiftWhere(),
        {
          OR: [
            { organizationNodeId: null },
            { organizationNodeId: assignment.organizationNodeId ?? noMatch },
          ],
        },
        {
          OR: [
            { costCenterId: null },
            { costCenterId: assignment.costCenterId ?? noMatch },
          ],
        },
        {
          OR: [
            { positionId: null },
            { positionId: assignment.positionId ?? noMatch },
          ],
        },
      ],
    };
  }

  private targetedOpenShiftWhere(): Prisma.OpenShiftWhereInput {
    return {
      OR: [
        { organizationNodeId: { not: null } },
        { costCenterId: { not: null } },
        { positionId: { not: null } },
      ],
    };
  }

  private assignmentDimensionWhere(query: {
    organizationNodeId?: string;
    costCenterId?: string;
    positionId?: string;
    locationName?: string;
  }): Prisma.ScheduleAssignmentWhereInput {
    return {
      organizationNodeId: query.organizationNodeId,
      costCenterId: query.costCenterId,
      positionId: query.positionId,
      locationName: query.locationName
        ? { contains: query.locationName.trim(), mode: 'insensitive' }
        : undefined,
    };
  }

  private hasScheduleDimensionFilter(query: {
    organizationNodeId?: string;
    costCenterId?: string;
    positionId?: string;
    locationName?: string;
  }) {
    return Boolean(
      query.organizationNodeId ||
      query.costCenterId ||
      query.positionId ||
      query.locationName?.trim(),
    );
  }

  private assignmentEmployeeSearchWhere(search?: string): Prisma.ScheduleAssignmentWhereInput | null {
    const employee = this.employeeSearchWhere(search);
    return employee ? { employee } : null;
  }

  private availabilityEmployeeSearchWhere(search?: string): Prisma.EmployeeAvailabilityWhereInput | null {
    const employee = this.employeeSearchWhere(search);
    return employee ? { employee } : null;
  }

  private employeeSearchWhere(search?: string): Prisma.EmployeeWhereInput | null {
    const term = search?.trim();

    if (!term) {
      return null;
    }

    return {
      OR: [
        { employeeNumber: { contains: term, mode: 'insensitive' } },
        { person: { firstName: { contains: term, mode: 'insensitive' } } },
        { person: { middleName: { contains: term, mode: 'insensitive' } } },
        { person: { lastName: { contains: term, mode: 'insensitive' } } },
        { person: { preferredName: { contains: term, mode: 'insensitive' } } },
      ],
    };
  }

  private employeeCandidateDimensionWhere(query: {
    organizationNodeId?: string;
    costCenterId?: string;
    positionId?: string;
  }): Prisma.EmployeeAssignmentWhereInput {
    return {
      organizationNodeId: query.organizationNodeId,
      costCenterId: query.costCenterId,
      positionId: query.positionId,
    };
  }

  private currentPrimaryAssignmentWhere(
    now: Date,
    extra: Prisma.EmployeeAssignmentWhereInput = {},
  ): Prisma.EmployeeAssignmentWhereInput {
    return {
      ...extra,
      isPrimary: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    };
  }

  private openShiftDimensionWhere(query: {
    organizationNodeId?: string;
    costCenterId?: string;
    positionId?: string;
    locationName?: string;
  }): Prisma.OpenShiftWhereInput {
    return {
      organizationNodeId: query.organizationNodeId,
      costCenterId: query.costCenterId,
      positionId: query.positionId,
      locationName: query.locationName
        ? { contains: query.locationName.trim(), mode: 'insensitive' }
      : undefined,
    };
  }

  private coverageRuleDimensionWhere(query: {
    organizationNodeId?: string;
    costCenterId?: string;
    positionId?: string;
    locationName?: string;
  }): Prisma.ScheduleCoverageRuleWhereInput {
    return {
      organizationNodeId: query.organizationNodeId,
      costCenterId: query.costCenterId,
      positionId: query.positionId,
      locationName: query.locationName
        ? { contains: query.locationName.trim(), mode: 'insensitive' }
        : undefined,
    };
  }

  private availabilityDimensionWhere(query: {
    organizationNodeId?: string;
    costCenterId?: string;
    positionId?: string;
    locationName?: string;
  }): Prisma.EmployeeAvailabilityWhereInput | null {
    const activeAssignmentWhere = this.activeEmployeeAssignmentDimensionWhere(query);

    if (!activeAssignmentWhere) {
      return null;
    }

    return {
      employee: {
        assignments: {
          some: activeAssignmentWhere,
        },
      },
    };
  }

  private activeEmployeeAssignmentDimensionWhere(query: {
    organizationNodeId?: string;
    costCenterId?: string;
    positionId?: string;
    locationName?: string;
  }): Prisma.EmployeeAssignmentWhereInput | null {
    const hasDimensions = Boolean(
      query.organizationNodeId ||
      query.costCenterId ||
      query.positionId ||
      query.locationName?.trim(),
    );

    if (!hasDimensions) {
      return null;
    }

    const now = new Date();
    const andFilters: Prisma.EmployeeAssignmentWhereInput[] = [
      {
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
    ];

    if (query.locationName?.trim()) {
      andFilters.push({
        OR: [
          {
            organizationNode: {
              name: { contains: query.locationName.trim(), mode: 'insensitive' },
            },
          },
          {
            costCenter: {
              name: { contains: query.locationName.trim(), mode: 'insensitive' },
            },
          },
        ],
      });
    }

    return {
      isPrimary: true,
      effectiveFrom: { lte: now },
      AND: andFilters,
      organizationNodeId: query.organizationNodeId,
      costCenterId: query.costCenterId,
      positionId: query.positionId,
    };
  }

  private openShiftClaimConflict(status: OpenShiftClaimStatus) {
    const messageByStatus: Record<OpenShiftClaimStatus, string> = {
      [OpenShiftClaimStatus.REQUESTED]: 'You have already requested this open shift. It is waiting for approval.',
      [OpenShiftClaimStatus.APPROVED]: 'This open shift is already approved for you.',
      [OpenShiftClaimStatus.REJECTED]: 'Your previous pickup request was rejected. Ask HR or your manager before submitting again.',
      [OpenShiftClaimStatus.CANCELLED]: 'Your previous pickup request was cancelled. Ask HR or your manager if you need it reopened.',
    };

    return new ConflictException(messageByStatus[status]);
  }

  private openShiftDecisionTitle(status: OpenShiftClaimStatus) {
    const titles: Record<OpenShiftClaimStatus, string> = {
      [OpenShiftClaimStatus.REQUESTED]: 'Open shift requested',
      [OpenShiftClaimStatus.APPROVED]: 'Open shift approved',
      [OpenShiftClaimStatus.REJECTED]: 'Open shift rejected',
      [OpenShiftClaimStatus.CANCELLED]: 'Open shift cancelled',
    };

    return titles[status];
  }

  private async openShiftIncludeForActor(actor: AuthenticatedPrincipal): Promise<Prisma.OpenShiftInclude> {
    if (
      actor.permissions.includes('scheduling.write') ||
      actor.permissions.includes('scheduling.team.write')
    ) {
      return this.openShiftInclude;
    }

    const employee = await this.getSelfEmployeeOrNull(actor);
    return {
      shift: true,
      policy: true,
      schedule: true,
      organizationNode: true,
      costCenter: true,
      position: true,
      claims: {
        where: { employeeId: employee?.id ?? '__none__' },
        include: { employee: { include: { person: true } } },
      },
    } satisfies Prisma.OpenShiftInclude;
  }

  private isUniqueConstraintError(error: unknown, fields: string[]) {
    if (!this.hasPrismaErrorCode(error, 'P2002')) {
      return false;
    }

    const target = (error as { meta?: { target?: unknown } }).meta?.target;

    if (Array.isArray(target)) {
      return fields.every((field) => target.includes(field));
    }

    if (typeof target === 'string') {
      return fields.every((field) => target.includes(field));
    }

    return true;
  }

  private hasPrismaErrorCode(error: unknown, code: string) {
    return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
  }

  private jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  private toJson(value?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
    return value ? (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue) : undefined;
  }

  private async writeTimeline(
    client: Tx,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    employeeId: string,
    type: TimelineEventType,
    event: {
      title: string;
      description?: string;
      entityType: string;
      entityId: string;
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
      },
    });
  }

  private async writeAudit(
    client: Tx,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await client.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.id,
        action,
        module: 'scheduling',
        entityType,
        entityId,
        before: before ? this.toJson(before as Record<string, unknown>) : undefined,
        after: after ? this.toJson(after as Record<string, unknown>) : undefined,
      },
    });
  }

  private async writeOutbox(
    client: Tx,
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

  private readonly assignmentInclude = {
    employee: { include: { person: true } },
    shift: true,
    policy: true,
    schedule: true,
    organizationNode: true,
    costCenter: true,
    position: true,
  } satisfies Prisma.ScheduleAssignmentInclude;

  private readonly openShiftInclude = {
    shift: true,
    policy: true,
    schedule: true,
    organizationNode: true,
    costCenter: true,
    position: true,
    claims: { include: { employee: { include: { person: true } } } },
  } satisfies Prisma.OpenShiftInclude;

  private readonly coverageRuleInclude = {
    policy: true,
    shift: true,
    organizationNode: true,
    costCenter: true,
    position: true,
  } satisfies Prisma.ScheduleCoverageRuleInclude;

  private readonly claimInclude = {
    employee: { include: { person: true } },
    openShift: { include: { shift: true, organizationNode: true, costCenter: true, position: true } },
    assignment: true,
  } satisfies Prisma.OpenShiftClaimInclude;

  private readonly swapRequestInclude = {
    assignment: {
      include: {
        employee: { include: { person: true } },
        shift: true,
        schedule: true,
        organizationNode: true,
        costCenter: true,
        position: true,
      },
    },
    requesterEmployee: { include: { person: true } },
    targetEmployee: { include: { person: true } },
    decidedBy: true,
  } satisfies Prisma.ScheduleSwapRequestInclude;

  private readonly overtimeInclude = {
    employee: { include: { person: true } },
    policy: true,
    assignment: true,
  } satisfies Prisma.OvertimeRequestInclude;

  private employeeCandidateInclude(now: Date) {
    return {
      person: true,
      assignments: {
        where: this.currentPrimaryAssignmentWhere(now),
        orderBy: { effectiveFrom: 'desc' },
        take: 1,
        include: {
          organizationNode: true,
          costCenter: true,
          position: true,
          managerEmployee: { include: { person: true } },
        },
      },
    } satisfies Prisma.EmployeeInclude;
  }
}
