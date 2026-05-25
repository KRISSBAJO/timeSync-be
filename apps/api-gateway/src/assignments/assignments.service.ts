import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentType,
  AuditAction,
  EmployeeStatus,
  PositionStatus,
  TimelineEventType,
  WorkforceLeadershipRole,
  WorkforceActionStatus,
  WorkforceActionType,
  type EmployeeAssignment,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { EndAssignmentDto } from './dto/end-assignment.dto';
import { ListAssignmentsQueryDto } from './dto/list-assignments-query.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

const TERMINAL_EMPLOYEE_STATUSES: EmployeeStatus[] = [
  EmployeeStatus.SEPARATED,
  EmployeeStatus.RETIRED,
  EmployeeStatus.ALUMNI,
  EmployeeStatus.ARCHIVED,
];

const MANAGER_ELIGIBLE_STATUSES: EmployeeStatus[] = [
  EmployeeStatus.ACTIVE,
  EmployeeStatus.PROBATION,
];

const MANAGER_ASSIGNMENT_ROLES: WorkforceLeadershipRole[] = [
  WorkforceLeadershipRole.MANAGER,
  WorkforceLeadershipRole.DEPARTMENT_HEAD,
  WorkforceLeadershipRole.UNIT_HEAD,
];

const SUPERVISOR_ASSIGNMENT_ROLES: WorkforceLeadershipRole[] = [
  WorkforceLeadershipRole.SUPERVISOR,
  WorkforceLeadershipRole.MANAGER,
  WorkforceLeadershipRole.UNIT_HEAD,
  WorkforceLeadershipRole.PROJECT_LEAD,
];

const UNIT_HEAD_ASSIGNMENT_ROLES: WorkforceLeadershipRole[] = [
  WorkforceLeadershipRole.UNIT_HEAD,
  WorkforceLeadershipRole.DEPARTMENT_HEAD,
];

const FAR_FUTURE = new Date('9999-12-31T23:59:59.999Z');

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAssignment(actor: AuthenticatedPrincipal, dto: CreateAssignmentDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const resolved = await this.resolveAssignmentFields(tx, tenantId, dto);
      const previousPrimary = await this.findCurrentPrimary(
        tx,
        tenantId,
        resolved.employeeId,
        resolved.effectiveFrom,
      );

      await this.assertManagerChainSafe(
        tx,
        tenantId,
        resolved.employeeId,
        resolved.managerEmployeeId,
        resolved.effectiveFrom,
      );

      if (resolved.isPrimary) {
        await this.preparePrimaryWindow(tx, tenantId, resolved, dto.closeExistingPrimary ?? true);
      }

      if (resolved.positionId && resolved.isPrimary && !dto.allowOverBudget) {
        await this.assertPositionHeadcount(tx, tenantId, resolved);
      }

      const assignment = await tx.employeeAssignment.create({
        data: {
          tenantId,
          employeeId: resolved.employeeId,
          type: resolved.type,
          positionId: resolved.positionId,
          organizationNodeId: resolved.organizationNodeId,
          costCenterId: resolved.costCenterId,
          managerEmployeeId: resolved.managerEmployeeId,
          supervisorEmployeeId: resolved.supervisorEmployeeId,
          unitHeadEmployeeId: resolved.unitHeadEmployeeId,
          gradeId: resolved.gradeId,
          levelId: resolved.levelId,
          effectiveFrom: resolved.effectiveFrom,
          effectiveTo: resolved.effectiveTo,
          isPrimary: resolved.isPrimary,
          reason: dto.reason,
          metadata: this.toJson(dto.metadata),
        },
        include: this.assignmentInclude,
      });

      await this.writeAssignmentEffects(tx, actor, tenantId, {
        before: previousPrimary,
        after: assignment,
        auditAction: AuditAction.CREATE,
        reason: dto.reason ?? 'Assignment created.',
        note: 'Employee assignment created.',
        outboxEvent: 'employee.assignment.created',
      });

      return assignment;
    });
  }

  async listAssignments(actor: AuthenticatedPrincipal, query: ListAssignmentsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const activeOn = query.currentOnly ? this.toDate(query.activeOn) ?? new Date() : this.toDate(query.activeOn);

    const assignments = await this.prisma.employeeAssignment.findMany({
      where: {
        tenantId,
        employeeId: query.employeeId,
        type: query.type,
        positionId: query.positionId,
        organizationNodeId: query.organizationNodeId,
        costCenterId: query.costCenterId,
        managerEmployeeId: query.managerEmployeeId,
        isPrimary: query.isPrimary,
        ...(activeOn ? this.activeAssignmentWhere(activeOn) : {}),
        OR: query.search
          ? [
              { employee: { employeeNumber: { contains: query.search, mode: 'insensitive' } } },
              { employee: { person: { firstName: { contains: query.search, mode: 'insensitive' } } } },
              { employee: { person: { lastName: { contains: query.search, mode: 'insensitive' } } } },
              { position: { title: { contains: query.search, mode: 'insensitive' } } },
              { position: { code: { contains: query.search, mode: 'insensitive' } } },
              { organizationNode: { name: { contains: query.search, mode: 'insensitive' } } },
              { organizationNode: { code: { contains: query.search, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      include: this.assignmentInclude,
    });

    const hasNextPage = assignments.length > limit;
    const data = hasNextPage ? assignments.slice(0, limit) : assignments;

    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? data.at(-1)?.id : null,
      },
    };
  }

  async listCurrentAssignments(actor: AuthenticatedPrincipal, query: ListAssignmentsQueryDto) {
    return this.listAssignments(actor, {
      ...query,
      currentOnly: true,
      limit: query.limit ?? 100,
    });
  }

  async getAssignment(actor: AuthenticatedPrincipal, assignmentId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findAssignmentOrThrow(this.prisma, tenantId, assignmentId);
  }

  async employeeAssignmentHistory(actor: AuthenticatedPrincipal, employeeId: string) {
    const tenantId = this.requireTenant(actor);
    await this.findEmployeeForAssignment(this.prisma, tenantId, employeeId, true);

    return this.prisma.employeeAssignment.findMany({
      where: {
        tenantId,
        employeeId,
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      include: this.assignmentInclude,
    });
  }

  async updateAssignment(
    actor: AuthenticatedPrincipal,
    assignmentId: string,
    dto: UpdateAssignmentDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findAssignmentOrThrow(tx, tenantId, assignmentId);

      if (dto.employeeId && dto.employeeId !== existing.employeeId) {
        throw new BadRequestException('Assignments cannot be moved between employees.');
      }

      const resolved = await this.resolveAssignmentFields(tx, tenantId, dto, existing);

      await this.assertManagerChainSafe(
        tx,
        tenantId,
        resolved.employeeId,
        resolved.managerEmployeeId,
        resolved.effectiveFrom,
      );

      if (resolved.isPrimary) {
        await this.preparePrimaryWindow(
          tx,
          tenantId,
          resolved,
          dto.closeExistingPrimary ?? false,
          existing.id,
        );
      }

      if (resolved.positionId && resolved.isPrimary && !dto.allowOverBudget) {
        await this.assertPositionHeadcount(tx, tenantId, resolved, existing.id);
      }

      const updated = await tx.employeeAssignment.update({
        where: { id: existing.id },
        data: {
          type: resolved.type,
          positionId: resolved.positionId,
            organizationNodeId: resolved.organizationNodeId,
            costCenterId: resolved.costCenterId,
            managerEmployeeId: resolved.managerEmployeeId,
            supervisorEmployeeId: resolved.supervisorEmployeeId,
            unitHeadEmployeeId: resolved.unitHeadEmployeeId,
            gradeId: resolved.gradeId,
          levelId: resolved.levelId,
          effectiveFrom: resolved.effectiveFrom,
          effectiveTo: resolved.effectiveTo,
          isPrimary: resolved.isPrimary,
          reason: dto.reason,
          metadata: this.toJson(dto.metadata),
        },
        include: this.assignmentInclude,
      });

      await this.writeAssignmentEffects(tx, actor, tenantId, {
        before: existing,
        after: updated,
        auditAction: AuditAction.UPDATE,
        reason: dto.reason ?? 'Assignment updated.',
        note: 'Employee assignment updated.',
        outboxEvent: 'employee.assignment.updated',
      });

      return updated;
    });
  }

  async endAssignment(actor: AuthenticatedPrincipal, assignmentId: string, dto: EndAssignmentDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findAssignmentOrThrow(tx, tenantId, assignmentId);

      if (existing.effectiveTo && existing.effectiveTo <= new Date()) {
        throw new BadRequestException('Assignment has already ended.');
      }

      const effectiveTo = this.toDate(dto.effectiveTo) ?? new Date();

      if (effectiveTo <= existing.effectiveFrom) {
        throw new BadRequestException('Assignment end date must be after effectiveFrom.');
      }

      const updated = await tx.employeeAssignment.update({
        where: { id: existing.id },
        data: {
          effectiveTo,
          reason: dto.reason ?? existing.reason,
          ...(dto.metadata ? { metadata: this.toJson(dto.metadata) } : {}),
        },
        include: this.assignmentInclude,
      });

      await this.writeAssignmentEffects(tx, actor, tenantId, {
        before: existing,
        after: updated,
        auditAction: AuditAction.UPDATE,
        reason: dto.reason ?? 'Assignment ended.',
        note: 'Employee assignment ended.',
        outboxEvent: 'employee.assignment.ended',
        forceActionType: WorkforceActionType.PROFILE_CHANGE,
        forceTimelineType: TimelineEventType.EMPLOYEE_UPDATED,
      });

      return updated;
    });
  }

  async deleteAssignment(actor: AuthenticatedPrincipal, assignmentId: string) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findAssignmentOrThrow(tx, tenantId, assignmentId);

      if (existing.effectiveFrom <= new Date()) {
        throw new BadRequestException('Only future assignments can be deleted. End active assignments instead.');
      }

      await tx.employeeAssignment.delete({ where: { id: existing.id } });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.DELETE,
        'EmployeeAssignment',
        existing.id,
        this.assignmentState(existing),
        { deleted: true },
      );

      await this.enqueueOutbox(tx, tenantId, 'employee.assignment.deleted', existing.id, {
        assignmentId: existing.id,
        employeeId: existing.employeeId,
        deleted: true,
      });

      return { deleted: true };
    });
  }

  async getSummary(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const activeAt = new Date();
    const activeWhere = {
      tenantId,
      ...this.activeAssignmentWhere(activeAt),
    };

    const [currentTotal, currentPrimary, byType, byOrgNode, positionUsage, activePositions] =
      await Promise.all([
        this.prisma.employeeAssignment.count({ where: activeWhere }),
        this.prisma.employeeAssignment.count({ where: { ...activeWhere, isPrimary: true } }),
        this.prisma.employeeAssignment.groupBy({
          by: ['type'],
          where: activeWhere,
          _count: { _all: true },
        }),
        this.prisma.employeeAssignment.groupBy({
          by: ['organizationNodeId'],
          where: { ...activeWhere, organizationNodeId: { not: null }, isPrimary: true },
          _count: { _all: true },
        }),
        this.prisma.employeeAssignment.groupBy({
          by: ['positionId'],
          where: { ...activeWhere, positionId: { not: null }, isPrimary: true },
          _count: { _all: true },
        }),
        this.prisma.position.findMany({
          where: {
            tenantId,
            status: PositionStatus.ACTIVE,
            deletedAt: null,
          },
          select: {
            id: true,
            code: true,
            title: true,
            budgetedHeadcount: true,
          },
          orderBy: [{ title: 'asc' }],
          take: 100,
        }),
      ]);

    const usageByPosition = new Map(
      positionUsage
        .filter((item) => item.positionId)
        .map((item) => [item.positionId as string, item._count._all]),
    );

    return {
      currentTotal,
      currentPrimary,
      currentSecondary: currentTotal - currentPrimary,
      byType: Object.fromEntries(byType.map((item) => [item.type, item._count._all])),
      byOrganizationNode: byOrgNode.map((item) => ({
        organizationNodeId: item.organizationNodeId,
        count: item._count._all,
      })),
      positionCapacity: activePositions.map((position) => {
        const occupied = usageByPosition.get(position.id) ?? 0;

        return {
          positionId: position.id,
          code: position.code,
          title: position.title,
          budgetedHeadcount: position.budgetedHeadcount,
          occupied,
          vacant: Math.max(position.budgetedHeadcount - occupied, 0),
          overBudget: Math.max(occupied - position.budgetedHeadcount, 0),
        };
      }),
    };
  }

  private async resolveAssignmentFields(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: Partial<CreateAssignmentDto>,
    existing?: EmployeeAssignment,
  ): Promise<ResolvedAssignmentFields> {
    const employeeId = existing?.employeeId ?? dto.employeeId;

    if (!employeeId) {
      throw new BadRequestException('employeeId is required.');
    }

    await this.findEmployeeForAssignment(tx, tenantId, employeeId);

    const effectiveFrom = dto.effectiveFrom
      ? this.toDate(dto.effectiveFrom)
      : existing?.effectiveFrom;

    if (!effectiveFrom) {
      throw new BadRequestException('effectiveFrom is required.');
    }

    const effectiveTo =
      dto.effectiveTo !== undefined ? this.toDate(dto.effectiveTo) ?? null : existing?.effectiveTo ?? null;

    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new BadRequestException('effectiveTo must be after effectiveFrom.');
    }

    const type = dto.type ?? existing?.type ?? AssignmentType.PRIMARY;
    const isPrimary = dto.isPrimary ?? existing?.isPrimary ?? type === AssignmentType.PRIMARY;
    const positionId = dto.positionId ?? existing?.positionId ?? null;
    const position = positionId ? await this.validatePosition(tx, tenantId, positionId) : null;
    const positionChanged = dto.positionId !== undefined || !existing;

    const organizationNodeId =
      dto.organizationNodeId ??
      (positionChanged ? position?.organizationNodeId : existing?.organizationNodeId) ??
      null;
    const costCenterId =
      dto.costCenterId ?? (positionChanged ? position?.costCenterId : existing?.costCenterId) ?? null;
    const gradeId = dto.gradeId ?? (positionChanged ? position?.gradeId : existing?.gradeId) ?? null;
    const levelId = dto.levelId ?? (positionChanged ? position?.levelId : existing?.levelId) ?? null;
    const managerEmployeeId = dto.managerEmployeeId ?? existing?.managerEmployeeId ?? null;
    const supervisorEmployeeId =
      dto.supervisorEmployeeId ?? existing?.supervisorEmployeeId ?? null;
    const unitHeadEmployeeId =
      dto.unitHeadEmployeeId ?? existing?.unitHeadEmployeeId ?? null;

    await Promise.all([
      this.validateOrganizationNode(tx, tenantId, organizationNodeId),
      this.validateCostCenter(tx, tenantId, costCenterId),
      this.validateGrade(tx, tenantId, gradeId),
      this.validateLevel(tx, tenantId, levelId),
      this.validateLeadershipAssignee(tx, tenantId, {
        employeeId,
        assigneeEmployeeId: managerEmployeeId,
        allowedRoles: MANAGER_ASSIGNMENT_ROLES,
        label: 'Manager',
        asOf: effectiveFrom,
      }),
      this.validateLeadershipAssignee(tx, tenantId, {
        employeeId,
        assigneeEmployeeId: supervisorEmployeeId,
        allowedRoles: SUPERVISOR_ASSIGNMENT_ROLES,
        label: 'Supervisor',
        asOf: effectiveFrom,
      }),
      this.validateLeadershipAssignee(tx, tenantId, {
        employeeId,
        assigneeEmployeeId: unitHeadEmployeeId,
        allowedRoles: UNIT_HEAD_ASSIGNMENT_ROLES,
        label: 'Unit head',
        asOf: effectiveFrom,
      }),
    ]);

    return {
      employeeId,
      type,
      positionId,
      organizationNodeId,
      costCenterId,
      managerEmployeeId,
      supervisorEmployeeId,
      unitHeadEmployeeId,
      gradeId,
      levelId,
      effectiveFrom,
      effectiveTo,
      isPrimary,
    };
  }

  private async preparePrimaryWindow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    assignment: ResolvedAssignmentFields,
    closeExistingPrimary: boolean,
    excludeAssignmentId?: string,
  ) {
    const overlaps = await tx.employeeAssignment.findMany({
      where: {
        tenantId,
        employeeId: assignment.employeeId,
        isPrimary: true,
        id: excludeAssignmentId ? { not: excludeAssignmentId } : undefined,
        ...this.overlapWhere(assignment.effectiveFrom, assignment.effectiveTo),
      },
      orderBy: [{ effectiveFrom: 'asc' }],
    });

    if (overlaps.length === 0) {
      return;
    }

    if (!closeExistingPrimary) {
      throw new BadRequestException('Primary assignment overlaps an existing primary assignment.');
    }

    const closable = overlaps.filter((item) => item.effectiveFrom < assignment.effectiveFrom);
    const notClosable = overlaps.filter((item) => item.effectiveFrom >= assignment.effectiveFrom);

    if (notClosable.length > 0) {
      throw new BadRequestException('Primary assignment overlaps a future or same-date primary assignment.');
    }

    await tx.employeeAssignment.updateMany({
      where: {
        id: {
          in: closable.map((item) => item.id),
        },
      },
      data: {
        effectiveTo: assignment.effectiveFrom,
      },
    });
  }

  private async assertPositionHeadcount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    assignment: ResolvedAssignmentFields,
    excludeAssignmentId?: string,
  ) {
    if (!assignment.positionId) {
      return;
    }

    const position = await tx.position.findFirst({
      where: {
        id: assignment.positionId,
        tenantId,
        deletedAt: null,
      },
      select: {
        budgetedHeadcount: true,
        code: true,
      },
    });

    if (!position) {
      throw new BadRequestException('Position reference is invalid.');
    }

    const occupied = await tx.employeeAssignment.count({
      where: {
        tenantId,
        positionId: assignment.positionId,
        isPrimary: true,
        id: excludeAssignmentId ? { not: excludeAssignmentId } : undefined,
        ...this.overlapWhere(assignment.effectiveFrom, assignment.effectiveTo),
      },
    });

    if (occupied >= position.budgetedHeadcount) {
      throw new BadRequestException(`Position ${position.code} is at budgeted headcount.`);
    }
  }

  private async assertManagerChainSafe(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    managerEmployeeId: string | null,
    asOf: Date,
  ) {
    if (!managerEmployeeId) {
      return;
    }

    const seen = new Set<string>();
    let cursor: string | null = managerEmployeeId;
    let depth = 0;

    while (cursor) {
      if (cursor === employeeId) {
        throw new BadRequestException('Manager assignment would create a reporting cycle.');
      }

      if (seen.has(cursor)) {
        throw new BadRequestException('Existing manager chain contains a reporting cycle.');
      }

      seen.add(cursor);
      depth += 1;

      if (depth > 50) {
        throw new BadRequestException('Manager chain is too deep to validate safely.');
      }

      const assignment = await this.findCurrentPrimary(tx, tenantId, cursor, asOf);
      cursor = assignment?.managerEmployeeId ?? null;
    }
  }

  private async findCurrentPrimary(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    asOf: Date,
  ) {
    return tx.employeeAssignment.findFirst({
      where: {
        tenantId,
        employeeId,
        isPrimary: true,
        ...this.activeAssignmentWhere(asOf),
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async findAssignmentOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    assignmentId: string,
  ) {
    const assignment = await client.employeeAssignment.findFirst({
      where: {
        id: assignmentId,
        tenantId,
      },
      include: this.assignmentInclude,
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found.');
    }

    return assignment;
  }

  private async findEmployeeForAssignment(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    employeeId: string,
    includeDeleted = false,
  ) {
    const employee = await client.employee.findFirst({
      where: {
        id: employeeId,
        tenantId,
        deletedAt: includeDeleted ? undefined : null,
      },
      select: {
        id: true,
        status: true,
        employeeNumber: true,
      },
    });

    if (!employee) {
      throw new BadRequestException('Employee reference is invalid for this tenant.');
    }

    if (!includeDeleted && TERMINAL_EMPLOYEE_STATUSES.includes(employee.status)) {
      throw new BadRequestException(`Employee ${employee.employeeNumber} is not assignable in ${employee.status} status.`);
    }

    return employee;
  }

  private async validatePosition(tx: Prisma.TransactionClient, tenantId: string, positionId: string) {
    const position = await tx.position.findFirst({
      where: {
        id: positionId,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        status: true,
        organizationNodeId: true,
        costCenterId: true,
        gradeId: true,
        levelId: true,
      },
    });

    if (!position) {
      throw new BadRequestException('Position reference is invalid.');
    }

    if (position.status !== PositionStatus.ACTIVE) {
      throw new BadRequestException('Only active positions can be assigned.');
    }

    return position;
  }

  private async validateOrganizationNode(
    tx: Prisma.TransactionClient,
    tenantId: string,
    organizationNodeId: string | null,
  ) {
    if (!organizationNodeId) {
      return;
    }

    const node = await tx.organizationNode.findFirst({
      where: {
        id: organizationNodeId,
        tenantId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });

    if (!node) {
      throw new BadRequestException('Organization node reference is invalid.');
    }
  }

  private async validateCostCenter(
    tx: Prisma.TransactionClient,
    tenantId: string,
    costCenterId: string | null,
  ) {
    if (!costCenterId) {
      return;
    }

    const costCenter = await tx.costCenter.findFirst({
      where: {
        id: costCenterId,
        tenantId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });

    if (!costCenter) {
      throw new BadRequestException('Cost center reference is invalid.');
    }
  }

  private async validateGrade(
    tx: Prisma.TransactionClient,
    tenantId: string,
    gradeId: string | null,
  ) {
    if (!gradeId) {
      return;
    }

    const grade = await tx.positionGrade.findFirst({
      where: {
        id: gradeId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!grade) {
      throw new BadRequestException('Position grade reference is invalid.');
    }
  }

  private async validateLevel(
    tx: Prisma.TransactionClient,
    tenantId: string,
    levelId: string | null,
  ) {
    if (!levelId) {
      return;
    }

    const level = await tx.positionLevel.findFirst({
      where: {
        id: levelId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!level) {
      throw new BadRequestException('Position level reference is invalid.');
    }
  }

  private async validateLeadershipAssignee(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: {
      employeeId: string;
      assigneeEmployeeId: string | null;
      allowedRoles: WorkforceLeadershipRole[];
      label: string;
      asOf: Date;
    },
  ) {
    if (!input.assigneeEmployeeId) {
      return;
    }

    if (input.assigneeEmployeeId === input.employeeId) {
      throw new BadRequestException(`${input.label} cannot be the same employee.`);
    }

    const assignee = await tx.employee.findFirst({
      where: {
        id: input.assigneeEmployeeId,
        tenantId,
        deletedAt: null,
      },
      select: {
        status: true,
        employeeNumber: true,
        leadershipDesignations: {
          where: {
            tenantId,
            role: { in: input.allowedRoles },
            isActive: true,
            OR: [
              { startsAt: null },
              { startsAt: { lte: input.asOf } },
            ],
            AND: [
              {
                OR: [
                  { endsAt: null },
                  { endsAt: { gte: input.asOf } },
                ],
              },
            ],
          },
          select: {
            id: true,
            role: true,
          },
          take: 1,
        },
      },
    });

    if (!assignee) {
      throw new BadRequestException(`${input.label} employee reference is invalid.`);
    }

    if (!MANAGER_ELIGIBLE_STATUSES.includes(assignee.status)) {
      throw new BadRequestException(`${input.label} ${assignee.employeeNumber} is not active.`);
    }

    if (assignee.leadershipDesignations.length === 0) {
      throw new BadRequestException(
        `${input.label} ${assignee.employeeNumber} must be designated as ${input.allowedRoles
          .map((role) => role.toLowerCase().replace(/_/g, ' '))
          .join(' or ')} before assignment.`,
      );
    }
  }

  private async writeAssignmentEffects(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    input: AssignmentEffectInput,
  ) {
    const before = input.before ? this.assignmentState(input.before) : null;
    const after = this.assignmentState(input.after);
    const actionType = input.forceActionType ?? this.deriveWorkforceActionType(input.before, input.after);
    const timelineType = input.forceTimelineType ?? this.deriveTimelineEventType(input.before, input.after);

    await tx.workforceAction.create({
      data: {
        tenantId,
        employeeId: input.after.employeeId,
        type: actionType,
        status: WorkforceActionStatus.COMPLETED,
        effectiveDate: input.after.effectiveFrom,
        reason: input.reason,
        previousState: before ?? undefined,
        proposedState: after,
        finalState: after,
        initiatedById: actor.id,
        completedAt: new Date(),
        metadata: input.after.metadata as Prisma.InputJsonValue | undefined,
        history: {
          create: {
            status: WorkforceActionStatus.COMPLETED,
            note: input.note,
            actorUserId: actor.id,
            snapshot: after,
          },
        },
      },
    });

    await this.writeAudit(
      tx,
      actor,
      tenantId,
      input.auditAction,
      'EmployeeAssignment',
      input.after.id,
      before,
      after,
    );

    await tx.timelineEvent.create({
      data: {
        tenantId,
        employeeId: input.after.employeeId,
        actorUserId: actor.id,
        type: timelineType,
        title: this.timelineTitle(timelineType),
        description: this.timelineDescription(input.before, input.after),
        entityType: 'EmployeeAssignment',
        entityId: input.after.id,
        data: {
          before,
          after,
        },
      },
    });

    await this.enqueueOutbox(tx, tenantId, input.outboxEvent, input.after.id, {
      assignmentId: input.after.id,
      employeeId: input.after.employeeId,
      before,
      after,
    });
  }

  private deriveWorkforceActionType(
    before: AssignmentLike | null,
    after: AssignmentLike,
  ): WorkforceActionType {
    if (after.type === AssignmentType.ACTING) {
      return WorkforceActionType.ACTING_ASSIGNMENT;
    }

    if (after.type === AssignmentType.SECONDMENT) {
      return WorkforceActionType.SECONDMENT;
    }

    if (!before) {
      return WorkforceActionType.POSITION_CHANGE;
    }

    if (before.organizationNodeId !== after.organizationNodeId) {
      return WorkforceActionType.TRANSFER;
    }

    if (before.managerEmployeeId !== after.managerEmployeeId) {
      return WorkforceActionType.MANAGER_CHANGE;
    }

    if (before.positionId !== after.positionId || before.gradeId !== after.gradeId || before.levelId !== after.levelId) {
      return WorkforceActionType.POSITION_CHANGE;
    }

    return WorkforceActionType.PROFILE_CHANGE;
  }

  private deriveTimelineEventType(
    before: AssignmentLike | null,
    after: AssignmentLike,
  ): TimelineEventType {
    if (!before || before.positionId !== after.positionId) {
      return TimelineEventType.POSITION_ASSIGNED;
    }

    if (before.organizationNodeId !== after.organizationNodeId) {
      return TimelineEventType.EMPLOYEE_TRANSFERRED;
    }

    if (before.managerEmployeeId !== after.managerEmployeeId) {
      return TimelineEventType.MANAGER_CHANGED;
    }

    return TimelineEventType.EMPLOYEE_UPDATED;
  }

  private timelineTitle(type: TimelineEventType) {
    switch (type) {
      case TimelineEventType.POSITION_ASSIGNED:
        return 'Position assigned';
      case TimelineEventType.EMPLOYEE_TRANSFERRED:
        return 'Employee transferred';
      case TimelineEventType.MANAGER_CHANGED:
        return 'Manager changed';
      default:
        return 'Assignment updated';
    }
  }

  private timelineDescription(before: AssignmentLike | null, after: AssignmentLike) {
    if (!before) {
      return `Assignment ${after.id} became effective.`;
    }

    return `Assignment ${after.id} changed for employee ${after.employeeId}.`;
  }

  private assignmentState(assignment: AssignmentLike): Prisma.InputJsonObject {
    return {
      id: assignment.id,
      employeeId: assignment.employeeId,
      type: assignment.type,
      positionId: assignment.positionId,
      organizationNodeId: assignment.organizationNodeId,
      costCenterId: assignment.costCenterId,
      managerEmployeeId: assignment.managerEmployeeId,
      supervisorEmployeeId: assignment.supervisorEmployeeId,
      unitHeadEmployeeId: assignment.unitHeadEmployeeId,
      gradeId: assignment.gradeId,
      levelId: assignment.levelId,
      effectiveFrom: assignment.effectiveFrom.toISOString(),
      effectiveTo: assignment.effectiveTo?.toISOString() ?? null,
      isPrimary: assignment.isPrimary,
      reason: assignment.reason,
    };
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.id,
        action,
        module: 'assignments',
        entityType,
        entityId,
        before: before ?? undefined,
        after,
      },
    });
  }

  private async enqueueOutbox(
    tx: Prisma.TransactionClient,
    tenantId: string,
    eventType: string,
    assignmentId: string,
    payload: Prisma.InputJsonValue,
  ) {
    await tx.outboxMessage.create({
      data: {
        tenantId,
        eventType,
        aggregateType: 'EmployeeAssignment',
        aggregateId: assignmentId,
        payload,
      },
    });
  }

  private activeAssignmentWhere(asOf: Date): Prisma.EmployeeAssignmentWhereInput {
    return {
      effectiveFrom: {
        lte: asOf,
      },
      OR: [
        { effectiveTo: null },
        {
          effectiveTo: {
            gt: asOf,
          },
        },
      ],
    };
  }

  private overlapWhere(from: Date, to: Date | null): Prisma.EmployeeAssignmentWhereInput {
    return {
      effectiveFrom: {
        lt: to ?? FAR_FUTURE,
      },
      OR: [
        { effectiveTo: null },
        {
          effectiveTo: {
            gt: from,
          },
        },
      ],
    };
  }

  private requireTenant(actor: AuthenticatedPrincipal): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant context is required.');
    }

    return actor.tenantId;
  }

  private toDate(value?: string): Date | undefined {
    return value ? new Date(value) : undefined;
  }

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private get assignmentInclude() {
    return {
      employee: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              preferredName: true,
              photoUrl: true,
            },
          },
        },
      },
      position: true,
      organizationNode: true,
      costCenter: true,
      managerEmployee: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      },
      supervisorEmployee: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      },
      unitHeadEmployee: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      },
      grade: true,
      level: true,
    } satisfies Prisma.EmployeeAssignmentInclude;
  }
}

type ResolvedAssignmentFields = {
  employeeId: string;
  type: AssignmentType;
  positionId: string | null;
  organizationNodeId: string | null;
  costCenterId: string | null;
  managerEmployeeId: string | null;
  supervisorEmployeeId: string | null;
  unitHeadEmployeeId: string | null;
  gradeId: string | null;
  levelId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isPrimary: boolean;
};

type AssignmentLike = {
  id: string;
  employeeId: string;
  type: AssignmentType;
  positionId: string | null;
  organizationNodeId: string | null;
  costCenterId: string | null;
  managerEmployeeId: string | null;
  supervisorEmployeeId: string | null;
  unitHeadEmployeeId: string | null;
  gradeId: string | null;
  levelId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isPrimary: boolean;
  reason: string | null;
  metadata?: Prisma.JsonValue | null;
};

type AssignmentEffectInput = {
  before: AssignmentLike | null;
  after: AssignmentLike;
  auditAction: AuditAction;
  reason: string;
  note: string;
  outboxEvent: string;
  forceActionType?: WorkforceActionType;
  forceTimelineType?: TimelineEventType;
};
