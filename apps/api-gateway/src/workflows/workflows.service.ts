import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalRequestStatus,
  AuditAction,
  WorkflowStatus,
  WorkflowStepType,
  type Prisma,
  type Workflow,
  type WorkflowStep,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { ListWorkflowsQueryDto } from './dto/list-workflows-query.dto';
import { ReorderWorkflowStepsDto } from './dto/reorder-workflow-steps.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowStatusTransitionDto } from './dto/workflow-status-transition.dto';
import { CreateWorkflowStepDto, UpdateWorkflowStepDto } from './dto/workflow-step.dto';

const ACTIONABLE_STEP_TYPES: WorkflowStepType[] = [
  WorkflowStepType.APPROVAL,
  WorkflowStepType.REVIEW,
];

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkflow(actor: AuthenticatedPrincipal, dto: CreateWorkflowDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const steps = this.normalizeCreateSteps(dto.steps ?? []);
      for (const step of steps) {
        await this.validateStepDefinition(tx, tenantId, step);
      }

      if (dto.status === WorkflowStatus.ACTIVE && steps.length === 0) {
        throw new BadRequestException('Active workflows must have at least one step.');
      }

      const workflow = await tx.workflow.create({
        data: {
          tenantId,
          code: this.normalizeCode(dto.code),
          name: dto.name.trim(),
          description: dto.description,
          module: dto.module.trim(),
          status: dto.status ?? WorkflowStatus.DRAFT,
          triggerKey: dto.triggerKey,
          conditions: this.toJson(dto.conditions),
          metadata: this.toJson(dto.metadata),
          steps: {
            create: steps.map((step) => this.stepCreateData(step)),
          },
        },
        include: this.workflowInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'Workflow', workflow.id, null, {
        code: workflow.code,
        module: workflow.module,
        status: workflow.status,
        stepCount: workflow.steps.length,
      });

      await this.enqueueOutbox(tx, tenantId, 'workflow.created', workflow.id, {
        workflowId: workflow.id,
        code: workflow.code,
        status: workflow.status,
      });

      return workflow;
    });
  }

  async listWorkflows(actor: AuthenticatedPrincipal, query: ListWorkflowsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;

    const workflows = await this.prisma.workflow.findMany({
      where: {
        tenantId,
        status: query.status,
        module: query.module,
        triggerKey: query.triggerKey,
        deletedAt: query.includeDeleted ? undefined : null,
        OR: query.search
          ? [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ module: 'asc' }, { code: 'asc' }, { id: 'asc' }],
      include: this.workflowInclude,
    });

    return this.paginate(workflows, limit);
  }

  async getWorkflow(actor: AuthenticatedPrincipal, workflowId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findWorkflowOrThrow(this.prisma, tenantId, workflowId);
  }

  async updateWorkflow(
    actor: AuthenticatedPrincipal,
    workflowId: string,
    dto: UpdateWorkflowDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findWorkflowOrThrow(tx, tenantId, workflowId);

      if (dto.status === WorkflowStatus.ACTIVE) {
        await this.assertWorkflowActivatable(tx, tenantId, existing.id);
      }

      if (dto.status === WorkflowStatus.ARCHIVED) {
        await this.assertNoOpenRequests(tx, tenantId, existing.id);
      }

      const updated = await tx.workflow.update({
        where: { id: existing.id },
        data: {
          code: dto.code ? this.normalizeCode(dto.code) : undefined,
          name: dto.name?.trim(),
          description: dto.description,
          module: dto.module?.trim(),
          status: dto.status,
          triggerKey: dto.triggerKey,
          conditions: this.toJson(dto.conditions ?? undefined),
          metadata: this.toJson(dto.metadata ?? undefined),
          deletedAt: dto.status === WorkflowStatus.ARCHIVED ? new Date() : undefined,
        },
        include: this.workflowInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'Workflow',
        updated.id,
        this.workflowState(existing),
        this.workflowState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'workflow.updated', updated.id, {
        workflowId: updated.id,
        code: updated.code,
        status: updated.status,
      });

      return updated;
    });
  }

  async activateWorkflow(
    actor: AuthenticatedPrincipal,
    workflowId: string,
    dto: WorkflowStatusTransitionDto,
  ) {
    return this.transitionWorkflow(actor, workflowId, WorkflowStatus.ACTIVE, AuditAction.ACTIVATE, dto);
  }

  async inactivateWorkflow(
    actor: AuthenticatedPrincipal,
    workflowId: string,
    dto: WorkflowStatusTransitionDto,
  ) {
    return this.transitionWorkflow(actor, workflowId, WorkflowStatus.INACTIVE, AuditAction.DISABLE, dto);
  }

  async archiveWorkflow(
    actor: AuthenticatedPrincipal,
    workflowId: string,
    dto: WorkflowStatusTransitionDto,
  ) {
    return this.transitionWorkflow(actor, workflowId, WorkflowStatus.ARCHIVED, AuditAction.ARCHIVE, dto);
  }

  async deleteWorkflow(actor: AuthenticatedPrincipal, workflowId: string) {
    return this.transitionWorkflow(
      actor,
      workflowId,
      WorkflowStatus.ARCHIVED,
      AuditAction.DELETE,
      { reason: 'Workflow deleted.' },
    ).then(() => ({ deleted: true }));
  }

  async addStep(
    actor: AuthenticatedPrincipal,
    workflowId: string,
    dto: CreateWorkflowStepDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const workflow = await this.findWorkflowOrThrow(tx, tenantId, workflowId);
      await this.assertNoOpenRequests(tx, tenantId, workflow.id);
      await this.validateStepDefinition(tx, tenantId, dto);

      const stepOrder = dto.stepOrder ?? (await this.nextStepOrder(tx, workflow.id));
      await this.makeStepOrderRoom(tx, workflow.id, stepOrder);

      const step = await tx.workflowStep.create({
        data: {
          ...this.stepCreateData({ ...dto, stepOrder }),
          workflow: {
            connect: { id: workflow.id },
          },
        },
        include: this.stepInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'WorkflowStep', step.id, null, {
        workflowId: workflow.id,
        stepOrder: step.stepOrder,
        name: step.name,
      });

      await this.enqueueOutbox(tx, tenantId, 'workflow.step.created', workflow.id, {
        workflowId: workflow.id,
        stepId: step.id,
      });

      return step;
    });
  }

  async updateStep(
    actor: AuthenticatedPrincipal,
    workflowId: string,
    stepId: string,
    dto: UpdateWorkflowStepDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const workflow = await this.findWorkflowOrThrow(tx, tenantId, workflowId);
      await this.assertNoOpenRequests(tx, tenantId, workflow.id);
      const existing = await this.findStepOrThrow(tx, workflow.id, stepId);
      await this.validateStepDefinition(tx, tenantId, dto, existing);

      if (dto.stepOrder && dto.stepOrder !== existing.stepOrder) {
        await this.makeStepOrderRoom(tx, workflow.id, dto.stepOrder, existing.id);
      }

      const updated = await tx.workflowStep.update({
        where: { id: existing.id },
        data: {
          stepOrder: dto.stepOrder,
          name: dto.name?.trim(),
          type: dto.type,
          approverRoleId: dto.approverRoleId,
          approverUserId: dto.approverUserId,
          approverExpression: this.toJson(dto.approverExpression ?? undefined),
          isRequired: dto.isRequired,
          allowDelegation: dto.allowDelegation,
          slaHours: dto.slaHours,
          conditions: this.toJson(dto.conditions ?? undefined),
          metadata: this.toJson(dto.metadata ?? undefined),
        },
        include: this.stepInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'WorkflowStep',
        updated.id,
        this.stepState(existing),
        this.stepState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'workflow.step.updated', workflow.id, {
        workflowId: workflow.id,
        stepId: updated.id,
      });

      return updated;
    });
  }

  async deleteStep(actor: AuthenticatedPrincipal, workflowId: string, stepId: string) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const workflow = await this.findWorkflowOrThrow(tx, tenantId, workflowId);
      await this.assertNoOpenRequests(tx, tenantId, workflow.id);
      const existing = await this.findStepOrThrow(tx, workflow.id, stepId);

      await tx.workflowStep.delete({ where: { id: existing.id } });
      await this.compactStepOrders(tx, workflow.id);

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'WorkflowStep',
        existing.id,
        this.stepState(existing),
        { deleted: true },
      );

      await this.enqueueOutbox(tx, tenantId, 'workflow.step.deleted', workflow.id, {
        workflowId: workflow.id,
        stepId: existing.id,
      });

      return { deleted: true };
    });
  }

  async reorderSteps(
    actor: AuthenticatedPrincipal,
    workflowId: string,
    dto: ReorderWorkflowStepsDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const workflow = await this.findWorkflowOrThrow(tx, tenantId, workflowId);
      await this.assertNoOpenRequests(tx, tenantId, workflow.id);

      const steps = await tx.workflowStep.findMany({
        where: { workflowId: workflow.id },
        orderBy: [{ stepOrder: 'asc' }],
      });
      const stepIds = new Set(steps.map((step) => step.id));

      if (dto.stepIds.length !== steps.length || dto.stepIds.some((stepId) => !stepIds.has(stepId))) {
        throw new BadRequestException('Step IDs must include every workflow step exactly once.');
      }

      for (let index = 0; index < dto.stepIds.length; index += 1) {
        await tx.workflowStep.update({
          where: { id: dto.stepIds[index] },
          data: { stepOrder: -(index + 1) },
        });
      }

      for (let index = 0; index < dto.stepIds.length; index += 1) {
        await tx.workflowStep.update({
          where: { id: dto.stepIds[index] },
          data: { stepOrder: index + 1 },
        });
      }

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'Workflow', workflow.id, null, {
        reorderedStepIds: dto.stepIds,
      });

      await this.enqueueOutbox(tx, tenantId, 'workflow.steps.reordered', workflow.id, {
        workflowId: workflow.id,
        stepIds: dto.stepIds,
      });

      return this.findWorkflowOrThrow(tx, tenantId, workflow.id);
    });
  }

  private async transitionWorkflow(
    actor: AuthenticatedPrincipal,
    workflowId: string,
    status: WorkflowStatus,
    auditAction: AuditAction,
    dto: WorkflowStatusTransitionDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findWorkflowOrThrow(tx, tenantId, workflowId, status === WorkflowStatus.ACTIVE);

      if (status === WorkflowStatus.ACTIVE) {
        await this.assertWorkflowActivatable(tx, tenantId, existing.id);
      }

      if (status === WorkflowStatus.ARCHIVED) {
        await this.assertNoOpenRequests(tx, tenantId, existing.id);
      }

      const updated = await tx.workflow.update({
        where: { id: existing.id },
        data: {
          status,
          deletedAt: status === WorkflowStatus.ARCHIVED ? new Date() : status === WorkflowStatus.ACTIVE ? null : undefined,
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
        include: this.workflowInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        auditAction,
        'Workflow',
        updated.id,
        this.workflowState(existing),
        {
          ...this.workflowState(updated),
          reason: dto.reason,
        },
      );

      await this.enqueueOutbox(tx, tenantId, `workflow.${status.toLowerCase()}`, updated.id, {
        workflowId: updated.id,
        previousStatus: existing.status,
        status: updated.status,
        reason: dto.reason,
      });

      return updated;
    });
  }

  private normalizeCreateSteps(steps: CreateWorkflowStepDto[]) {
    const used = new Set<number>();

    return steps.map((step, index) => {
      const stepOrder = step.stepOrder ?? index + 1;

      if (used.has(stepOrder)) {
        throw new BadRequestException('Workflow step orders must be unique.');
      }

      used.add(stepOrder);
      return { ...step, stepOrder };
    });
  }

  private async validateStepDefinition(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: StepDefinitionInput,
    existing?: WorkflowStep,
  ) {
    const type = dto.type ?? existing?.type ?? WorkflowStepType.APPROVAL;
    const approverRoleId =
      dto.approverRoleId !== undefined ? dto.approverRoleId : existing?.approverRoleId ?? null;
    const approverUserId =
      dto.approverUserId !== undefined ? dto.approverUserId : existing?.approverUserId ?? null;
    const approverExpression =
      dto.approverExpression !== undefined ? dto.approverExpression : existing?.approverExpression;

    if (approverRoleId) {
      await this.validateRoleReference(tx, tenantId, approverRoleId);
    }

    if (approverUserId) {
      await this.validateUserReference(tx, tenantId, approverUserId);
    }

    if (approverRoleId && approverUserId) {
      throw new BadRequestException('A workflow step cannot assign both an approver role and user.');
    }

    if (ACTIONABLE_STEP_TYPES.includes(type) && !approverRoleId && !approverUserId && !approverExpression) {
      throw new BadRequestException('Approval and review steps require an approver role, user, or expression.');
    }
  }

  private async validateRoleReference(
    tx: Prisma.TransactionClient,
    tenantId: string,
    roleId: string,
  ) {
    const role = await tx.role.findFirst({
      where: {
        id: roleId,
        OR: [{ tenantId }, { tenantId: null }],
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });

    if (!role) {
      throw new BadRequestException('Approver role reference is invalid.');
    }
  }

  private async validateUserReference(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ) {
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Approver user reference is invalid.');
    }
  }

  private stepCreateData(step: CreateWorkflowStepDto): Prisma.WorkflowStepCreateWithoutWorkflowInput {
    return {
      stepOrder: step.stepOrder ?? 1,
      name: step.name.trim(),
      type: step.type ?? WorkflowStepType.APPROVAL,
      approverRole: step.approverRoleId ? { connect: { id: step.approverRoleId } } : undefined,
      approverUser: step.approverUserId ? { connect: { id: step.approverUserId } } : undefined,
      approverExpression: this.toJson(step.approverExpression),
      isRequired: step.isRequired ?? true,
      allowDelegation: step.allowDelegation ?? true,
      slaHours: step.slaHours,
      conditions: this.toJson(step.conditions),
      metadata: this.toJson(step.metadata),
    };
  }

  private async makeStepOrderRoom(
    tx: Prisma.TransactionClient,
    workflowId: string,
    stepOrder: number,
    excludeStepId?: string,
  ) {
    const steps = await tx.workflowStep.findMany({
      where: {
        workflowId,
        id: excludeStepId ? { not: excludeStepId } : undefined,
        stepOrder: {
          gte: stepOrder,
        },
      },
      orderBy: [{ stepOrder: 'desc' }],
    });

    for (const step of steps) {
      await tx.workflowStep.update({
        where: { id: step.id },
        data: { stepOrder: step.stepOrder + 1 },
      });
    }
  }

  private async compactStepOrders(tx: Prisma.TransactionClient, workflowId: string) {
    const steps = await tx.workflowStep.findMany({
      where: { workflowId },
      orderBy: [{ stepOrder: 'asc' }, { createdAt: 'asc' }],
    });

    for (let index = 0; index < steps.length; index += 1) {
      await tx.workflowStep.update({
        where: { id: steps[index].id },
        data: { stepOrder: -(index + 1) },
      });
    }

    for (let index = 0; index < steps.length; index += 1) {
      await tx.workflowStep.update({
        where: { id: steps[index].id },
        data: { stepOrder: index + 1 },
      });
    }
  }

  private async nextStepOrder(tx: Prisma.TransactionClient, workflowId: string) {
    const lastStep = await tx.workflowStep.findFirst({
      where: { workflowId },
      orderBy: [{ stepOrder: 'desc' }],
      select: { stepOrder: true },
    });

    return (lastStep?.stepOrder ?? 0) + 1;
  }

  private async assertWorkflowActivatable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    workflowId: string,
  ) {
    const steps = await tx.workflowStep.findMany({
      where: { workflowId },
      orderBy: [{ stepOrder: 'asc' }],
    });

    if (steps.length === 0) {
      throw new BadRequestException('Workflow must have at least one step before activation.');
    }

    for (const step of steps) {
      await this.validateStepDefinition(tx, tenantId, step, step);
    }
  }

  private async assertNoOpenRequests(
    tx: Prisma.TransactionClient,
    tenantId: string,
    workflowId: string,
  ) {
    const openRequests = await tx.approvalRequest.count({
      where: {
        tenantId,
        workflowId,
        status: ApprovalRequestStatus.PENDING,
      },
    });

    if (openRequests > 0) {
      throw new BadRequestException('Cannot change workflow structure while approval requests are pending.');
    }
  }

  private async findWorkflowOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    workflowId: string,
    includeDeleted = false,
  ) {
    const workflow = await client.workflow.findFirst({
      where: {
        id: workflowId,
        tenantId,
        deletedAt: includeDeleted ? undefined : null,
      },
      include: this.workflowInclude,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }

    return workflow;
  }

  private async findStepOrThrow(
    tx: Prisma.TransactionClient,
    workflowId: string,
    stepId: string,
  ) {
    const step = await tx.workflowStep.findFirst({
      where: {
        id: stepId,
        workflowId,
      },
      include: this.stepInclude,
    });

    if (!step) {
      throw new NotFoundException('Workflow step not found.');
    }

    return step;
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
        module: 'workflows',
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
    workflowId: string,
    payload: Prisma.InputJsonValue,
  ) {
    await tx.outboxMessage.create({
      data: {
        tenantId,
        eventType,
        aggregateType: 'Workflow',
        aggregateId: workflowId,
        payload,
      },
    });
  }

  private workflowState(workflow: WorkflowStateSource): Prisma.InputJsonObject {
    return {
      id: workflow.id,
      code: workflow.code,
      name: workflow.name,
      module: workflow.module,
      status: workflow.status,
      triggerKey: workflow.triggerKey,
      deletedAt: workflow.deletedAt?.toISOString() ?? null,
    };
  }

  private stepState(step: WorkflowStepStateSource): Prisma.InputJsonObject {
    return {
      id: step.id,
      workflowId: step.workflowId,
      stepOrder: step.stepOrder,
      name: step.name,
      type: step.type,
      approverRoleId: step.approverRoleId,
      approverUserId: step.approverUserId,
      isRequired: step.isRequired,
      allowDelegation: step.allowDelegation,
      slaHours: step.slaHours,
    };
  }

  private paginate<TItem>(items: TItem[], limit: number) {
    const hasNextPage = items.length > limit;
    const data = hasNextPage ? items.slice(0, limit) : items;

    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? (data.at(-1) as { id?: string } | undefined)?.id : null,
      },
    };
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

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private get workflowInclude() {
    return {
      steps: {
        orderBy: [{ stepOrder: 'asc' }],
        include: this.stepInclude,
      },
      _count: {
        select: {
          requests: true,
        },
      },
    } satisfies Prisma.WorkflowInclude;
  }

  private get stepInclude() {
    return {
      approverRole: {
        select: {
          id: true,
          code: true,
          name: true,
          scope: true,
        },
      },
      approverUser: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    } satisfies Prisma.WorkflowStepInclude;
  }
}

type WorkflowStateSource = Pick<
  Workflow,
  'id' | 'code' | 'name' | 'module' | 'status' | 'triggerKey' | 'deletedAt'
>;

type WorkflowStepStateSource = Pick<
  WorkflowStep,
  | 'id'
  | 'workflowId'
  | 'stepOrder'
  | 'name'
  | 'type'
  | 'approverRoleId'
  | 'approverUserId'
  | 'isRequired'
  | 'allowDelegation'
  | 'slaHours'
>;

type StepDefinitionInput = {
  type?: WorkflowStepType;
  approverRoleId?: string | null;
  approverUserId?: string | null;
  approverExpression?: Prisma.JsonValue | Record<string, unknown> | null;
};
