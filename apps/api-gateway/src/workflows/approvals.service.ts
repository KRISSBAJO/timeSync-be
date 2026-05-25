import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalActionType,
  ApprovalRequestStatus,
  AuditAction,
  TimelineEventType,
  WorkflowStatus,
  WorkflowStepType,
  WorkforceActionStatus,
  type ApprovalRequest,
  type ApprovalStepInstance,
  type Prisma,
  type Workflow,
  type WorkflowStep,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { ApprovalActionDto } from './dto/approval-action.dto';
import { CreateDelegationDto } from './dto/create-delegation.dto';
import { DelegateApprovalDto } from './dto/delegate-approval.dto';
import { ListApprovalRequestsQueryDto } from './dto/list-approval-requests-query.dto';
import { ListApprovalTasksQueryDto } from './dto/list-approval-tasks-query.dto';
import { ListDelegationsQueryDto } from './dto/list-delegations-query.dto';
import { SubmitApprovalRequestDto } from './dto/submit-approval-request.dto';
import { UpdateDelegationDto } from './dto/update-delegation.dto';

const TERMINAL_APPROVAL_STATUSES: ApprovalRequestStatus[] = [
  ApprovalRequestStatus.APPROVED,
  ApprovalRequestStatus.REJECTED,
  ApprovalRequestStatus.CANCELLED,
  ApprovalRequestStatus.WITHDRAWN,
  ApprovalRequestStatus.COMPLETED,
];

const AUTOMATED_STEP_TYPES: WorkflowStepType[] = [
  WorkflowStepType.NOTIFICATION,
  WorkflowStepType.SYSTEM_ACTION,
];

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  async submitRequest(actor: AuthenticatedPrincipal, dto: SubmitApprovalRequestDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const workflow = await this.resolveWorkflow(tx, tenantId, dto);
      const entityContext = await this.resolveEntityContext(tx, tenantId, dto.entityType, dto.entityId);
      const submittedAt = new Date();

      if (!workflow && !dto.allowAutoApprovalWithoutWorkflow) {
        throw new BadRequestException('No active workflow matched this approval request.');
      }

      if (!workflow) {
        const approved = await tx.approvalRequest.create({
          data: {
            tenantId,
            workflowId: null,
            module: dto.module.trim(),
            entityType: dto.entityType.trim(),
            entityId: dto.entityId.trim(),
            title: dto.title.trim(),
            description: dto.description,
            status: ApprovalRequestStatus.APPROVED,
            submittedById: actor.id,
            submittedAt,
            completedAt: submittedAt,
            payload: this.toJson(dto.payload),
            metadata: this.toJson(dto.metadata),
            actions: {
              create: [
                {
                  actorUserId: actor.id,
                  action: ApprovalActionType.SUBMITTED,
                  comment: 'Submitted without matching workflow.',
                },
                {
                  actorUserId: actor.id,
                  action: ApprovalActionType.APPROVED,
                  comment: 'Auto-approved because no matching workflow was required.',
                },
              ],
            },
          },
          include: this.approvalInclude,
        });

        await this.writeRequestEffects(tx, actor, tenantId, approved, {
          auditAction: AuditAction.APPROVE,
          outboxEvent: 'approval.request.auto_approved',
          timelineType: TimelineEventType.WORKFLOW_APPROVED,
          employeeId: entityContext.employeeId,
        });

        return approved;
      }

      if (workflow.steps.length === 0) {
        throw new BadRequestException('Matched workflow has no steps.');
      }

      const request = await tx.approvalRequest.create({
        data: {
          tenantId,
          workflowId: workflow.id,
          module: dto.module.trim(),
          entityType: dto.entityType.trim(),
          entityId: dto.entityId.trim(),
          title: dto.title.trim(),
          description: dto.description,
          status: ApprovalRequestStatus.PENDING,
          submittedById: actor.id,
          submittedAt,
          payload: this.toJson(dto.payload),
          metadata: this.toJson(dto.metadata),
          steps: {
            create: await this.stepInstancesForWorkflow(tx, tenantId, workflow, dto, submittedAt),
          },
          actions: {
            create: {
              actorUserId: actor.id,
              action: ApprovalActionType.SUBMITTED,
              comment: dto.description,
              metadata: this.toJson(dto.metadata),
            },
          },
        },
        include: this.approvalInclude,
      });

      await this.advanceAutomatedSteps(tx, tenantId, request.id);
      const finalRequest = await this.findRequestOrThrow(tx, tenantId, request.id);

      await this.writeRequestEffects(tx, actor, tenantId, finalRequest, {
        auditAction: AuditAction.CREATE,
        outboxEvent: 'approval.request.submitted',
        timelineType:
          finalRequest.status === ApprovalRequestStatus.APPROVED
            ? TimelineEventType.WORKFLOW_APPROVED
            : TimelineEventType.WORKFLOW_SUBMITTED,
        employeeId: entityContext.employeeId,
      });

      return finalRequest;
    });
  }

  async listRequests(actor: AuthenticatedPrincipal, query: ListApprovalRequestsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const assignmentFilter = query.assignedToMe
      ? await this.assignmentWhereForActor(actor, tenantId, query.module)
      : undefined;

    const requests = await this.prisma.approvalRequest.findMany({
      where: {
        tenantId,
        status: query.status,
        module: query.module,
        workflowId: query.workflowId,
        entityType: query.entityType,
        entityId: query.entityId,
        submittedById: query.submittedById,
        steps: assignmentFilter ? { some: assignmentFilter } : undefined,
        OR: query.search
          ? [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { entityType: { contains: query.search, mode: 'insensitive' } },
              { entityId: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.approvalInclude,
    });

    return this.paginate(requests, limit);
  }

  async listTasks(actor: AuthenticatedPrincipal, query: ListApprovalTasksQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const assignmentFilter = query.assignedToMe === false
      ? {}
      : await this.assignmentWhereForActor(actor, tenantId, query.module);

    const steps = await this.prisma.approvalStepInstance.findMany({
      where: {
        status: query.status ?? ApprovalRequestStatus.PENDING,
        approvalRequest: {
          tenantId,
          module: query.module,
          status: ApprovalRequestStatus.PENDING,
        },
        ...assignmentFilter,
      },
      take: query.currentOnly === false ? limit + 1 : Math.min(limit * 5, 500),
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'asc' }, { stepOrder: 'asc' }, { id: 'asc' }],
      include: this.taskInclude,
    });

    const data = query.currentOnly === false ? steps : this.filterCurrentSteps(steps).slice(0, limit + 1);
    return this.paginate(data, limit);
  }

  async getRequest(actor: AuthenticatedPrincipal, requestId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findRequestOrThrow(this.prisma, tenantId, requestId);
  }

  async approveRequest(actor: AuthenticatedPrincipal, requestId: string, dto: ApprovalActionDto) {
    return this.processCurrentStep(actor, requestId, ApprovalActionType.APPROVED, dto);
  }

  async rejectRequest(actor: AuthenticatedPrincipal, requestId: string, dto: ApprovalActionDto) {
    return this.processCurrentStep(actor, requestId, ApprovalActionType.REJECTED, dto);
  }

  async returnRequest(actor: AuthenticatedPrincipal, requestId: string, dto: ApprovalActionDto) {
    return this.processCurrentStep(actor, requestId, ApprovalActionType.RETURNED, dto);
  }

  async commentOnRequest(actor: AuthenticatedPrincipal, requestId: string, dto: ApprovalActionDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const request = await this.findRequestOrThrow(tx, tenantId, requestId);
      await tx.approvalAction.create({
        data: {
          approvalRequestId: request.id,
          actorUserId: actor.id,
          action: ApprovalActionType.COMMENTED,
          comment: dto.comment,
          metadata: this.toJson(dto.metadata),
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'ApprovalRequest', request.id, null, {
        action: ApprovalActionType.COMMENTED,
        comment: dto.comment,
      });

      await this.enqueueOutbox(tx, tenantId, 'approval.request.commented', request.id, {
        approvalRequestId: request.id,
        actorUserId: actor.id,
      });

      return this.findRequestOrThrow(tx, tenantId, request.id);
    });
  }

  async cancelRequest(actor: AuthenticatedPrincipal, requestId: string, dto: ApprovalActionDto) {
    return this.terminateRequest(actor, requestId, ApprovalRequestStatus.CANCELLED, ApprovalActionType.CANCELLED, dto);
  }

  async withdrawRequest(actor: AuthenticatedPrincipal, requestId: string, dto: ApprovalActionDto) {
    const tenantId = this.requireTenant(actor);
    const request = await this.findRequestOrThrow(this.prisma, tenantId, requestId);

    if (request.submittedById !== actor.id && !actor.permissions.includes('approvals.process')) {
      throw new ForbiddenException('Only the submitter or an approval processor can withdraw this request.');
    }

    return this.terminateRequest(actor, requestId, ApprovalRequestStatus.WITHDRAWN, ApprovalActionType.CANCELLED, dto);
  }

  async delegateCurrentStep(
    actor: AuthenticatedPrincipal,
    requestId: string,
    dto: DelegateApprovalDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const request = await this.findRequestOrThrow(tx, tenantId, requestId);
      this.assertRequestPending(request);
      const currentStep = this.currentPendingStep(request);

      if (!currentStep) {
        throw new BadRequestException('Approval request has no pending step.');
      }

      await this.assertActorCanActOnStep(tx, actor, tenantId, request, currentStep);

      if (currentStep.workflowStep && !currentStep.workflowStep.allowDelegation) {
        throw new ForbiddenException('This workflow step does not allow delegation.');
      }

      await this.validateUserReference(tx, tenantId, dto.toUserId);
      const before = this.stepState(currentStep);
      const updated = await tx.approvalStepInstance.update({
        where: { id: currentStep.id },
        data: {
          assignedUserId: dto.toUserId,
          assignedRoleId: null,
          metadata: this.toJson({
            delegatedById: actor.id,
            delegatedAt: new Date().toISOString(),
            previousAssignedUserId: currentStep.assignedUserId,
            previousAssignedRoleId: currentStep.assignedRoleId,
            ...dto.metadata,
          }),
        },
      });

      await tx.approvalAction.create({
        data: {
          approvalRequestId: request.id,
          stepInstanceId: currentStep.id,
          actorUserId: actor.id,
          action: ApprovalActionType.DELEGATED,
          comment: dto.comment,
          metadata: this.toJson({ toUserId: dto.toUserId, ...dto.metadata }),
        },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'ApprovalStepInstance',
        currentStep.id,
        before,
        this.stepState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'approval.step.delegated', request.id, {
        approvalRequestId: request.id,
        stepInstanceId: currentStep.id,
        fromUserId: actor.id,
        toUserId: dto.toUserId,
      });

      return this.findRequestOrThrow(tx, tenantId, request.id);
    });
  }

  async createDelegation(actor: AuthenticatedPrincipal, dto: CreateDelegationDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      await Promise.all([
        this.validateUserReference(tx, tenantId, dto.fromUserId),
        this.validateUserReference(tx, tenantId, dto.toUserId),
      ]);

      if (dto.fromUserId === dto.toUserId) {
        throw new BadRequestException('Delegation source and target users must be different.');
      }

      const startsAt = new Date(dto.startsAt);
      const endsAt = new Date(dto.endsAt);

      if (endsAt <= startsAt) {
        throw new BadRequestException('Delegation end date must be after start date.');
      }

      const delegation = await tx.delegation.create({
        data: {
          tenantId,
          fromUserId: dto.fromUserId,
          toUserId: dto.toUserId,
          module: dto.module,
          startsAt,
          endsAt,
          isActive: dto.isActive ?? true,
          reason: dto.reason,
        },
        include: this.delegationInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'Delegation', delegation.id, null, {
        fromUserId: delegation.fromUserId,
        toUserId: delegation.toUserId,
        module: delegation.module,
        startsAt: delegation.startsAt.toISOString(),
        endsAt: delegation.endsAt.toISOString(),
      });

      await this.enqueueOutbox(tx, tenantId, 'approval.delegation.created', delegation.id, {
        delegationId: delegation.id,
        fromUserId: delegation.fromUserId,
        toUserId: delegation.toUserId,
      });

      return delegation;
    });
  }

  async listDelegations(actor: AuthenticatedPrincipal, query: ListDelegationsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const now = new Date();

    const delegations = await this.prisma.delegation.findMany({
      where: {
        tenantId,
        fromUserId: query.fromUserId,
        toUserId: query.toUserId,
        module: query.module,
        isActive: query.isActive,
        startsAt: query.activeNow ? { lte: now } : undefined,
        endsAt: query.activeNow ? { gt: now } : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      include: this.delegationInclude,
    });

    return this.paginate(delegations, limit);
  }

  async updateDelegation(
    actor: AuthenticatedPrincipal,
    delegationId: string,
    dto: UpdateDelegationDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findDelegationOrThrow(tx, tenantId, delegationId);

      if (dto.fromUserId) {
        await this.validateUserReference(tx, tenantId, dto.fromUserId);
      }

      if (dto.toUserId) {
        await this.validateUserReference(tx, tenantId, dto.toUserId);
      }

      const fromUserId = dto.fromUserId ?? existing.fromUserId;
      const toUserId = dto.toUserId ?? existing.toUserId;

      if (fromUserId === toUserId) {
        throw new BadRequestException('Delegation source and target users must be different.');
      }

      const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
      const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;

      if (endsAt <= startsAt) {
        throw new BadRequestException('Delegation end date must be after start date.');
      }

      const updated = await tx.delegation.update({
        where: { id: existing.id },
        data: {
          fromUserId: dto.fromUserId,
          toUserId: dto.toUserId,
          module: dto.module,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          isActive: dto.isActive,
          reason: dto.reason,
        },
        include: this.delegationInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'Delegation',
        updated.id,
        this.delegationState(existing),
        this.delegationState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'approval.delegation.updated', updated.id, {
        delegationId: updated.id,
      });

      return updated;
    });
  }

  async deleteDelegation(actor: AuthenticatedPrincipal, delegationId: string) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findDelegationOrThrow(tx, tenantId, delegationId);
      const updated = await tx.delegation.update({
        where: { id: existing.id },
        data: {
          isActive: false,
          endsAt: existing.endsAt > new Date() ? new Date() : existing.endsAt,
        },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.DISABLE,
        'Delegation',
        existing.id,
        this.delegationState(existing),
        this.delegationState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'approval.delegation.disabled', existing.id, {
        delegationId: existing.id,
      });

      return { disabled: true };
    });
  }

  private async processCurrentStep(
    actor: AuthenticatedPrincipal,
    requestId: string,
    action: ApprovalActionType,
    dto: ApprovalActionDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const request = await this.findRequestOrThrow(tx, tenantId, requestId);
      this.assertRequestPending(request);

      const currentStep = this.currentPendingStep(request);
      if (!currentStep) {
        throw new BadRequestException('Approval request has no pending step.');
      }

      await this.assertActorCanActOnStep(tx, actor, tenantId, request, currentStep);

      await tx.approvalAction.create({
        data: {
          approvalRequestId: request.id,
          stepInstanceId: currentStep.id,
          actorUserId: actor.id,
          action,
          comment: dto.comment,
          metadata: this.toJson(dto.metadata),
        },
      });

      if (action === ApprovalActionType.APPROVED) {
        await tx.approvalStepInstance.update({
          where: { id: currentStep.id },
          data: {
            status: ApprovalRequestStatus.APPROVED,
            completedAt: new Date(),
          },
        });

        await this.advanceAutomatedSteps(tx, tenantId, request.id);
      } else if (action === ApprovalActionType.REJECTED) {
        await tx.approvalStepInstance.update({
          where: { id: currentStep.id },
          data: {
            status: ApprovalRequestStatus.REJECTED,
            completedAt: new Date(),
          },
        });

        await this.setRequestTerminal(
          tx,
          tenantId,
          request.id,
          ApprovalRequestStatus.REJECTED,
          WorkforceActionStatus.REJECTED,
        );
      } else {
        await tx.approvalStepInstance.update({
          where: { id: currentStep.id },
          data: {
            metadata: this.mergeJsonObject(currentStep.metadata, {
              returnedById: actor.id,
              returnedAt: new Date().toISOString(),
              returnComment: dto.comment,
              ...dto.metadata,
            }),
          },
        });
      }

      const updated = await this.findRequestOrThrow(tx, tenantId, request.id);
      const entityContext = await this.resolveEntityContext(tx, tenantId, updated.entityType, updated.entityId, true);
      const terminal = TERMINAL_APPROVAL_STATUSES.includes(updated.status);

      await this.writeRequestEffects(tx, actor, tenantId, updated, {
        auditAction: action === ApprovalActionType.APPROVED ? AuditAction.APPROVE : action === ApprovalActionType.REJECTED ? AuditAction.REJECT : AuditAction.UPDATE,
        outboxEvent: this.outboxEventForAction(action, updated.status),
        timelineType:
          updated.status === ApprovalRequestStatus.APPROVED
            ? TimelineEventType.WORKFLOW_APPROVED
            : updated.status === ApprovalRequestStatus.REJECTED
              ? TimelineEventType.WORKFLOW_REJECTED
              : TimelineEventType.WORKFLOW_SUBMITTED,
        employeeId: entityContext.employeeId,
        terminal,
      });

      return updated;
    });
  }

  private async terminateRequest(
    actor: AuthenticatedPrincipal,
    requestId: string,
    status: ApprovalRequestStatus,
    action: ApprovalActionType,
    dto: ApprovalActionDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const request = await this.findRequestOrThrow(tx, tenantId, requestId);
      this.assertRequestPending(request);

      await tx.approvalStepInstance.updateMany({
        where: {
          approvalRequestId: request.id,
          status: ApprovalRequestStatus.PENDING,
        },
        data: {
          status,
          completedAt: new Date(),
        },
      });

      await tx.approvalAction.create({
        data: {
          approvalRequestId: request.id,
          actorUserId: actor.id,
          action,
          comment: dto.comment,
          metadata: this.toJson(dto.metadata),
        },
      });

      await this.setRequestTerminal(tx, tenantId, request.id, status, WorkforceActionStatus.CANCELLED);
      const updated = await this.findRequestOrThrow(tx, tenantId, request.id);
      const entityContext = await this.resolveEntityContext(tx, tenantId, updated.entityType, updated.entityId, true);

      await this.writeRequestEffects(tx, actor, tenantId, updated, {
        auditAction: AuditAction.UPDATE,
        outboxEvent: status === ApprovalRequestStatus.WITHDRAWN ? 'approval.request.withdrawn' : 'approval.request.cancelled',
        timelineType: TimelineEventType.WORKFLOW_REJECTED,
        employeeId: entityContext.employeeId,
        terminal: true,
      });

      return updated;
    });
  }

  private async advanceAutomatedSteps(
    tx: Prisma.TransactionClient,
    tenantId: string,
    requestId: string,
  ) {
    while (true) {
      const request = await this.findRequestOrThrow(tx, tenantId, requestId);
      const currentStep = this.currentPendingStep(request);

      if (!currentStep) {
        await this.setRequestTerminal(
          tx,
          tenantId,
          request.id,
          ApprovalRequestStatus.APPROVED,
          WorkforceActionStatus.APPROVED,
        );
        return;
      }

      const stepType = currentStep.workflowStep?.type;
      const isRequired = currentStep.workflowStep?.isRequired ?? true;

      if (isRequired && stepType && !AUTOMATED_STEP_TYPES.includes(stepType)) {
        return;
      }

      await tx.approvalStepInstance.update({
        where: { id: currentStep.id },
        data: {
          status: ApprovalRequestStatus.APPROVED,
          completedAt: new Date(),
          metadata: this.mergeJsonObject(currentStep.metadata, {
            automatedAt: new Date().toISOString(),
            automatedReason: isRequired ? stepType : 'OPTIONAL_STEP',
          }),
        },
      });

      await tx.approvalAction.create({
        data: {
          approvalRequestId: request.id,
          stepInstanceId: currentStep.id,
          action: ApprovalActionType.APPROVED,
          comment: 'Automated workflow step completed.',
        },
      });
    }
  }

  private async setRequestTerminal(
    tx: Prisma.TransactionClient,
    tenantId: string,
    requestId: string,
    status: ApprovalRequestStatus,
    workforceActionStatus: WorkforceActionStatus,
  ) {
    await tx.approvalRequest.update({
      where: { id: requestId },
      data: {
        status,
        completedAt: new Date(),
      },
    });

    await tx.workforceAction.updateMany({
      where: {
        tenantId,
        workflowRequestId: requestId,
        status: WorkforceActionStatus.PENDING_APPROVAL,
      },
      data: {
        status: workforceActionStatus,
        completedAt:
          workforceActionStatus === WorkforceActionStatus.APPROVED ||
          workforceActionStatus === WorkforceActionStatus.REJECTED ||
          workforceActionStatus === WorkforceActionStatus.CANCELLED
            ? new Date()
            : undefined,
      },
    });
  }

  private async stepInstancesForWorkflow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    workflow: WorkflowWithSteps,
    dto: SubmitApprovalRequestDto,
    submittedAt: Date,
  ): Promise<Prisma.ApprovalStepInstanceCreateWithoutApprovalRequestInput[]> {
    const instances: Prisma.ApprovalStepInstanceCreateWithoutApprovalRequestInput[] = [];

    for (const step of workflow.steps) {
      const resolved = await this.resolveStepAssignee(tx, tenantId, step, dto);
      const isActionable = step.type === WorkflowStepType.APPROVAL || step.type === WorkflowStepType.REVIEW;

      if (step.isRequired && isActionable && !resolved.assignedUserId && !resolved.assignedRoleId) {
        throw new BadRequestException(`Workflow step "${step.name}" could not resolve an approver.`);
      }

      instances.push({
        workflowStep: { connect: { id: step.id } },
        stepOrder: step.stepOrder,
        name: step.name,
        assignedUser: resolved.assignedUserId ? { connect: { id: resolved.assignedUserId } } : undefined,
        assignedRole: resolved.assignedRoleId ? { connect: { id: resolved.assignedRoleId } } : undefined,
        status: ApprovalRequestStatus.PENDING,
        dueAt: step.slaHours ? this.addHours(submittedAt, step.slaHours) : undefined,
        metadata: this.toJson({
          workflowStepType: step.type,
          isRequired: step.isRequired,
          allowDelegation: step.allowDelegation,
          sourceWorkflowStepId: step.id,
        }),
      });
    }

    return instances;
  }

  private async resolveStepAssignee(
    tx: Prisma.TransactionClient,
    tenantId: string,
    step: WorkflowStep,
    dto: SubmitApprovalRequestDto,
  ) {
    if (step.approverUserId) {
      return { assignedUserId: step.approverUserId, assignedRoleId: null };
    }

    if (step.approverRoleId) {
      return { assignedUserId: null, assignedRoleId: step.approverRoleId };
    }

    const expression = this.readApproverExpression(step.approverExpression);
    if (!expression) {
      return { assignedUserId: null, assignedRoleId: null };
    }

    if (expression === 'employee.manager') {
      const employeeId = dto.entityType === 'Employee'
        ? dto.entityId
        : typeof dto.payload?.employeeId === 'string'
          ? dto.payload.employeeId
          : undefined;

      if (!employeeId) {
        return { assignedUserId: null, assignedRoleId: null };
      }

      const assignment = await tx.employeeAssignment.findFirst({
        where: {
          tenantId,
          employeeId,
          isPrimary: true,
          effectiveFrom: { lte: new Date() },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
        },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
        include: {
          managerEmployee: {
            select: {
              userId: true,
            },
          },
        },
      });

      return {
        assignedUserId: assignment?.managerEmployee?.userId ?? null,
        assignedRoleId: null,
      };
    }

    if (expression.startsWith('role:')) {
      const roleCode = expression.slice('role:'.length).trim().toUpperCase();
      const role = await tx.role.findFirst({
        where: {
          OR: [{ tenantId }, { tenantId: null }],
          code: roleCode,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });

      return {
        assignedUserId: null,
        assignedRoleId: role?.id ?? null,
      };
    }

    return { assignedUserId: null, assignedRoleId: null };
  }

  private readApproverExpression(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const expression = (value as Record<string, unknown>).expression ?? (value as Record<string, unknown>).type;
    return typeof expression === 'string' ? expression.trim() : null;
  }

  private async resolveWorkflow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: SubmitApprovalRequestDto,
  ): Promise<WorkflowWithSteps | null> {
    const where: Prisma.WorkflowWhereInput = {
      tenantId,
      status: WorkflowStatus.ACTIVE,
      deletedAt: null,
    };

    if (dto.workflowId) {
      where.id = dto.workflowId;
    } else if (dto.workflowCode) {
      where.code = dto.workflowCode.trim().toUpperCase();
      where.module = dto.module.trim();
    } else if (dto.triggerKey) {
      where.triggerKey = dto.triggerKey;
      where.module = dto.module.trim();
    } else {
      return null;
    }

    return tx.workflow.findFirst({
      where,
      include: {
        steps: {
          orderBy: [{ stepOrder: 'asc' }],
        },
      },
    });
  }

  private async assertActorCanActOnStep(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    request: ApprovalRequestWithRelations,
    step: ApprovalStepWithRelations,
  ) {
    if (step.assignedUserId === actor.id) {
      return;
    }

    const roleIds = await this.actorRoleIds(tx, actor, tenantId);
    if (step.assignedRoleId && roleIds.includes(step.assignedRoleId)) {
      return;
    }

    if (step.assignedUserId && (step.workflowStep?.allowDelegation ?? true)) {
      const delegated = await tx.delegation.findFirst({
        where: {
          tenantId,
          fromUserId: step.assignedUserId,
          toUserId: actor.id,
          isActive: true,
          startsAt: { lte: new Date() },
          endsAt: { gt: new Date() },
          OR: [{ module: null }, { module: request.module }],
        },
        select: { id: true },
      });

      if (delegated) {
        return;
      }
    }

    throw new ForbiddenException('You are not assigned to the current approval step.');
  }

  private async assignmentWhereForActor(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    module?: string,
  ): Promise<Prisma.ApprovalStepInstanceWhereInput> {
    const roleIds = await this.actorRoleIds(this.prisma, actor, tenantId);
    const delegatedFromUserIds = await this.activeDelegatedFromUserIds(tenantId, actor.id, module);

    return {
      status: ApprovalRequestStatus.PENDING,
      OR: [
        { assignedUserId: actor.id },
        delegatedFromUserIds.length > 0 ? { assignedUserId: { in: delegatedFromUserIds } } : undefined,
        roleIds.length > 0 ? { assignedRoleId: { in: roleIds } } : undefined,
      ].filter(Boolean) as Prisma.ApprovalStepInstanceWhereInput[],
    };
  }

  private async activeDelegatedFromUserIds(tenantId: string, toUserId: string, module?: string) {
    const delegations = await this.prisma.delegation.findMany({
      where: {
        tenantId,
        toUserId,
        isActive: true,
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
        OR: module ? [{ module: null }, { module }] : undefined,
      },
      select: { fromUserId: true },
    });

    return delegations.map((delegation) => delegation.fromUserId);
  }

  private async actorRoleIds(
    client: Prisma.TransactionClient | PrismaService,
    actor: AuthenticatedPrincipal,
    tenantId: string,
  ) {
    const userRoles = await client.userRole.findMany({
      where: {
        userId: actor.id,
        role: {
          OR: [{ tenantId }, { tenantId: null }],
          isActive: true,
          deletedAt: null,
        },
        OR: [
          { startsAt: null },
          { startsAt: { lte: new Date() } },
        ],
        AND: [
          {
            OR: [
              { endsAt: null },
              { endsAt: { gt: new Date() } },
            ],
          },
        ],
      },
      select: { roleId: true },
    });

    return userRoles.map((userRole) => userRole.roleId);
  }

  private filterCurrentSteps<TStep extends { approvalRequestId: string; stepOrder: number; status: ApprovalRequestStatus }>(
    steps: TStep[],
  ) {
    const minByRequest = new Map<string, number>();

    for (const step of steps) {
      if (step.status !== ApprovalRequestStatus.PENDING) {
        continue;
      }

      const current = minByRequest.get(step.approvalRequestId);
      if (current === undefined || step.stepOrder < current) {
        minByRequest.set(step.approvalRequestId, step.stepOrder);
      }
    }

    return steps.filter((step) => minByRequest.get(step.approvalRequestId) === step.stepOrder);
  }

  private currentPendingStep(request: ApprovalRequestWithRelations) {
    return request.steps
      .filter((step) => step.status === ApprovalRequestStatus.PENDING)
      .sort((a, b) => a.stepOrder - b.stepOrder || a.createdAt.getTime() - b.createdAt.getTime())[0];
  }

  private assertRequestPending(request: ApprovalRequestWithRelations) {
    if (request.status !== ApprovalRequestStatus.PENDING) {
      throw new BadRequestException(`Approval request is already ${request.status}.`);
    }
  }

  private async resolveEntityContext(
    tx: Prisma.TransactionClient,
    tenantId: string,
    entityType: string,
    entityId: string,
    optional = false,
  ): Promise<{ employeeId?: string }> {
    const normalized = entityType.trim().toLowerCase();

    if (normalized === 'employee') {
      const employee = await tx.employee.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true },
      });

      if (!employee && !optional) {
        throw new BadRequestException('Employee entity reference is invalid.');
      }

      return { employeeId: employee?.id };
    }

    if (normalized === 'employeeassignment' || normalized === 'employee_assignment') {
      const assignment = await tx.employeeAssignment.findFirst({
        where: { id: entityId, tenantId },
        select: { employeeId: true },
      });

      if (!assignment && !optional) {
        throw new BadRequestException('Employee assignment entity reference is invalid.');
      }

      return { employeeId: assignment?.employeeId };
    }

    if (normalized === 'workforceaction' || normalized === 'workforce_action') {
      const action = await tx.workforceAction.findFirst({
        where: { id: entityId, tenantId },
        select: { employeeId: true },
      });

      if (!action && !optional) {
        throw new BadRequestException('Workforce action entity reference is invalid.');
      }

      return { employeeId: action?.employeeId };
    }

    if (normalized === 'leaverequest' || normalized === 'leave_request') {
      const leaveRequest = await tx.leaveRequest.findFirst({
        where: { id: entityId, tenantId },
        select: { employeeId: true },
      });

      if (!leaveRequest && !optional) {
        throw new BadRequestException('Leave request entity reference is invalid.');
      }

      return { employeeId: leaveRequest?.employeeId };
    }

    if (normalized === 'position') {
      const position = await tx.position.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true },
      });

      if (!position && !optional) {
        throw new BadRequestException('Position entity reference is invalid.');
      }
    }

    if (normalized === 'person') {
      const person = await tx.person.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true },
      });

      if (!person && !optional) {
        throw new BadRequestException('Person entity reference is invalid.');
      }
    }

    return {};
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
      throw new BadRequestException('User reference is invalid for this tenant.');
    }
  }

  private async findRequestOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    requestId: string,
  ): Promise<ApprovalRequestWithRelations> {
    const request = await client.approvalRequest.findFirst({
      where: { id: requestId, tenantId },
      include: this.approvalInclude,
    });

    if (!request) {
      throw new NotFoundException('Approval request not found.');
    }

    return request;
  }

  private async findDelegationOrThrow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    delegationId: string,
  ) {
    const delegation = await tx.delegation.findFirst({
      where: { id: delegationId, tenantId },
      include: this.delegationInclude,
    });

    if (!delegation) {
      throw new NotFoundException('Delegation not found.');
    }

    return delegation;
  }

  private async writeRequestEffects(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    request: ApprovalRequestWithRelations,
    input: {
      auditAction: AuditAction;
      outboxEvent: string;
      timelineType: TimelineEventType;
      employeeId?: string;
      terminal?: boolean;
    },
  ) {
    await this.writeAudit(
      tx,
      actor,
      tenantId,
      input.auditAction,
      'ApprovalRequest',
      request.id,
      null,
      this.requestState(request),
    );

    if (input.employeeId) {
      await tx.timelineEvent.create({
        data: {
          tenantId,
          employeeId: input.employeeId,
          actorUserId: actor.id,
          type: input.timelineType,
          title: this.timelineTitle(input.timelineType),
          description: request.title,
          entityType: 'ApprovalRequest',
          entityId: request.id,
          data: this.requestState(request),
        },
      });
    }

    await this.enqueueOutbox(tx, tenantId, input.outboxEvent, request.id, {
      approvalRequestId: request.id,
      workflowId: request.workflowId,
      module: request.module,
      entityType: request.entityType,
      entityId: request.entityId,
      status: request.status,
      terminal: input.terminal ?? false,
    });
  }

  private timelineTitle(type: TimelineEventType) {
    switch (type) {
      case TimelineEventType.WORKFLOW_APPROVED:
        return 'Workflow approved';
      case TimelineEventType.WORKFLOW_REJECTED:
        return 'Workflow rejected';
      default:
        return 'Workflow submitted';
    }
  }

  private outboxEventForAction(action: ApprovalActionType, status: ApprovalRequestStatus) {
    if (status === ApprovalRequestStatus.APPROVED) {
      return 'approval.request.approved';
    }

    if (status === ApprovalRequestStatus.REJECTED) {
      return 'approval.request.rejected';
    }

    if (action === ApprovalActionType.RETURNED) {
      return 'approval.request.returned';
    }

    return 'approval.step.approved';
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
    aggregateId: string,
    payload: Prisma.InputJsonValue,
  ) {
    await tx.outboxMessage.create({
      data: {
        tenantId,
        eventType,
        aggregateType: 'ApprovalRequest',
        aggregateId,
        payload,
      },
    });
  }

  private requestState(request: ApprovalRequest): Prisma.InputJsonObject {
    return {
      id: request.id,
      workflowId: request.workflowId,
      module: request.module,
      entityType: request.entityType,
      entityId: request.entityId,
      title: request.title,
      status: request.status,
      submittedById: request.submittedById,
      submittedAt: request.submittedAt?.toISOString() ?? null,
      completedAt: request.completedAt?.toISOString() ?? null,
    };
  }

  private stepState(step: Pick<ApprovalStepInstance, 'id' | 'approvalRequestId' | 'stepOrder' | 'name' | 'assignedUserId' | 'assignedRoleId' | 'status' | 'completedAt'>): Prisma.InputJsonObject {
    return {
      id: step.id,
      approvalRequestId: step.approvalRequestId,
      stepOrder: step.stepOrder,
      name: step.name,
      assignedUserId: step.assignedUserId,
      assignedRoleId: step.assignedRoleId,
      status: step.status,
      completedAt: step.completedAt?.toISOString() ?? null,
    };
  }

  private delegationState(delegation: DelegationStateSource): Prisma.InputJsonObject {
    return {
      id: delegation.id,
      fromUserId: delegation.fromUserId,
      toUserId: delegation.toUserId,
      module: delegation.module,
      startsAt: delegation.startsAt.toISOString(),
      endsAt: delegation.endsAt.toISOString(),
      isActive: delegation.isActive,
      reason: delegation.reason,
    };
  }

  private mergeJsonObject(value: Prisma.JsonValue | null, patch: Record<string, unknown>) {
    const base =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return this.toJson({
      ...base,
      ...patch,
    });
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

  private addHours(date: Date, hours: number) {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
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

  private get approvalInclude() {
    return {
      workflow: {
        select: {
          id: true,
          code: true,
          name: true,
          module: true,
          status: true,
        },
      },
      submittedBy: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      steps: {
        orderBy: [{ stepOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          workflowStep: true,
          assignedUser: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
          assignedRole: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          actions: {
            orderBy: [{ createdAt: 'asc' }],
          },
        },
      },
      actions: {
        orderBy: [{ createdAt: 'asc' }],
        include: {
          actorUser: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      },
      workforceActions: {
        select: {
          id: true,
          type: true,
          status: true,
          employeeId: true,
        },
      },
    } satisfies Prisma.ApprovalRequestInclude;
  }

  private get taskInclude() {
    return {
      approvalRequest: {
        include: {
          workflow: {
            select: {
              id: true,
              code: true,
              name: true,
              module: true,
            },
          },
          submittedBy: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      },
      workflowStep: true,
      assignedUser: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      assignedRole: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    } satisfies Prisma.ApprovalStepInstanceInclude;
  }

  private get delegationInclude() {
    return {
      fromUser: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
      toUser: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    } satisfies Prisma.DelegationInclude;
  }
}

type WorkflowWithSteps = Workflow & {
  steps: WorkflowStep[];
};

type ApprovalRequestWithRelations = ApprovalRequest & {
  steps: ApprovalStepWithRelations[];
};

type ApprovalStepWithRelations = ApprovalStepInstance & {
  workflowStep: WorkflowStep | null;
};

type DelegationStateSource = {
  id: string;
  fromUserId: string;
  toUserId: string;
  module: string | null;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  reason: string | null;
};
