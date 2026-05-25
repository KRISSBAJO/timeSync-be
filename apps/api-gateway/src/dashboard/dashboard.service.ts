import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovalRequestStatus,
  AuditAction,
  DocumentVerificationStatus,
  EmployeeStatus,
  InvitationStatus,
  NotificationChannel,
  NotificationStatus,
  OutboxStatus,
  PositionStatus,
  TenantStatus,
  UserStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { HistoryWriterService } from '../history/history-writer.service';
import {
  AnalyticsSnapshotKey,
  ListAnalyticsSnapshotsQueryDto,
  RefreshAnalyticsSnapshotDto,
} from './dto/analytics-snapshot.dto';
import { DataQualityActionDto, DataQualityActionType } from './dto/data-quality-action.dto';
import { DashboardPeriod, DashboardQueryDto } from './dto/dashboard-query.dto';
import {
  ListDashboardWidgetsQueryDto,
  UpdateDashboardWidgetDto,
  UpsertDashboardWidgetDto,
} from './dto/dashboard-widget.dto';

const ACTIVE_EMPLOYEE_STATUSES = [
  EmployeeStatus.PREBOARDING,
  EmployeeStatus.ACTIVE,
  EmployeeStatus.PROBATION,
  EmployeeStatus.SUSPENDED,
];

const TERMINAL_EMPLOYEE_STATUSES = [
  EmployeeStatus.SEPARATED,
  EmployeeStatus.RETIRED,
  EmployeeStatus.ALUMNI,
  EmployeeStatus.ARCHIVED,
];

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historyWriter: HistoryWriterService,
  ) {}

  async getExecutiveOverview(actor: AuthenticatedPrincipal, query: DashboardQueryDto) {
    const scope = await this.resolveReadableScope(actor, query.tenantId);
    const period = this.resolvePeriod(query);
    const [
      platform,
      workforce,
      positions,
      approvals,
      documents,
      notifications,
      operations,
      risks,
      widgets,
    ] = await Promise.all([
      scope.tenantId ? Promise.resolve(null) : this.getPlatformDashboard(period),
      this.getWorkforceMetrics(scope.tenantId, period),
      this.getPositionMetrics(scope.tenantId),
      this.getApprovalMetrics(actor, scope.tenantId, period),
      this.getDocumentMetrics(scope.tenantId, period, query.expiresWithinDays ?? 60),
      this.getNotificationMetrics(actor, scope.tenantId, period),
      this.getOperationalMetrics(scope.tenantId, period),
      this.getRiskMetrics(scope.tenantId, period, query.expiresWithinDays ?? 60),
      this.listWidgetsForScope(scope.tenantId, { activeOnly: true }),
    ]);

    return {
      scope,
      generatedAt: new Date().toISOString(),
      period: this.periodResponse(period),
      platform,
      workforce,
      positions,
      approvals,
      documents,
      notifications,
      operations,
      risks,
      widgets,
    };
  }

  async getWorkforceDashboard(actor: AuthenticatedPrincipal, query: DashboardQueryDto) {
    const scope = await this.resolveReadableScope(actor, query.tenantId);
    const period = this.resolvePeriod(query);
    const [workforce, distribution, trend] = await Promise.all([
      this.getWorkforceMetrics(scope.tenantId, period),
      this.getOrganizationDistribution(scope.tenantId),
      this.getHeadcountTrend(scope.tenantId, period),
    ]);

    return {
      scope,
      generatedAt: new Date().toISOString(),
      period: this.periodResponse(period),
      workforce,
      organizationDistribution: distribution,
      headcountTrend: trend,
    };
  }

  async getOperationsDashboard(actor: AuthenticatedPrincipal, query: DashboardQueryDto) {
    const scope = await this.resolveReadableScope(actor, query.tenantId);
    const period = this.resolvePeriod(query);
    const [approvals, documents, notifications, operations] = await Promise.all([
      this.getApprovalMetrics(actor, scope.tenantId, period),
      this.getDocumentMetrics(scope.tenantId, period, query.expiresWithinDays ?? 60),
      this.getNotificationMetrics(actor, scope.tenantId, period),
      this.getOperationalMetrics(scope.tenantId, period),
    ]);

    return {
      scope,
      generatedAt: new Date().toISOString(),
      period: this.periodResponse(period),
      approvals,
      documents,
      notifications,
      operations,
    };
  }

  async getRiskDashboard(actor: AuthenticatedPrincipal, query: DashboardQueryDto) {
    const scope = await this.resolveReadableScope(actor, query.tenantId);
    const period = this.resolvePeriod(query);

    return {
      scope,
      generatedAt: new Date().toISOString(),
      period: this.periodResponse(period),
      risks: await this.getRiskMetrics(scope.tenantId, period, query.expiresWithinDays ?? 60),
    };
  }

  async getDataQualityDashboard(actor: AuthenticatedPrincipal, query: DashboardQueryDto) {
    const scope = await this.resolveReadableScope(actor, query.tenantId);
    const period = this.resolvePeriod(query);
    const expiresWithinDays = query.expiresWithinDays ?? 60;
    const [
      workforce,
      documents,
      positions,
      approvals,
      security,
      governance,
    ] = await Promise.all([
      this.getWorkforceQuality(scope.tenantId),
      this.getDocumentQuality(scope.tenantId, expiresWithinDays),
      this.getPositionQuality(scope.tenantId),
      this.getApprovalQuality(scope.tenantId),
      this.getSecurityQuality(scope.tenantId),
      this.getGovernanceQuality(scope.tenantId, period),
    ]);
    const groups = [workforce, documents, positions, approvals, security, governance];
    const totalIssues = groups.reduce((sum, group) => sum + group.issueCount, 0);
    const weightedRisk = groups.reduce((sum, group) => sum + group.scoreImpact, 0);

    return {
      scope,
      generatedAt: new Date().toISOString(),
      period: this.periodResponse(period),
      score: Math.max(0, 100 - Math.min(100, weightedRisk)),
      summary: {
        totalIssues,
        critical: this.issueCountBySeverity(groups, 'critical'),
        high: this.issueCountBySeverity(groups, 'high'),
        medium: this.issueCountBySeverity(groups, 'medium'),
        low: this.issueCountBySeverity(groups, 'low'),
      },
      groups,
      recommendedActions: groups
        .flatMap((group) => group.recommendedActions)
        .slice(0, 8),
    };
  }

  async handleDataQualityAction(actor: AuthenticatedPrincipal, dto: DataQualityActionDto) {
    const tenantId = await this.resolveWritableRequiredTenant(actor);
    const issue = {
      issueId: dto.issueId,
      severity: dto.severity ?? null,
      title: dto.title,
      description: dto.description ?? null,
      entityType: dto.entityType,
      entityId: dto.entityId,
      href: dto.href ?? null,
      note: dto.note ?? null,
    };

    if (dto.action === DataQualityActionType.MARK_REVIEWED) {
      return this.prisma.$transaction(async (tx) => {
        await this.historyWriter.writeAudit(tx, {
          tenantId,
          actorUserId: actor.id,
          action: AuditAction.UPDATE,
          module: 'data-quality',
          entityType: dto.entityType,
          entityId: dto.entityId,
          after: {
            ...issue,
            action: dto.action,
            reviewedAt: new Date().toISOString(),
          },
        });

        await this.historyWriter.writeActivity(tx, {
          tenantId,
          userId: actor.id,
          module: 'data-quality',
          message: `Data quality issue reviewed: ${dto.title}.`,
          metadata: issue,
        });

        await this.historyWriter.writeOutbox(tx, {
          tenantId,
          eventType: 'data_quality.issue.reviewed',
          aggregateType: dto.entityType,
          aggregateId: dto.entityId,
          payload: {
            ...issue,
            reviewedById: actor.id,
          },
        });

        return {
          action: dto.action,
          issueId: dto.issueId,
          status: 'RECORDED',
          recipientCount: 0,
        };
      });
    }

    const stewards = await this.findTenantStewards(tenantId, actor.id);

    if (stewards.length === 0) {
      throw new BadRequestException('No active tenant stewards are available for this remediation alert.');
    }

    return this.prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          tenantId,
          channel: NotificationChannel.IN_APP,
          title: `Data quality action needed: ${dto.title}`,
          body: dto.description ?? 'A TimeSync data quality issue needs steward review.',
          status: NotificationStatus.SENT,
          templateCode: 'DATA_QUALITY_STEWARD_ALERT',
          data: this.toInputJson({
            module: 'data-quality',
            ...issue,
            action: dto.action,
          }),
          sentAt: new Date(),
          recipients: {
            create: stewards.map((steward) => ({
              userId: steward.id,
              destination: steward.email,
              status: NotificationStatus.SENT,
              deliveredAt: new Date(),
            })),
          },
        },
        include: { recipients: true },
      });

      await this.historyWriter.writeAudit(tx, {
        tenantId,
        actorUserId: actor.id,
        action: AuditAction.CREATE,
        module: 'data-quality',
        entityType: 'Notification',
        entityId: notification.id,
        after: {
          ...issue,
          recipientCount: notification.recipients.length,
        },
      });

      await this.historyWriter.writeActivity(tx, {
        tenantId,
        userId: actor.id,
        module: 'data-quality',
        message: `Notified stewards for data quality issue: ${dto.title}.`,
        metadata: {
          ...issue,
          notificationId: notification.id,
          recipientCount: notification.recipients.length,
        },
      });

      await this.historyWriter.writeOutbox(tx, {
        tenantId,
        eventType: 'data_quality.stewards.notified',
        aggregateType: dto.entityType,
        aggregateId: dto.entityId,
        payload: {
          ...issue,
          notificationId: notification.id,
          recipientCount: notification.recipients.length,
        },
      });

      return {
        action: dto.action,
        issueId: dto.issueId,
        status: 'NOTIFIED',
        notificationId: notification.id,
        recipientCount: notification.recipients.length,
      };
    });
  }

  async getPositionControlDashboard(actor: AuthenticatedPrincipal, query: DashboardQueryDto) {
    const scope = await this.resolveReadableScope(actor, query.tenantId);
    const [positions, distribution] = await Promise.all([
      this.getPositionMetrics(scope.tenantId),
      this.getPositionDistribution(scope.tenantId),
    ]);

    return {
      scope,
      generatedAt: new Date().toISOString(),
      positions,
      positionDistribution: distribution,
    };
  }

  async listWidgets(actor: AuthenticatedPrincipal, query: ListDashboardWidgetsQueryDto) {
    const scope = await this.resolveReadableScope(actor, query.tenantId);
    return this.listWidgetsForScope(scope.tenantId, query);
  }

  async upsertWidget(actor: AuthenticatedPrincipal, dto: UpsertDashboardWidgetDto) {
    const tenantId = await this.resolveWritableOptionalTenant(actor, dto.tenantId);
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.dashboardWidget.findFirst({
      where: {
        tenantId,
        code,
      },
    });

    return this.prisma.$transaction(async (tx) => {
      const widget = existing
        ? await tx.dashboardWidget.update({
            where: { id: existing.id },
            data: {
              name: dto.name.trim(),
              module: dto.module.trim(),
              config: this.toInputJsonOrUndefined(dto.config),
              isActive: dto.isActive ?? true,
            },
          })
        : await tx.dashboardWidget.create({
            data: {
              tenantId,
              code,
              name: dto.name.trim(),
              module: dto.module.trim(),
              config: this.toInputJsonOrUndefined(dto.config),
              isActive: dto.isActive ?? true,
            },
          });

      await this.historyWriter.writeAudit(tx, {
        tenantId,
        actorUserId: actor.id,
        action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
        module: 'dashboard',
        entityType: 'DashboardWidget',
        entityId: widget.id,
        before: existing ? this.widgetState(existing) : null,
        after: this.widgetState(widget),
      });

      await this.historyWriter.writeActivity(tx, {
        tenantId,
        userId: actor.id,
        module: 'dashboard',
        message: `Dashboard widget ${existing ? 'updated' : 'created'}: ${widget.code}.`,
        metadata: {
          dashboardWidgetId: widget.id,
          code: widget.code,
        },
      });

      return widget;
    });
  }

  async updateWidget(actor: AuthenticatedPrincipal, widgetId: string, dto: UpdateDashboardWidgetDto) {
    const existing = await this.findWritableWidget(actor, widgetId);
    const code = dto.code ? dto.code.trim().toUpperCase() : undefined;

    if (code && code !== existing.code) {
      const duplicate = await this.prisma.dashboardWidget.findFirst({
        where: {
          id: { not: existing.id },
          tenantId: existing.tenantId,
          code,
        },
      });

      if (duplicate) {
        throw new BadRequestException('A dashboard widget with this code already exists.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dashboardWidget.update({
        where: { id: existing.id },
        data: {
          code,
          name: dto.name?.trim(),
          module: dto.module?.trim(),
          config: dto.config === undefined ? undefined : this.toInputJsonOrUndefined(dto.config),
          isActive: dto.isActive,
        },
      });

      await this.historyWriter.writeAudit(tx, {
        tenantId: updated.tenantId,
        actorUserId: actor.id,
        action: AuditAction.UPDATE,
        module: 'dashboard',
        entityType: 'DashboardWidget',
        entityId: updated.id,
        before: this.widgetState(existing),
        after: this.widgetState(updated),
      });

      return updated;
    });
  }

  async listAnalyticsSnapshots(
    actor: AuthenticatedPrincipal,
    query: ListAnalyticsSnapshotsQueryDto,
  ) {
    const scope = await this.resolveReadableScope(actor, query.tenantId);
    if (!scope.tenantId) {
      throw new BadRequestException('tenantId is required when listing analytics snapshots from platform scope.');
    }

    const limit = query.limit ?? 50;
    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: {
        tenantId: scope.tenantId,
        key: query.key,
        period: query.period,
        createdAt: this.dateRange(query.createdFrom, query.createdTo),
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return this.paginate(snapshots, limit);
  }

  async latestAnalyticsSnapshots(
    actor: AuthenticatedPrincipal,
    query: ListAnalyticsSnapshotsQueryDto,
  ) {
    const scope = await this.resolveReadableScope(actor, query.tenantId);
    if (!scope.tenantId) {
      throw new BadRequestException('tenantId is required when reading analytics snapshots from platform scope.');
    }

    const keys = query.key
      ? [query.key]
      : [
          AnalyticsSnapshotKey.EXECUTIVE_OVERVIEW,
          AnalyticsSnapshotKey.WORKFORCE_OVERVIEW,
          AnalyticsSnapshotKey.POSITION_CONTROL,
          AnalyticsSnapshotKey.OPERATIONAL_HEALTH,
          AnalyticsSnapshotKey.RISK_REGISTER,
        ];

    const snapshots = await Promise.all(
      keys.map((key) =>
        this.prisma.analyticsSnapshot.findFirst({
          where: {
            tenantId: scope.tenantId,
            key,
            period: query.period,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      ),
    );

    return {
      data: snapshots.filter((snapshot) => snapshot !== null),
    };
  }

  async refreshAnalyticsSnapshot(
    actor: AuthenticatedPrincipal,
    dto: RefreshAnalyticsSnapshotDto,
  ) {
    const tenantId = await this.resolveWritableRequiredTenant(actor, dto.tenantId);
    const key = dto.key ?? AnalyticsSnapshotKey.EXECUTIVE_OVERVIEW;
    const period = this.resolvePeriod(dto);
    const value = await this.analyticsValueForKey(actor, tenantId, key, {
      tenantId,
      period: dto.period,
      from: dto.from,
      to: dto.to,
    });

    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.analyticsSnapshot.create({
        data: {
          tenantId,
          key,
          value: this.toInputJson(value),
          period: period.key,
        },
      });

      await this.historyWriter.writeAudit(tx, {
        tenantId,
        actorUserId: actor.id,
        action: AuditAction.CREATE,
        module: 'analytics',
        entityType: 'AnalyticsSnapshot',
        entityId: snapshot.id,
        after: {
          key,
          period: period.key,
        },
      });

      await this.historyWriter.writeActivity(tx, {
        tenantId,
        userId: actor.id,
        module: 'analytics',
        message: `Analytics snapshot refreshed: ${key}.`,
        metadata: {
          analyticsSnapshotId: snapshot.id,
          key,
          period: period.key,
        },
      });

      await this.historyWriter.writeOutbox(tx, {
        tenantId,
        eventType: 'analytics.snapshot.created',
        aggregateType: 'AnalyticsSnapshot',
        aggregateId: snapshot.id,
        payload: {
          tenantId,
          analyticsSnapshotId: snapshot.id,
          key,
          period: period.key,
        },
      });

      return snapshot;
    });
  }

  private async analyticsValueForKey(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    key: AnalyticsSnapshotKey,
    query: DashboardQueryDto,
  ) {
    switch (key) {
      case AnalyticsSnapshotKey.WORKFORCE_OVERVIEW:
        return this.getWorkforceDashboard(actor, query);
      case AnalyticsSnapshotKey.POSITION_CONTROL:
        return this.getPositionControlDashboard(actor, query);
      case AnalyticsSnapshotKey.OPERATIONAL_HEALTH:
        return this.getOperationsDashboard(actor, query);
      case AnalyticsSnapshotKey.RISK_REGISTER:
        return this.getRiskDashboard(actor, query);
      case AnalyticsSnapshotKey.EXECUTIVE_OVERVIEW:
      default:
        return this.getExecutiveOverview(actor, query);
    }
  }

  private async getPlatformDashboard(period: ResolvedPeriod) {
    const [tenantGroups, activeTenants, usersByStatus, activeSessions, employeeCount, outboxFailed] =
      await Promise.all([
        this.prisma.tenant.groupBy({
          by: ['status'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.tenant.count({
          where: {
            deletedAt: null,
            status: TenantStatus.ACTIVE,
          },
        }),
        this.prisma.user.groupBy({
          by: ['status'],
          where: {
            deletedAt: null,
          },
          _count: { _all: true },
        }),
        this.prisma.session.count({
          where: {
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
        this.prisma.employee.count({
          where: {
            deletedAt: null,
          },
        }),
        this.prisma.outboxMessage.count({
          where: {
            status: OutboxStatus.FAILED,
            createdAt: { gte: period.from, lte: period.to },
          },
        }),
      ]);

    return {
      tenants: {
        active: activeTenants,
        byStatus: this.countMap(tenantGroups, 'status'),
      },
      users: {
        activeSessions,
        byStatus: this.countMap(usersByStatus, 'status'),
      },
      workforce: {
        employeeCount,
      },
      outbox: {
        failedInPeriod: outboxFailed,
      },
    };
  }

  private async getWorkforceMetrics(tenantId: string | null, period: ResolvedPeriod) {
    const tenantWhere = this.tenantWhere(tenantId);
    const asOf = period.to;
    const currentAssignmentWhere = this.currentAssignmentWhere(tenantId, asOf);
    const [
      total,
      active,
      byStatus,
      byEmploymentType,
      hiresInPeriod,
      separationsInPeriod,
      currentAssignments,
      currentPrimaryAssignments,
      employeesWithoutPrimaryAssignment,
      managerlessPrimaryAssignments,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { ...tenantWhere, deletedAt: null } }),
      this.prisma.employee.count({
        where: {
          ...tenantWhere,
          deletedAt: null,
          status: { in: ACTIVE_EMPLOYEE_STATUSES },
        },
      }),
      this.prisma.employee.groupBy({
        by: ['status'],
        where: {
          ...tenantWhere,
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      this.prisma.employee.groupBy({
        by: ['employmentType'],
        where: {
          ...tenantWhere,
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      this.prisma.employee.count({
        where: {
          ...tenantWhere,
          deletedAt: null,
          hireDate: { gte: period.from, lte: period.to },
        },
      }),
      this.prisma.employee.count({
        where: {
          ...tenantWhere,
          deletedAt: null,
          status: { in: TERMINAL_EMPLOYEE_STATUSES },
          endDate: { gte: period.from, lte: period.to },
        },
      }),
      this.prisma.employeeAssignment.count({
        where: currentAssignmentWhere,
      }),
      this.prisma.employeeAssignment.count({
        where: {
          ...currentAssignmentWhere,
          isPrimary: true,
        },
      }),
      this.prisma.employee.count({
        where: {
          ...tenantWhere,
          deletedAt: null,
          status: { in: ACTIVE_EMPLOYEE_STATUSES },
          assignments: {
            none: {
              isPrimary: true,
              effectiveFrom: { lte: asOf },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
            },
          },
        },
      }),
      this.prisma.employeeAssignment.count({
        where: {
          ...currentAssignmentWhere,
          isPrimary: true,
          managerEmployeeId: null,
        },
      }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      hiresInPeriod,
      separationsInPeriod,
      attritionRate:
        active === 0 ? 0 : Number(((separationsInPeriod / active) * 100).toFixed(2)),
      byStatus: this.countMap(byStatus, 'status'),
      byEmploymentType: this.countMap(byEmploymentType, 'employmentType'),
      assignments: {
        current: currentAssignments,
        primary: currentPrimaryAssignments,
        employeesWithoutPrimaryAssignment,
        managerlessPrimaryAssignments,
      },
    };
  }

  private async getPositionMetrics(tenantId: string | null) {
    const tenantWhere = this.tenantWhere(tenantId);
    const now = new Date();
    const currentPositionAssignments = await this.prisma.employeeAssignment.groupBy({
      by: ['positionId'],
      where: {
        ...this.currentAssignmentWhere(tenantId, now),
        isPrimary: true,
        positionId: { not: null },
      },
      _count: { _all: true },
    });
    const occupantCountByPosition = new Map(
      currentPositionAssignments
        .filter((item) => item.positionId)
        .map((item) => [item.positionId as string, item._count._all]),
    );

    const [positions, byStatus, critical, executive, budget] = await Promise.all([
      this.prisma.position.findMany({
        where: {
          ...tenantWhere,
          deletedAt: null,
        },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          budgetedHeadcount: true,
          organizationNodeId: true,
        },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.position.groupBy({
        by: ['status'],
        where: {
          ...tenantWhere,
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      this.prisma.position.count({
        where: {
          ...tenantWhere,
          deletedAt: null,
          isCritical: true,
        },
      }),
      this.prisma.position.count({
        where: {
          ...tenantWhere,
          deletedAt: null,
          isExecutive: true,
        },
      }),
      this.prisma.position.aggregate({
        where: {
          ...tenantWhere,
          deletedAt: null,
        },
        _sum: {
          budgetedHeadcount: true,
        },
      }),
    ]);

    const occupiedHeadcount = Array.from(occupantCountByPosition.values()).reduce(
      (sum, count) => sum + count,
      0,
    );
    const budgetedHeadcount = budget._sum.budgetedHeadcount ?? 0;
    const positionCapacity = positions.map((position) => {
      const occupied = occupantCountByPosition.get(position.id) ?? 0;
      return {
        id: position.id,
        code: position.code,
        title: position.title,
        status: position.status,
        budgetedHeadcount: position.budgetedHeadcount,
        occupiedHeadcount: occupied,
        vacancyHeadcount: Math.max(position.budgetedHeadcount - occupied, 0),
        overCapacityHeadcount: Math.max(occupied - position.budgetedHeadcount, 0),
      };
    });

    return {
      total: positions.length,
      active: positions.filter((position) => position.status === PositionStatus.ACTIVE).length,
      byStatus: this.countMap(byStatus, 'status'),
      budgetedHeadcount,
      occupiedHeadcount,
      vacancyHeadcount: Math.max(budgetedHeadcount - occupiedHeadcount, 0),
      critical,
      executive,
      overCapacityPositions: positionCapacity
        .filter((position) => position.overCapacityHeadcount > 0)
        .slice(0, 20),
      vacancies: positionCapacity
        .filter((position) => position.vacancyHeadcount > 0 && position.status === PositionStatus.ACTIVE)
        .slice(0, 20),
    };
  }

  private async getApprovalMetrics(
    actor: AuthenticatedPrincipal,
    tenantId: string | null,
    period: ResolvedPeriod,
  ) {
    const tenantWhere = this.tenantWhere(tenantId);
    const now = new Date();
    const [byStatus, pending, completedInPeriod, overdueSteps, myPendingTasks, completedRequests] =
      await Promise.all([
        this.prisma.approvalRequest.groupBy({
          by: ['status'],
          where: {
            ...tenantWhere,
          },
          _count: { _all: true },
        }),
        this.prisma.approvalRequest.count({
          where: {
            ...tenantWhere,
            status: ApprovalRequestStatus.PENDING,
          },
        }),
        this.prisma.approvalRequest.count({
          where: {
            ...tenantWhere,
            status: ApprovalRequestStatus.COMPLETED,
            completedAt: { gte: period.from, lte: period.to },
          },
        }),
        this.prisma.approvalStepInstance.count({
          where: {
            status: ApprovalRequestStatus.PENDING,
            dueAt: { lt: now },
            approvalRequest: tenantWhere,
          },
        }),
        this.prisma.approvalStepInstance.count({
          where: {
            status: ApprovalRequestStatus.PENDING,
            approvalRequest: tenantWhere,
            OR: [
              { assignedUserId: actor.id },
              {
                assignedRole: {
                  userRoles: {
                    some: {
                      userId: actor.id,
                    },
                  },
                },
              },
            ],
          },
        }),
        this.prisma.approvalRequest.findMany({
          where: {
            ...tenantWhere,
            completedAt: { gte: period.from, lte: period.to },
            submittedAt: { not: null },
          },
          select: {
            submittedAt: true,
            completedAt: true,
          },
          take: 250,
        }),
      ]);

    const completionHours = completedRequests
      .filter((request) => request.submittedAt && request.completedAt)
      .map((request) =>
        Number(
          (
            (request.completedAt!.getTime() - request.submittedAt!.getTime()) /
            (1000 * 60 * 60)
          ).toFixed(2),
        ),
      );

    return {
      pending,
      completedInPeriod,
      overdueSteps,
      myPendingTasks,
      byStatus: this.countMap(byStatus, 'status'),
      averageCompletionHours:
        completionHours.length === 0
          ? null
          : Number(
              (
                completionHours.reduce((sum, value) => sum + value, 0) / completionHours.length
              ).toFixed(2),
            ),
    };
  }

  private async getDocumentMetrics(
    tenantId: string | null,
    period: ResolvedPeriod,
    expiresWithinDays: number,
  ) {
    const tenantWhere = this.tenantWhere(tenantId);
    const now = new Date();
    const expiryWindowEnd = new Date(now.getTime() + expiresWithinDays * 24 * 60 * 60 * 1000);
    const [byVerificationStatus, uploadedInPeriod, pendingVerification, expiringSoon, expired, noFile] =
      await Promise.all([
        this.prisma.document.groupBy({
          by: ['verificationStatus'],
          where: {
            ...tenantWhere,
            deletedAt: null,
          },
          _count: { _all: true },
        }),
        this.prisma.document.count({
          where: {
            ...tenantWhere,
            deletedAt: null,
            createdAt: { gte: period.from, lte: period.to },
          },
        }),
        this.prisma.document.count({
          where: {
            ...tenantWhere,
            deletedAt: null,
            verificationStatus: DocumentVerificationStatus.PENDING,
          },
        }),
        this.prisma.document.count({
          where: {
            ...tenantWhere,
            deletedAt: null,
            expiresAt: { gte: now, lte: expiryWindowEnd },
          },
        }),
        this.prisma.document.count({
          where: {
            ...tenantWhere,
            deletedAt: null,
            expiresAt: { lt: now },
          },
        }),
        this.prisma.document.count({
          where: {
            ...tenantWhere,
            deletedAt: null,
            currentVersionId: null,
          },
        }),
      ]);

    return {
      uploadedInPeriod,
      pendingVerification,
      expiringSoon,
      expired,
      missingCurrentVersion: noFile,
      byVerificationStatus: this.countMap(byVerificationStatus, 'verificationStatus'),
    };
  }

  private async getNotificationMetrics(
    actor: AuthenticatedPrincipal,
    tenantId: string | null,
    period: ResolvedPeriod,
  ) {
    const tenantWhere = this.tenantWhere(tenantId);
    const [outboundByStatus, recipientByStatus, sentInPeriod, failedInPeriod, unreadForUser] =
      await Promise.all([
        this.prisma.notification.groupBy({
          by: ['status'],
          where: tenantWhere,
          _count: { _all: true },
        }),
        this.prisma.notificationRecipient.groupBy({
          by: ['status'],
          where: {
            notification: tenantWhere,
          },
          _count: { _all: true },
        }),
        this.prisma.notification.count({
          where: {
            ...tenantWhere,
            createdAt: { gte: period.from, lte: period.to },
          },
        }),
        this.prisma.notificationRecipient.count({
          where: {
            status: NotificationStatus.FAILED,
            createdAt: { gte: period.from, lte: period.to },
            notification: tenantWhere,
          },
        }),
        this.prisma.notificationRecipient.count({
          where: {
            userId: actor.id,
            readAt: null,
            notification: tenantWhere,
          },
        }),
      ]);

    return {
      sentInPeriod,
      failedInPeriod,
      unreadForUser,
      outboundByStatus: this.countMap(outboundByStatus, 'status'),
      recipientByStatus: this.countMap(recipientByStatus, 'status'),
    };
  }

  private async getWorkforceQuality(tenantId: string | null) {
    const now = new Date();
    const activeEmployeeWhere = {
      ...this.tenantWhere(tenantId),
      deletedAt: null,
      status: { in: ACTIVE_EMPLOYEE_STATUSES },
    };
    const [withoutPrimary, managerlessAssignments, missingHireDate, incompleteIdentity] =
      await Promise.all([
        this.prisma.employee.findMany({
          where: {
            ...activeEmployeeWhere,
            assignments: {
              none: {
                isPrimary: true,
                effectiveFrom: { lte: now },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
              },
            },
          },
          take: 12,
          include: {
            person: { select: { firstName: true, lastName: true, preferredName: true } },
          },
          orderBy: [{ updatedAt: 'desc' }],
        }),
        this.prisma.employeeAssignment.findMany({
          where: {
            ...this.currentAssignmentWhere(tenantId, now),
            isPrimary: true,
            managerEmployeeId: null,
          },
          take: 12,
          include: {
            employee: {
              include: {
                person: { select: { firstName: true, lastName: true, preferredName: true } },
              },
            },
            position: { select: { title: true, code: true } },
          },
          orderBy: [{ updatedAt: 'desc' }],
        }),
        this.prisma.employee.findMany({
          where: {
            ...activeEmployeeWhere,
            hireDate: null,
          },
          take: 12,
          include: {
            person: { select: { firstName: true, lastName: true, preferredName: true } },
          },
          orderBy: [{ updatedAt: 'desc' }],
        }),
        this.prisma.employee.findMany({
          where: {
            ...activeEmployeeWhere,
            OR: [{ person: { dateOfBirth: null } }, { person: { nationalityId: null } }],
          },
          take: 12,
          include: {
            person: { select: { firstName: true, lastName: true, preferredName: true } },
          },
          orderBy: [{ updatedAt: 'desc' }],
        }),
      ]);
    const issues = [
      ...withoutPrimary.map((employee) =>
        this.qualityIssue({
          id: `employee-primary-${employee.id}`,
          severity: 'high',
          title: `${employee.employeeNumber} has no primary assignment`,
          description: `${this.personName(employee.person)} needs a current primary placement for reporting and org analytics.`,
          href: `/workforce?employee=${employee.id}`,
          entityType: 'Employee',
          entityId: employee.id,
        }),
      ),
      ...managerlessAssignments.map((assignment) =>
        this.qualityIssue({
          id: `assignment-manager-${assignment.id}`,
          severity: 'medium',
          title: `${assignment.employee.employeeNumber} has no manager`,
          description: `${assignment.position?.title ?? assignment.position?.code ?? 'Primary assignment'} is missing a manager relationship.`,
          href: `/workforce?employee=${assignment.employeeId}`,
          entityType: 'EmployeeAssignment',
          entityId: assignment.id,
        }),
      ),
      ...missingHireDate.map((employee) =>
        this.qualityIssue({
          id: `employee-hire-date-${employee.id}`,
          severity: 'medium',
          title: `${employee.employeeNumber} is missing hire date`,
          description: 'Hire date is required for lifecycle analytics, tenure, and downstream payroll readiness.',
          href: `/workforce?employee=${employee.id}`,
          entityType: 'Employee',
          entityId: employee.id,
        }),
      ),
      ...incompleteIdentity.map((employee) =>
        this.qualityIssue({
          id: `person-identity-${employee.personId}`,
          severity: 'low',
          title: `${employee.employeeNumber} has incomplete person identity`,
          description: `${this.personName(employee.person)} is missing date of birth or nationality metadata.`,
          href: `/workforce?employee=${employee.id}`,
          entityType: 'Person',
          entityId: employee.personId,
        }),
      ),
    ];

    return this.qualityGroup({
      code: 'WORKFORCE_DATA',
      title: 'Workforce data integrity',
      description: 'Assignment, manager, lifecycle, and person identity completeness.',
      issues,
      metrics: [
        { label: 'Missing primary assignment', value: withoutPrimary.length },
        { label: 'Managerless assignments', value: managerlessAssignments.length },
        { label: 'Missing hire date', value: missingHireDate.length },
        { label: 'Incomplete identity', value: incompleteIdentity.length },
      ],
      recommendedActions: [
        'Assign every active worker to one current primary assignment.',
        'Resolve managerless primary assignments before relying on approval routing.',
      ],
    });
  }

  private async getDocumentQuality(tenantId: string | null, expiresWithinDays: number) {
    const now = new Date();
    const expiryWindowEnd = new Date(now.getTime() + expiresWithinDays * 24 * 60 * 60 * 1000);
    const baseWhere = { ...this.tenantWhere(tenantId), deletedAt: null };
    const include = {
      documentType: { select: { code: true, name: true } },
      employee: { select: { employeeNumber: true } },
    } satisfies Prisma.DocumentInclude;
    const [expired, expiring, missingVersion, pendingVerification] = await Promise.all([
      this.prisma.document.findMany({
        where: { ...baseWhere, expiresAt: { lt: now } },
        take: 12,
        include,
        orderBy: [{ expiresAt: 'asc' }],
      }),
      this.prisma.document.findMany({
        where: { ...baseWhere, expiresAt: { gte: now, lte: expiryWindowEnd } },
        take: 12,
        include,
        orderBy: [{ expiresAt: 'asc' }],
      }),
      this.prisma.document.findMany({
        where: { ...baseWhere, currentVersionId: null },
        take: 12,
        include,
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.prisma.document.findMany({
        where: { ...baseWhere, verificationStatus: DocumentVerificationStatus.PENDING },
        take: 12,
        include,
        orderBy: [{ updatedAt: 'desc' }],
      }),
    ]);
    const issues = [
      ...expired.map((document) =>
        this.qualityIssue({
          id: `document-expired-${document.id}`,
          severity: 'critical',
          title: `${document.title} is expired`,
          description: `${document.documentType?.name ?? document.documentType?.code ?? 'Document'} expired ${document.expiresAt?.toISOString().slice(0, 10) ?? 'without date'}.`,
          href: `/documents?document=${document.id}`,
          entityType: 'Document',
          entityId: document.id,
        }),
      ),
      ...expiring.map((document) =>
        this.qualityIssue({
          id: `document-expiring-${document.id}`,
          severity: 'high',
          title: `${document.title} expires soon`,
          description: `${document.employee?.employeeNumber ?? 'Employee document'} should be renewed before ${document.expiresAt?.toISOString().slice(0, 10)}.`,
          href: `/documents?document=${document.id}`,
          entityType: 'Document',
          entityId: document.id,
        }),
      ),
      ...missingVersion.map((document) =>
        this.qualityIssue({
          id: `document-version-${document.id}`,
          severity: 'medium',
          title: `${document.title} has no current file`,
          description: 'Document metadata exists but no current version has been attached.',
          href: `/documents?document=${document.id}`,
          entityType: 'Document',
          entityId: document.id,
        }),
      ),
      ...pendingVerification.map((document) =>
        this.qualityIssue({
          id: `document-verification-${document.id}`,
          severity: 'medium',
          title: `${document.title} is awaiting verification`,
          description: 'Compliance document needs HR review before it can be trusted for reporting.',
          href: `/documents?document=${document.id}`,
          entityType: 'Document',
          entityId: document.id,
        }),
      ),
    ];

    return this.qualityGroup({
      code: 'DOCUMENT_COMPLIANCE',
      title: 'Document compliance',
      description: 'Expiry, verification, and version-control readiness.',
      issues,
      metrics: [
        { label: 'Expired', value: expired.length },
        { label: 'Expiring soon', value: expiring.length },
        { label: 'Missing file', value: missingVersion.length },
        { label: 'Pending verification', value: pendingVerification.length },
      ],
      recommendedActions: [
        'Prioritize expired and expiring compliance documents.',
        'Attach current versions before approving document records.',
      ],
    });
  }

  private async getPositionQuality(tenantId: string | null) {
    const now = new Date();
    const assignmentGroups = await this.prisma.employeeAssignment.groupBy({
      by: ['positionId'],
      where: {
        ...this.currentAssignmentWhere(tenantId, now),
        isPrimary: true,
        positionId: { not: null },
      },
      _count: { _all: true },
    });
    const occupancy = new Map(
      assignmentGroups
        .filter((group) => group.positionId)
        .map((group) => [group.positionId as string, group._count._all]),
    );
    const positions = await this.prisma.position.findMany({
      where: {
        ...this.tenantWhere(tenantId),
        deletedAt: null,
        status: PositionStatus.ACTIVE,
      },
      take: 500,
      orderBy: [{ updatedAt: 'desc' }],
    });
    const withOccupancy = positions.map((position) => ({
      ...position,
      occupied: occupancy.get(position.id) ?? 0,
    }));
    const overCapacity = withOccupancy
      .filter((position) => position.occupied > position.budgetedHeadcount)
      .slice(0, 12);
    const vacant = withOccupancy
      .filter((position) => position.occupied < position.budgetedHeadcount)
      .slice(0, 12);
    const issues = [
      ...overCapacity.map((position) =>
        this.qualityIssue({
          id: `position-over-${position.id}`,
          severity: 'high',
          title: `${position.code} is over capacity`,
          description: `${position.title} has ${position.occupied}/${position.budgetedHeadcount} occupied headcount.`,
          href: `/positions?position=${position.id}`,
          entityType: 'Position',
          entityId: position.id,
        }),
      ),
      ...vacant.map((position) =>
        this.qualityIssue({
          id: `position-vacant-${position.id}`,
          severity: 'low',
          title: `${position.code} has vacancy`,
          description: `${position.title} has ${position.budgetedHeadcount - position.occupied} open approved slot(s).`,
          href: `/positions?position=${position.id}`,
          entityType: 'Position',
          entityId: position.id,
        }),
      ),
    ];

    return this.qualityGroup({
      code: 'POSITION_CONTROL',
      title: 'Position control',
      description: 'Headcount capacity, vacancy, and approved slot governance.',
      issues,
      metrics: [
        { label: 'Over capacity', value: overCapacity.length },
        { label: 'Vacant active positions', value: vacant.length },
      ],
      recommendedActions: [
        'Review over-capacity positions with HR planning.',
        'Use vacancy signals to drive recruitment and internal mobility planning.',
      ],
    });
  }

  private async getApprovalQuality(tenantId: string | null) {
    const now = new Date();
    const overdueSteps = await this.prisma.approvalStepInstance.findMany({
      where: {
        status: ApprovalRequestStatus.PENDING,
        dueAt: { lt: now },
        approvalRequest: this.tenantWhere(tenantId),
      },
      take: 12,
      include: {
        approvalRequest: {
          select: {
            id: true,
            title: true,
            module: true,
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }],
    });
    const issues = overdueSteps.map((step) =>
      this.qualityIssue({
        id: `approval-overdue-${step.id}`,
        severity: 'high',
        title: `${step.name} is overdue`,
        description: `${step.approvalRequest.title} has an overdue approval step in ${step.approvalRequest.module}.`,
        href: `/workflows?request=${step.approvalRequestId}`,
        entityType: 'ApprovalStepInstance',
        entityId: step.id,
      }),
    );

    return this.qualityGroup({
      code: 'APPROVAL_SLA',
      title: 'Approval SLA health',
      description: 'Workflow latency, overdue steps, and pending action quality.',
      issues,
      metrics: [{ label: 'Overdue approval steps', value: overdueSteps.length }],
      recommendedActions: ['Escalate overdue approval steps or configure delegation and SLA routing.'],
    });
  }

  private async getSecurityQuality(tenantId: string | null) {
    const now = new Date();
    const [lockedUsers, staleInvitations] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          ...this.tenantWhere(tenantId),
          deletedAt: null,
          OR: [{ status: UserStatus.LOCKED }, { lockedUntil: { gt: now } }],
        },
        take: 12,
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.prisma.invitation.findMany({
        where: {
          ...this.tenantWhere(tenantId),
          status: InvitationStatus.PENDING,
          expiresAt: { lt: now },
        },
        take: 12,
        orderBy: [{ expiresAt: 'asc' }],
      }),
    ]);
    const issues = [
      ...lockedUsers.map((user) =>
        this.qualityIssue({
          id: `user-locked-${user.id}`,
          severity: 'medium',
          title: `${user.email} is locked`,
          description: 'Locked users should be reviewed for failed login activity, offboarding, or reactivation.',
          href: '/iam',
          entityType: 'User',
          entityId: user.id,
        }),
      ),
      ...staleInvitations.map((invitation) =>
        this.qualityIssue({
          id: `invitation-expired-${invitation.id}`,
          severity: 'low',
          title: `${invitation.email} invitation is expired`,
          description: 'Expired invitations should be revoked or reissued to keep access governance clean.',
          href: '/iam',
          entityType: 'Invitation',
          entityId: invitation.id,
        }),
      ),
    ];

    return this.qualityGroup({
      code: 'IAM_GOVERNANCE',
      title: 'IAM governance',
      description: 'User lockouts, stale invitations, and access hygiene.',
      issues,
      metrics: [
        { label: 'Locked users', value: lockedUsers.length },
        { label: 'Expired invitations', value: staleInvitations.length },
      ],
      recommendedActions: [
        'Review locked accounts and expire access for inactive users.',
        'Revoke or resend expired invitations.',
      ],
    });
  }

  private async getGovernanceQuality(tenantId: string | null, period: ResolvedPeriod) {
    const now = new Date();
    const [failedOutbox, overdueOutbox, auditEvents] = await Promise.all([
      this.prisma.outboxMessage.findMany({
        where: {
          ...this.tenantWhere(tenantId),
          status: OutboxStatus.FAILED,
        },
        take: 12,
        orderBy: [{ failedAt: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.outboxMessage.findMany({
        where: {
          ...this.tenantWhere(tenantId),
          status: OutboxStatus.PENDING,
          availableAt: { lte: now },
        },
        take: 12,
        orderBy: [{ availableAt: 'asc' }],
      }),
      this.prisma.auditLog.count({
        where: {
          ...this.tenantWhere(tenantId),
          createdAt: { gte: period.from, lte: period.to },
        },
      }),
    ]);
    const issues = [
      ...failedOutbox.map((message) =>
        this.qualityIssue({
          id: `outbox-failed-${message.id}`,
          severity: 'high',
          title: `${message.eventType} failed publishing`,
          description: message.lastError ?? 'Outbox message is failed and requires retry or cancellation.',
          href: `/audit?outboxStatus=${OutboxStatus.FAILED}`,
          entityType: 'OutboxMessage',
          entityId: message.id,
        }),
      ),
      ...overdueOutbox.map((message) =>
        this.qualityIssue({
          id: `outbox-overdue-${message.id}`,
          severity: 'medium',
          title: `${message.eventType} is waiting to publish`,
          description: 'Pending outbox message is available and should be processed.',
          href: `/audit?outboxStatus=${OutboxStatus.PENDING}`,
          entityType: 'OutboxMessage',
          entityId: message.id,
        }),
      ),
    ];

    return this.qualityGroup({
      code: 'EVENT_GOVERNANCE',
      title: 'Event and audit governance',
      description: 'Outbox reliability and audit coverage for enterprise operations.',
      issues,
      metrics: [
        { label: 'Failed outbox', value: failedOutbox.length },
        { label: 'Pending publish', value: overdueOutbox.length },
        { label: 'Audit events in period', value: auditEvents },
      ],
      recommendedActions: ['Process pending outbox events and retry failed event messages.'],
    });
  }

  private async getOperationalMetrics(tenantId: string | null, period: ResolvedPeriod) {
    const tenantWhere = this.tenantWhere(tenantId);
    const now = new Date();
    const [
      auditEvents,
      activityEvents,
      timelineEvents,
      outboxByStatus,
      outboxOverdue,
      failedOutbox,
      activeUsers,
      lockedUsers,
      activeSessions,
    ] = await Promise.all([
      this.prisma.auditLog.count({
        where: {
          ...tenantWhere,
          createdAt: { gte: period.from, lte: period.to },
        },
      }),
      this.prisma.activityLog.count({
        where: {
          ...tenantWhere,
          createdAt: { gte: period.from, lte: period.to },
        },
      }),
      this.prisma.timelineEvent.count({
        where: {
          ...tenantWhere,
          createdAt: { gte: period.from, lte: period.to },
        },
      }),
      this.prisma.outboxMessage.groupBy({
        by: ['status'],
        where: tenantWhere,
        _count: { _all: true },
      }),
      this.prisma.outboxMessage.count({
        where: {
          ...tenantWhere,
          status: OutboxStatus.PENDING,
          availableAt: { lte: now },
        },
      }),
      this.prisma.outboxMessage.count({
        where: {
          ...tenantWhere,
          status: OutboxStatus.FAILED,
        },
      }),
      this.prisma.user.count({
        where: {
          ...tenantWhere,
          deletedAt: null,
          status: UserStatus.ACTIVE,
        },
      }),
      this.prisma.user.count({
        where: {
          ...tenantWhere,
          deletedAt: null,
          OR: [{ status: UserStatus.LOCKED }, { lockedUntil: { gt: now } }],
        },
      }),
      this.prisma.session.count({
        where: {
          revokedAt: null,
          expiresAt: { gt: now },
          user: tenantWhere,
        },
      }),
    ]);

    return {
      auditEvents,
      activityEvents,
      timelineEvents,
      outbox: {
        overdue: outboxOverdue,
        failed: failedOutbox,
        byStatus: this.countMap(outboxByStatus, 'status'),
      },
      security: {
        activeUsers,
        lockedUsers,
        activeSessions,
      },
    };
  }

  private async getRiskMetrics(
    tenantId: string | null,
    period: ResolvedPeriod,
    expiresWithinDays: number,
  ) {
    const [workforce, positions, approvals, documents, operations, notifications] = await Promise.all([
      this.getWorkforceMetrics(tenantId, period),
      this.getPositionMetrics(tenantId),
      this.getApprovalMetrics(
        {
          id: '',
          tenantId,
          email: '',
          username: null,
          type: 'SYSTEM',
          status: 'ACTIVE',
          sessionId: '',
          roles: [],
          permissions: [],
        },
        tenantId,
        period,
      ),
      this.getDocumentMetrics(tenantId, period, expiresWithinDays),
      this.getOperationalMetrics(tenantId, period),
      this.getNotificationMetrics(
        {
          id: '',
          tenantId,
          email: '',
          username: null,
          type: 'SYSTEM',
          status: 'ACTIVE',
          sessionId: '',
          roles: [],
          permissions: [],
        },
        tenantId,
        period,
      ),
    ]);

    const indicators = [
      this.indicator('OVERDUE_APPROVALS', 'high', approvals.overdueSteps, 'Approval steps are past due.'),
      this.indicator('EXPIRED_DOCUMENTS', 'critical', documents.expired, 'Documents have expired.'),
      this.indicator(
        'EXPIRING_DOCUMENTS',
        'medium',
        documents.expiringSoon,
        'Documents are nearing expiry.',
      ),
      this.indicator('FAILED_OUTBOX', 'high', operations.outbox.failed, 'Outbox events failed.'),
      this.indicator('OVERDUE_OUTBOX', 'medium', operations.outbox.overdue, 'Outbox events are ready but unprocessed.'),
      this.indicator(
        'UNASSIGNED_EMPLOYEES',
        'medium',
        workforce.assignments.employeesWithoutPrimaryAssignment,
        'Active employees are missing a current primary assignment.',
      ),
      this.indicator(
        'MANAGERLESS_ASSIGNMENTS',
        'medium',
        workforce.assignments.managerlessPrimaryAssignments,
        'Primary assignments have no manager recorded.',
      ),
      this.indicator(
        'OVER_CAPACITY_POSITIONS',
        'high',
        positions.overCapacityPositions.length,
        'Positions are occupied above approved headcount.',
      ),
      this.indicator(
        'FAILED_NOTIFICATIONS',
        'medium',
        notifications.failedInPeriod,
        'Notification delivery failures occurred in the selected period.',
      ),
    ].filter((indicator) => indicator.count > 0);

    const riskScore = Math.min(
      100,
      indicators.reduce((score, indicator) => score + indicator.scoreImpact, 0),
    );

    return {
      healthScore: Math.max(0, 100 - riskScore),
      riskScore,
      indicators,
    };
  }

  private async getOrganizationDistribution(tenantId: string | null) {
    const now = new Date();
    const groups = await this.prisma.employeeAssignment.groupBy({
      by: ['organizationNodeId'],
      where: {
        ...this.currentAssignmentWhere(tenantId, now),
        isPrimary: true,
      },
      _count: { _all: true },
    });
    const nodeIds = groups
      .map((group) => group.organizationNodeId)
      .filter((organizationNodeId): organizationNodeId is string => Boolean(organizationNodeId));
    const nodes = await this.prisma.organizationNode.findMany({
      where: { id: { in: nodeIds } },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    return groups
      .map((group) => ({
        organizationNode: group.organizationNodeId
          ? nodeById.get(group.organizationNodeId) ?? null
          : null,
        count: group._count._all,
      }))
      .sort((left, right) => right.count - left.count);
  }

  private async getPositionDistribution(tenantId: string | null) {
    const groups = await this.prisma.position.groupBy({
      by: ['organizationNodeId'],
      where: {
        ...this.tenantWhere(tenantId),
        deletedAt: null,
      },
      _count: { _all: true },
      _sum: {
        budgetedHeadcount: true,
      },
    });
    const nodeIds = groups
      .map((group) => group.organizationNodeId)
      .filter((organizationNodeId): organizationNodeId is string => Boolean(organizationNodeId));
    const nodes = await this.prisma.organizationNode.findMany({
      where: { id: { in: nodeIds } },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    return groups
      .map((group) => ({
        organizationNode: group.organizationNodeId
          ? nodeById.get(group.organizationNodeId) ?? null
          : null,
        positions: group._count._all,
        budgetedHeadcount: group._sum.budgetedHeadcount ?? 0,
      }))
      .sort((left, right) => right.positions - left.positions);
  }

  private async getHeadcountTrend(tenantId: string | null, period: ResolvedPeriod) {
    const buckets = this.buildBuckets(period);
    const tenantWhere = this.tenantWhere(tenantId);

    const data = await Promise.all(
      buckets.map(async (bucket) => {
        const [headcount, hires, separations] = await Promise.all([
          this.prisma.employee.count({
            where: {
              ...tenantWhere,
              deletedAt: null,
              OR: [{ hireDate: null }, { hireDate: { lte: bucket.to } }],
              NOT: {
                status: EmployeeStatus.ARCHIVED,
              },
            },
          }),
          this.prisma.employee.count({
            where: {
              ...tenantWhere,
              deletedAt: null,
              hireDate: { gte: bucket.from, lte: bucket.to },
            },
          }),
          this.prisma.employee.count({
            where: {
              ...tenantWhere,
              deletedAt: null,
              status: { in: TERMINAL_EMPLOYEE_STATUSES },
              endDate: { gte: bucket.from, lte: bucket.to },
            },
          }),
        ]);

        return {
          label: bucket.label,
          from: bucket.from.toISOString(),
          to: bucket.to.toISOString(),
          headcount,
          hires,
          separations,
        };
      }),
    );

    return {
      bucket: period.bucket,
      data,
    };
  }

  private async listWidgetsForScope(
    tenantId: string | null,
    query: Pick<ListDashboardWidgetsQueryDto, 'module' | 'activeOnly'>,
  ) {
    const widgets = await this.prisma.dashboardWidget.findMany({
      where: {
        OR: tenantId ? [{ tenantId: null }, { tenantId }] : [{ tenantId: null }],
        module: query.module,
        isActive: query.activeOnly === false ? undefined : true,
      },
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });

    const tenantOverrides = new Set(
      widgets.filter((widget) => widget.tenantId).map((widget) => widget.code),
    );

    return widgets.filter((widget) => widget.tenantId || !tenantOverrides.has(widget.code));
  }

  private async findWritableWidget(actor: AuthenticatedPrincipal, widgetId: string) {
    const widget = await this.prisma.dashboardWidget.findUnique({
      where: { id: widgetId },
    });

    if (!widget) {
      throw new NotFoundException('Dashboard widget not found.');
    }

    if (actor.tenantId) {
      if (widget.tenantId !== actor.tenantId) {
        throw new ForbiddenException('You can only update tenant-owned dashboard widgets.');
      }
      return widget;
    }

    this.assertPlatformActor(actor);
    return widget;
  }

  private async findTenantStewards(tenantId: string, actorId: string) {
    return this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
        OR: [
          { id: actorId },
          {
            userRoles: {
              some: {
                role: {
                  code: { in: ['TENANT_ADMIN', 'HR_ADMIN', 'HR_MANAGER'] },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        email: true,
      },
      take: 25,
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  private async resolveReadableScope(actor: AuthenticatedPrincipal, tenantId?: string) {
    if (actor.tenantId) {
      if (tenantId && tenantId !== actor.tenantId) {
        throw new ForbiddenException('You cannot read dashboard data for another tenant.');
      }

      return {
        scope: 'TENANT' as const,
        tenantId: actor.tenantId,
      };
    }

    this.assertPlatformActor(actor);

    if (tenantId) {
      await this.assertTenantExists(tenantId);
      return {
        scope: 'TENANT' as const,
        tenantId,
      };
    }

    return {
      scope: 'PLATFORM' as const,
      tenantId: null,
    };
  }

  private async resolveWritableOptionalTenant(actor: AuthenticatedPrincipal, tenantId?: string) {
    if (actor.tenantId) {
      if (tenantId && tenantId !== actor.tenantId) {
        throw new ForbiddenException('You cannot write dashboard data for another tenant.');
      }

      return actor.tenantId;
    }

    this.assertPlatformActor(actor);

    if (tenantId) {
      await this.assertTenantExists(tenantId);
      return tenantId;
    }

    return null;
  }

  private async resolveWritableRequiredTenant(actor: AuthenticatedPrincipal, tenantId?: string) {
    const resolvedTenantId = await this.resolveWritableOptionalTenant(actor, tenantId);

    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId is required for tenant analytics snapshots.');
    }

    return resolvedTenantId;
  }

  private assertPlatformActor(actor: AuthenticatedPrincipal) {
    if (actor.type !== 'PLATFORM_ADMIN' && !actor.permissions.includes('platform.tenants.manage')) {
      throw new ForbiddenException('Platform access is required for this dashboard scope.');
    }
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }
  }

  private resolvePeriod(input: PeriodInput): ResolvedPeriod {
    const now = new Date();
    const to = input.to ? new Date(input.to) : now;
    let from: Date;
    const key = input.period ?? DashboardPeriod.LAST_30_DAYS;

    if (key === DashboardPeriod.CUSTOM) {
      if (!input.from) {
        throw new BadRequestException('from is required when period is CUSTOM.');
      }
      from = new Date(input.from);
    } else if (key === DashboardPeriod.LAST_7_DAYS) {
      from = this.daysAgo(to, 7);
    } else if (key === DashboardPeriod.LAST_90_DAYS) {
      from = this.daysAgo(to, 90);
    } else if (key === DashboardPeriod.YEAR_TO_DATE) {
      from = new Date(Date.UTC(to.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
    } else {
      from = this.daysAgo(to, 30);
    }

    if (from > to) {
      throw new BadRequestException('from must be before to.');
    }

    return {
      key,
      from,
      to,
      bucket: to.getTime() - from.getTime() <= 45 * 24 * 60 * 60 * 1000 ? 'DAY' : 'MONTH',
    };
  }

  private periodResponse(period: ResolvedPeriod) {
    return {
      key: period.key,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      bucket: period.bucket,
    };
  }

  private buildBuckets(period: ResolvedPeriod) {
    const buckets: Array<{ label: string; from: Date; to: Date }> = [];
    let cursor =
      period.bucket === 'DAY'
        ? new Date(Date.UTC(period.from.getUTCFullYear(), period.from.getUTCMonth(), period.from.getUTCDate()))
        : new Date(Date.UTC(period.from.getUTCFullYear(), period.from.getUTCMonth(), 1));

    while (cursor <= period.to) {
      const bucketFrom = new Date(cursor);
      const next =
        period.bucket === 'DAY'
          ? new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
          : new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      const bucketTo = new Date(Math.min(next.getTime() - 1, period.to.getTime()));
      buckets.push({
        label:
          period.bucket === 'DAY'
            ? bucketFrom.toISOString().slice(0, 10)
            : `${bucketFrom.getUTCFullYear()}-${String(bucketFrom.getUTCMonth() + 1).padStart(2, '0')}`,
        from: bucketFrom,
        to: bucketTo,
      });
      cursor = next;
    }

    return buckets;
  }

  private tenantWhere(tenantId: string | null) {
    return tenantId ? { tenantId } : {};
  }

  private currentAssignmentWhere(tenantId: string | null, asOf: Date): Prisma.EmployeeAssignmentWhereInput {
    return {
      ...this.tenantWhere(tenantId),
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      employee: {
        deletedAt: null,
      },
    };
  }

  private dateRange(from?: string, to?: string) {
    if (!from && !to) {
      return undefined;
    }

    return {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(to) : undefined,
    };
  }

  private daysAgo(date: Date, days: number) {
    return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
  }

  private indicator(code: string, severity: RiskSeverity, count: number, description: string) {
    const scoreImpactBySeverity: Record<RiskSeverity, number> = {
      low: 2,
      medium: Math.min(10, Math.max(4, count * 2)),
      high: Math.min(18, Math.max(8, count * 3)),
      critical: Math.min(28, Math.max(12, count * 4)),
    };

    return {
      code,
      severity,
      count,
      description,
      scoreImpact: scoreImpactBySeverity[severity],
    };
  }

  private qualityGroup(input: {
    code: string;
    title: string;
    description: string;
    issues: DataQualityIssue[];
    metrics: Array<{ label: string; value: number }>;
    recommendedActions: string[];
  }): DataQualityGroup {
    const severityImpact: Record<QualitySeverity, number> = {
      critical: 8,
      high: 5,
      medium: 2,
      low: 1,
    };
    const scoreImpact = Math.min(
      35,
      input.issues.reduce((sum, issue) => sum + severityImpact[issue.severity], 0),
    );

    return {
      ...input,
      issueCount: input.issues.length,
      scoreImpact,
      bySeverity: {
        critical: input.issues.filter((issue) => issue.severity === 'critical').length,
        high: input.issues.filter((issue) => issue.severity === 'high').length,
        medium: input.issues.filter((issue) => issue.severity === 'medium').length,
        low: input.issues.filter((issue) => issue.severity === 'low').length,
      },
    };
  }

  private qualityIssue(issue: DataQualityIssue): DataQualityIssue {
    return issue;
  }

  private issueCountBySeverity(groups: DataQualityGroup[], severity: QualitySeverity) {
    return groups.reduce((sum, group) => sum + group.bySeverity[severity], 0);
  }

  private personName(person?: { firstName: string; lastName: string; preferredName?: string | null } | null) {
    if (!person) {
      return 'Employee';
    }

    return person.preferredName ?? `${person.firstName} ${person.lastName}`;
  }

  private countMap<TKey extends string, TItem extends Record<TKey, string | null>>(
    groups: Array<TItem & { _count: { _all: number } }>,
    key: TKey,
  ) {
    return Object.fromEntries(groups.map((group) => [String(group[key]), group._count._all]));
  }

  private widgetState(widget: {
    id: string;
    tenantId: string | null;
    code: string;
    name: string;
    module: string;
    config: Prisma.JsonValue | null;
    isActive: boolean;
  }): Prisma.InputJsonObject {
    return {
      id: widget.id,
      tenantId: widget.tenantId,
      code: widget.code,
      name: widget.name,
      module: widget.module,
      config: widget.config === null ? null : this.toInputJson(widget.config),
      isActive: widget.isActive,
    };
  }

  private toInputJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private toInputJsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined {
    return value === undefined ? undefined : this.toInputJson(value);
  }

  private paginate<TItem extends { id: string }>(items: TItem[], limit: number) {
    const hasNextPage = items.length > limit;
    const data = hasNextPage ? items.slice(0, limit) : items;

    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? data.at(-1)?.id : null,
      },
    };
  }
}

type PeriodInput = Pick<DashboardQueryDto | RefreshAnalyticsSnapshotDto, 'period' | 'from' | 'to'>;

type ResolvedPeriod = {
  key: DashboardPeriod;
  from: Date;
  to: Date;
  bucket: 'DAY' | 'MONTH';
};

type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
type QualitySeverity = 'low' | 'medium' | 'high' | 'critical';

type DataQualityIssue = {
  id: string;
  severity: QualitySeverity;
  title: string;
  description: string;
  href: string;
  entityType: string;
  entityId: string;
};

type DataQualityGroup = {
  code: string;
  title: string;
  description: string;
  issueCount: number;
  scoreImpact: number;
  bySeverity: Record<QualitySeverity, number>;
  metrics: Array<{ label: string; value: number }>;
  issues: DataQualityIssue[];
  recommendedActions: string[];
};
