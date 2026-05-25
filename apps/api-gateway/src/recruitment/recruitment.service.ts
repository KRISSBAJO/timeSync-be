import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovalRequestStatus,
  AuditAction,
  RecruitmentApplicationStatus,
  RecruitmentCandidateStatus,
  RecruitmentControlStatus,
  RecruitmentEmploymentType,
  RecruitmentFeedbackRecommendation,
  RecruitmentInterviewStatus,
  RecruitmentOfferStatus,
  RecruitmentRequisitionStatus,
  RecruitmentStageType,
  RecruitmentWorkMode,
  TimelineEventType,
  WorkflowStatus,
  type Prisma,
  type RecruitmentApplication,
  type RecruitmentOffer,
  type RecruitmentRequisition,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { ApprovalActionDto } from '../workflows/dto/approval-action.dto';
import { SubmitApprovalRequestDto } from '../workflows/dto/submit-approval-request.dto';
import { ApprovalsService } from '../workflows/approvals.service';
import {
  CreateApplicationDto,
  CreateCandidateDto,
  CreateOfferDto,
  CreateRecruitmentApprovalRuleDto,
  CreateRequisitionDto,
  DecideRecruitmentDto,
  ListRecruitmentQueryDto,
  MoveApplicationDto,
  ScheduleInterviewDto,
  SubmitInterviewFeedbackDto,
  UpdateCandidateDto,
  UpdateOfferDto,
  UpdateRecruitmentApprovalRuleDto,
  UpdateRequisitionDto,
} from './dto/recruitment.dto';

type ApprovalRoute = {
  workflowId?: string;
  workflowCode?: string;
  triggerKey: string;
  source: string;
};

const DEFAULT_PIPELINE_STAGES: Array<{
  name: string;
  type: RecruitmentStageType;
  sequence: number;
  isTerminal?: boolean;
}> = [
  { name: 'Applied', type: RecruitmentStageType.APPLIED, sequence: 10 },
  { name: 'Screening', type: RecruitmentStageType.SCREENING, sequence: 20 },
  { name: 'Interview', type: RecruitmentStageType.INTERVIEW, sequence: 30 },
  { name: 'Offer', type: RecruitmentStageType.OFFER, sequence: 40 },
  { name: 'Hired', type: RecruitmentStageType.HIRED, sequence: 50, isTerminal: true },
  { name: 'Rejected', type: RecruitmentStageType.REJECTED, sequence: 60, isTerminal: true },
];

@Injectable()
export class RecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  async getSummary(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const now = new Date();
    const today = this.startOfDay(now);
    const tomorrow = this.addDays(today, 1);

    const [
      openRequisitions,
      pendingRequisitionApprovals,
      activeCandidates,
      activeApplications,
      interviewsToday,
      pendingOffers,
      requisitions,
    ] = await Promise.all([
      this.prisma.recruitmentRequisition.count({
        where: { tenantId, deletedAt: null, status: RecruitmentRequisitionStatus.OPEN },
      }),
      this.prisma.recruitmentRequisition.count({
        where: { tenantId, deletedAt: null, status: RecruitmentRequisitionStatus.SUBMITTED },
      }),
      this.prisma.recruitmentCandidate.count({
        where: { tenantId, deletedAt: null, status: RecruitmentCandidateStatus.ACTIVE },
      }),
      this.prisma.recruitmentApplication.count({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [RecruitmentApplicationStatus.APPLIED, RecruitmentApplicationStatus.SCREENING, RecruitmentApplicationStatus.INTERVIEW, RecruitmentApplicationStatus.OFFER] },
        },
      }),
      this.prisma.recruitmentInterview.count({
        where: {
          tenantId,
          deletedAt: null,
          status: RecruitmentInterviewStatus.SCHEDULED,
          scheduledStartAt: { gte: today, lt: tomorrow },
        },
      }),
      this.prisma.recruitmentOffer.count({
        where: { tenantId, deletedAt: null, status: { in: [RecruitmentOfferStatus.DRAFT, RecruitmentOfferStatus.SUBMITTED, RecruitmentOfferStatus.APPROVED] } },
      }),
      this.prisma.recruitmentRequisition.findMany({
        where: { tenantId, deletedAt: null },
        take: 6,
        orderBy: [{ updatedAt: 'desc' }],
        include: this.requisitionInclude,
      }),
    ]);

    return {
      generatedAt: now,
      metrics: {
        openRequisitions,
        pendingRequisitionApprovals,
        activeCandidates,
        activeApplications,
        interviewsToday,
        pendingOffers,
      },
      requisitions,
      permissions: {
        readRecruitment: actor.permissions.includes('recruitment.read'),
        manageRecruitment: actor.permissions.includes('recruitment.write'),
        approveRecruitment: actor.permissions.includes('recruitment.approve'),
        submitInterviewFeedback: actor.permissions.includes('recruitment.interview'),
        manageOffers: actor.permissions.includes('recruitment.offer.write'),
        readReports: actor.permissions.includes('recruitment.reports.read'),
      },
    };
  }

  async listRequisitions(actor: AuthenticatedPrincipal, query: ListRecruitmentQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const status = this.enumValue(RecruitmentRequisitionStatus, query.status);

    const rows = await this.prisma.recruitmentRequisition.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status,
        OR: query.search
          ? [
              { code: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              { departmentName: { contains: query.search, mode: 'insensitive' } },
              { locationName: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      include: this.requisitionInclude,
    });

    return this.paginate(rows, limit);
  }

  async createRequisition(actor: AuthenticatedPrincipal, dto: CreateRequisitionDto) {
    const tenantId = this.requireTenant(actor);
    await this.validateRequisitionReferences(tenantId, dto);

    if (dto.salaryMinCents && dto.salaryMaxCents && dto.salaryMinCents > dto.salaryMaxCents) {
      throw new BadRequestException('Salary minimum cannot exceed salary maximum.');
    }

    const requisition = await this.prisma.recruitmentRequisition.create({
      data: {
        tenant: { connect: { id: tenantId } },
        position: dto.positionId ? { connect: { id: dto.positionId } } : undefined,
        hiringManager: dto.hiringManagerId ? { connect: { id: dto.hiringManagerId } } : undefined,
        recruiter: dto.recruiterId ? { connect: { id: dto.recruiterId } } : undefined,
        code: this.normalizeCode(dto.code),
        title: dto.title.trim(),
        departmentName: dto.departmentName?.trim(),
        locationName: dto.locationName?.trim(),
        headcount: dto.headcount ?? 1,
        status: dto.status ?? RecruitmentRequisitionStatus.DRAFT,
        employmentType: dto.employmentType ?? RecruitmentEmploymentType.FULL_TIME,
        workMode: dto.workMode ?? RecruitmentWorkMode.ONSITE,
        priority: dto.priority ?? 50,
        targetStartDate: dto.targetStartDate ? this.toDate(dto.targetStartDate) : undefined,
        salaryMinCents: dto.salaryMinCents,
        salaryMaxCents: dto.salaryMaxCents,
        currencyCode: dto.currencyCode?.toUpperCase() ?? 'USD',
        description: dto.description?.trim(),
        requirements: dto.requirements?.trim(),
        metadata: this.toJson(dto.metadata),
        createdById: actor.id,
        stages: {
          create: DEFAULT_PIPELINE_STAGES.map((stage) => ({
            tenant: { connect: { id: tenantId } },
            name: stage.name,
            type: stage.type,
            sequence: stage.sequence,
            isTerminal: stage.isTerminal ?? false,
          })),
        },
      },
      include: this.requisitionInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'RecruitmentRequisition', requisition.id, null, this.requisitionState(requisition)),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.requisition.created', 'RecruitmentRequisition', requisition.id, this.requisitionState(requisition)),
    ]);

    return requisition;
  }

  async updateRequisition(actor: AuthenticatedPrincipal, requisitionId: string, dto: UpdateRequisitionDto) {
    const tenantId = this.requireTenant(actor);
    await this.validateRequisitionReferences(tenantId, dto);
    const before = await this.findRequisitionOrThrow(tenantId, requisitionId);

    if (dto.salaryMinCents && dto.salaryMaxCents && dto.salaryMinCents > dto.salaryMaxCents) {
      throw new BadRequestException('Salary minimum cannot exceed salary maximum.');
    }

    const updated = await this.prisma.recruitmentRequisition.update({
      where: { id: before.id },
      data: {
        position: dto.positionId ? { connect: { id: dto.positionId } } : undefined,
        hiringManager: dto.hiringManagerId ? { connect: { id: dto.hiringManagerId } } : undefined,
        recruiter: dto.recruiterId ? { connect: { id: dto.recruiterId } } : undefined,
        code: dto.code ? this.normalizeCode(dto.code) : undefined,
        title: dto.title?.trim(),
        departmentName: dto.departmentName?.trim(),
        locationName: dto.locationName?.trim(),
        headcount: dto.headcount,
        status: dto.status,
        employmentType: dto.employmentType,
        workMode: dto.workMode,
        priority: dto.priority,
        targetStartDate: dto.targetStartDate ? this.toDate(dto.targetStartDate) : undefined,
        salaryMinCents: dto.salaryMinCents,
        salaryMaxCents: dto.salaryMaxCents,
        currencyCode: dto.currencyCode?.toUpperCase(),
        description: dto.description?.trim(),
        requirements: dto.requirements?.trim(),
        metadata: this.toJson(dto.metadata),
      },
      include: this.requisitionInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'RecruitmentRequisition', updated.id, this.requisitionState(before), this.requisitionState(updated)),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.requisition.updated', 'RecruitmentRequisition', updated.id, this.requisitionState(updated)),
    ]);

    return updated;
  }

  async submitRequisition(actor: AuthenticatedPrincipal, requisitionId: string, dto: DecideRecruitmentDto) {
    const tenantId = this.requireTenant(actor);
    const requisition = await this.findRequisitionOrThrow(tenantId, requisitionId);

    if (requisition.status !== RecruitmentRequisitionStatus.DRAFT && requisition.status !== RecruitmentRequisitionStatus.REJECTED) {
      throw new BadRequestException('Only draft or rejected requisitions can be submitted.');
    }

    const route = await this.resolveApprovalRoute(tenantId, requisition, 'recruitment.requisition.submitted');
    const submitted = await this.prisma.recruitmentRequisition.update({
      where: { id: requisition.id },
      data: {
        status: RecruitmentRequisitionStatus.SUBMITTED,
        submittedById: actor.id,
        submittedAt: new Date(),
        workflowSnapshot: route ? this.toJson(route) : undefined,
      },
      include: this.requisitionInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'RecruitmentRequisition', submitted.id, this.requisitionState(requisition), this.requisitionState(submitted)),
      this.writeTimeline(this.prisma, actor, tenantId, TimelineEventType.RECRUITMENT_REQUISITION_SUBMITTED, 'Recruitment requisition submitted', submitted.title, 'RecruitmentRequisition', submitted.id, {
        requisitionId: submitted.id,
        code: submitted.code,
        route,
      }),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.requisition.submitted', 'RecruitmentRequisition', submitted.id, this.requisitionState(submitted)),
    ]);

    const approval = await this.approvalsService.submitRequest(actor, this.requisitionApprovalSubmission(submitted, route, dto));
    const status = approval.status === ApprovalRequestStatus.APPROVED
      ? RecruitmentRequisitionStatus.APPROVED
      : RecruitmentRequisitionStatus.SUBMITTED;

    const updated = await this.prisma.recruitmentRequisition.update({
      where: { id: submitted.id },
      data: {
        approvalRequestId: approval.id,
        status,
        decidedById: status === RecruitmentRequisitionStatus.APPROVED ? actor.id : undefined,
        decidedAt: status === RecruitmentRequisitionStatus.APPROVED ? new Date() : undefined,
      },
      include: this.requisitionInclude,
    });

    if (status === RecruitmentRequisitionStatus.APPROVED) {
      await this.writeRecruitmentApprovalEffects(actor, tenantId, 'RecruitmentRequisition', updated.id, updated.title, this.requisitionState(updated));
    }

    return updated;
  }

  async approveRequisition(actor: AuthenticatedPrincipal, requisitionId: string, dto: DecideRecruitmentDto) {
    const tenantId = this.requireTenant(actor);
    const requisition = await this.findRequisitionOrThrow(tenantId, requisitionId);

    if (requisition.approvalRequestId) {
      const approval = await this.approvalsService.approveRequest(actor, requisition.approvalRequestId, this.approvalAction(dto));
      if (approval.status !== ApprovalRequestStatus.APPROVED) {
        return this.findRequisitionOrThrow(tenantId, requisition.id);
      }
    }

    const updated = await this.prisma.recruitmentRequisition.update({
      where: { id: requisition.id },
      data: {
        status: RecruitmentRequisitionStatus.APPROVED,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
      include: this.requisitionInclude,
    });
    await this.writeRecruitmentApprovalEffects(actor, tenantId, 'RecruitmentRequisition', updated.id, updated.title, this.requisitionState(updated));
    return updated;
  }

  async rejectRequisition(actor: AuthenticatedPrincipal, requisitionId: string, dto: DecideRecruitmentDto) {
    const tenantId = this.requireTenant(actor);
    const requisition = await this.findRequisitionOrThrow(tenantId, requisitionId);

    if (requisition.approvalRequestId) {
      await this.approvalsService.rejectRequest(actor, requisition.approvalRequestId, this.approvalAction(dto));
    }

    const updated = await this.prisma.recruitmentRequisition.update({
      where: { id: requisition.id },
      data: {
        status: RecruitmentRequisitionStatus.REJECTED,
        decidedById: actor.id,
        decidedAt: new Date(),
        metadata: this.mergeJsonObject(requisition.metadata, { rejectionComment: dto.comment }),
      },
      include: this.requisitionInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.REJECT, 'RecruitmentRequisition', updated.id, this.requisitionState(requisition), this.requisitionState(updated)),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.requisition.rejected', 'RecruitmentRequisition', updated.id, this.requisitionState(updated)),
    ]);
    return updated;
  }

  async openRequisition(actor: AuthenticatedPrincipal, requisitionId: string) {
    const tenantId = this.requireTenant(actor);
    const requisition = await this.findRequisitionOrThrow(tenantId, requisitionId);

    if (requisition.status !== RecruitmentRequisitionStatus.APPROVED && requisition.status !== RecruitmentRequisitionStatus.OPEN) {
      throw new BadRequestException('Only approved requisitions can be opened.');
    }

    const updated = await this.prisma.recruitmentRequisition.update({
      where: { id: requisition.id },
      data: {
        status: RecruitmentRequisitionStatus.OPEN,
        openedAt: requisition.openedAt ?? new Date(),
      },
      include: this.requisitionInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.ACTIVATE, 'RecruitmentRequisition', updated.id, this.requisitionState(requisition), this.requisitionState(updated)),
      this.writeTimeline(this.prisma, actor, tenantId, TimelineEventType.RECRUITMENT_REQUISITION_OPENED, 'Recruitment requisition opened', updated.title, 'RecruitmentRequisition', updated.id, {
        requisitionId: updated.id,
        code: updated.code,
      }),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.requisition.opened', 'RecruitmentRequisition', updated.id, this.requisitionState(updated)),
    ]);

    return updated;
  }

  async closeRequisition(actor: AuthenticatedPrincipal, requisitionId: string, dto: DecideRecruitmentDto) {
    const tenantId = this.requireTenant(actor);
    const requisition = await this.findRequisitionOrThrow(tenantId, requisitionId);
    const updated = await this.prisma.recruitmentRequisition.update({
      where: { id: requisition.id },
      data: {
        status: RecruitmentRequisitionStatus.CLOSED,
        closedAt: new Date(),
        metadata: this.mergeJsonObject(requisition.metadata, { closeComment: dto.comment }),
      },
      include: this.requisitionInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.ARCHIVE, 'RecruitmentRequisition', updated.id, this.requisitionState(requisition), this.requisitionState(updated)),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.requisition.closed', 'RecruitmentRequisition', updated.id, this.requisitionState(updated)),
    ]);
    return updated;
  }

  async listCandidates(actor: AuthenticatedPrincipal, query: ListRecruitmentQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const status = this.enumValue(RecruitmentCandidateStatus, query.status);
    const rows = await this.prisma.recruitmentCandidate.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status,
        OR: query.search
          ? [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { currentTitle: { contains: query.search, mode: 'insensitive' } },
              { source: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      include: {
        applications: {
          take: 8,
          orderBy: [{ updatedAt: 'desc' }],
          include: { requisition: true, currentStage: true },
        },
      },
    });
    return this.paginate(rows, limit);
  }

  async createCandidate(actor: AuthenticatedPrincipal, dto: CreateCandidateDto) {
    const tenantId = this.requireTenant(actor);
    const candidate = await this.prisma.recruitmentCandidate.create({
      data: {
        tenant: { connect: { id: tenantId } },
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim(),
        source: dto.source?.trim(),
        status: dto.status ?? RecruitmentCandidateStatus.ACTIVE,
        currentEmployer: dto.currentEmployer?.trim(),
        currentTitle: dto.currentTitle?.trim(),
        locationName: dto.locationName?.trim(),
        resumeUrl: dto.resumeUrl,
        tags: dto.tags ?? [],
        metadata: this.toJson(dto.metadata),
      },
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'RecruitmentCandidate', candidate.id, null, this.candidateState(candidate)),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.candidate.created', 'RecruitmentCandidate', candidate.id, this.candidateState(candidate)),
    ]);
    return candidate;
  }

  async updateCandidate(actor: AuthenticatedPrincipal, candidateId: string, dto: UpdateCandidateDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.findCandidateOrThrow(tenantId, candidateId);
    const updated = await this.prisma.recruitmentCandidate.update({
      where: { id: before.id },
      data: {
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
        email: dto.email?.trim().toLowerCase(),
        phone: dto.phone?.trim(),
        source: dto.source?.trim(),
        status: dto.status,
        currentEmployer: dto.currentEmployer?.trim(),
        currentTitle: dto.currentTitle?.trim(),
        locationName: dto.locationName?.trim(),
        resumeUrl: dto.resumeUrl,
        tags: dto.tags,
        metadata: this.toJson(dto.metadata),
      },
    });
    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'RecruitmentCandidate', updated.id, this.candidateState(before), this.candidateState(updated));
    return updated;
  }

  async listApplications(actor: AuthenticatedPrincipal, query: ListRecruitmentQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const status = this.enumValue(RecruitmentApplicationStatus, query.status);
    const rows = await this.prisma.recruitmentApplication.findMany({
      where: {
        tenantId,
        deletedAt: null,
        requisitionId: query.requisitionId,
        candidateId: query.candidateId,
        status,
        OR: query.search
          ? [
              { candidate: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { candidate: { lastName: { contains: query.search, mode: 'insensitive' } } },
              { candidate: { email: { contains: query.search, mode: 'insensitive' } } },
              { requisition: { title: { contains: query.search, mode: 'insensitive' } } },
              { requisition: { code: { contains: query.search, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }],
      include: this.applicationInclude,
    });
    return this.paginate(rows, limit);
  }

  async createApplication(actor: AuthenticatedPrincipal, dto: CreateApplicationDto) {
    const tenantId = this.requireTenant(actor);
    const [candidate, requisition] = await Promise.all([
      this.findCandidateOrThrow(tenantId, dto.candidateId),
      this.findRequisitionOrThrow(tenantId, dto.requisitionId),
    ]);

    if (requisition.status !== RecruitmentRequisitionStatus.OPEN && requisition.status !== RecruitmentRequisitionStatus.APPROVED) {
      throw new BadRequestException('Applications can only be added to open or approved requisitions.');
    }

    const firstStage = await this.prisma.recruitmentPipelineStage.findFirst({
      where: { tenantId, requisitionId: requisition.id },
      orderBy: [{ sequence: 'asc' }],
    });

    const application = await this.prisma.recruitmentApplication.create({
      data: {
        tenant: { connect: { id: tenantId } },
        candidate: { connect: { id: candidate.id } },
        requisition: { connect: { id: requisition.id } },
        currentStage: firstStage ? { connect: { id: firstStage.id } } : undefined,
        status: this.applicationStatusForStage(firstStage?.type) ?? RecruitmentApplicationStatus.APPLIED,
        source: dto.source?.trim() ?? candidate.source,
        metadata: this.toJson(dto.metadata),
      },
      include: this.applicationInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'RecruitmentApplication', application.id, null, this.applicationState(application)),
      this.writeTimeline(this.prisma, actor, tenantId, TimelineEventType.RECRUITMENT_CANDIDATE_APPLIED, 'Candidate applied', `${candidate.firstName} ${candidate.lastName} applied to ${requisition.title}`, 'RecruitmentApplication', application.id, {
        applicationId: application.id,
        candidateId: candidate.id,
        requisitionId: requisition.id,
      }),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.application.created', 'RecruitmentApplication', application.id, this.applicationState(application)),
    ]);

    return application;
  }

  async moveApplication(actor: AuthenticatedPrincipal, applicationId: string, dto: MoveApplicationDto) {
    const tenantId = this.requireTenant(actor);
    const application = await this.findApplicationOrThrow(tenantId, applicationId);
    const stage = await this.prisma.recruitmentPipelineStage.findFirst({
      where: { id: dto.stageId, tenantId, requisitionId: application.requisitionId },
    });
    if (!stage) {
      throw new BadRequestException('Pipeline stage is invalid for this application requisition.');
    }

    const status = dto.status ?? this.applicationStatusForStage(stage.type) ?? application.status;
    const updated = await this.prisma.recruitmentApplication.update({
      where: { id: application.id },
      data: {
        currentStageId: stage.id,
        status,
        score: dto.score,
        decisionReason: dto.decisionReason?.trim(),
        rejectedAt: status === RecruitmentApplicationStatus.REJECTED ? new Date() : undefined,
        hiredAt: status === RecruitmentApplicationStatus.HIRED ? new Date() : undefined,
        lastActivityAt: new Date(),
        metadata: this.mergeJsonObject(application.metadata, dto.metadata ?? {}),
      },
      include: this.applicationInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'RecruitmentApplication', updated.id, this.applicationState(application), this.applicationState(updated)),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.application.moved', 'RecruitmentApplication', updated.id, this.applicationState(updated)),
    ]);
    return updated;
  }

  async listInterviews(actor: AuthenticatedPrincipal, query: ListRecruitmentQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const range = this.queryRange(query, 30);
    const status = this.enumValue(RecruitmentInterviewStatus, query.status);
    const rows = await this.prisma.recruitmentInterview.findMany({
      where: {
        tenantId,
        deletedAt: null,
        applicationId: query.applicationId,
        status,
        scheduledStartAt: { gte: range.from, lte: range.to },
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ scheduledStartAt: 'asc' }, { id: 'asc' }],
      include: this.interviewInclude,
    });
    return this.paginate(rows, limit);
  }

  async scheduleInterview(actor: AuthenticatedPrincipal, dto: ScheduleInterviewDto) {
    const tenantId = this.requireTenant(actor);
    const application = await this.findApplicationOrThrow(tenantId, dto.applicationId);
    const start = this.toDate(dto.scheduledStartAt);
    const end = this.toDate(dto.scheduledEndAt);

    if (end <= start) {
      throw new BadRequestException('Interview end time must be after start time.');
    }

    if (dto.stageId) {
      const stage = await this.prisma.recruitmentPipelineStage.findFirst({
        where: { id: dto.stageId, tenantId, requisitionId: application.requisitionId },
      });
      if (!stage) throw new BadRequestException('Interview stage is invalid for this application.');
    }

    const interview = await this.prisma.recruitmentInterview.create({
      data: {
        tenant: { connect: { id: tenantId } },
        application: { connect: { id: application.id } },
        stage: dto.stageId ? { connect: { id: dto.stageId } } : undefined,
        scheduledStartAt: start,
        scheduledEndAt: end,
        timezone: dto.timezone ?? 'America/Chicago',
        locationName: dto.locationName?.trim(),
        meetingUrl: dto.meetingUrl,
        status: dto.status ?? RecruitmentInterviewStatus.SCHEDULED,
        interviewerIds: dto.interviewerIds ?? [],
        notes: dto.notes?.trim(),
        metadata: this.toJson(dto.metadata),
      },
      include: this.interviewInclude,
    });

    await this.prisma.recruitmentApplication.update({
      where: { id: application.id },
      data: {
        status: RecruitmentApplicationStatus.INTERVIEW,
        lastActivityAt: new Date(),
      },
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'RecruitmentInterview', interview.id, null, this.interviewState(interview)),
      this.writeTimeline(this.prisma, actor, tenantId, TimelineEventType.RECRUITMENT_INTERVIEW_SCHEDULED, 'Recruitment interview scheduled', application.requisition.title, 'RecruitmentInterview', interview.id, {
        interviewId: interview.id,
        applicationId: application.id,
        scheduledStartAt: interview.scheduledStartAt.toISOString(),
      }),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.interview.scheduled', 'RecruitmentInterview', interview.id, this.interviewState(interview)),
    ]);
    return interview;
  }

  async submitInterviewFeedback(actor: AuthenticatedPrincipal, dto: SubmitInterviewFeedbackDto) {
    const tenantId = this.requireTenant(actor);
    const interview = await this.prisma.recruitmentInterview.findFirst({
      where: { id: dto.interviewId, tenantId, deletedAt: null },
      include: { application: true },
    });
    if (!interview) throw new NotFoundException('Interview not found.');

    const feedback = await this.prisma.recruitmentInterviewFeedback.create({
      data: {
        tenant: { connect: { id: tenantId } },
        interview: { connect: { id: interview.id } },
        application: { connect: { id: interview.applicationId } },
        reviewer: { connect: { id: actor.id } },
        rating: dto.rating,
        recommendation: dto.recommendation,
        strengths: dto.strengths?.trim(),
        concerns: dto.concerns?.trim(),
        notes: dto.notes?.trim(),
        metadata: this.toJson(dto.metadata),
      },
    });

    await this.prisma.recruitmentApplication.update({
      where: { id: interview.applicationId },
      data: { lastActivityAt: new Date() },
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'RecruitmentInterviewFeedback', feedback.id, null, this.feedbackState(feedback)),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.interview.feedback_submitted', 'RecruitmentInterviewFeedback', feedback.id, this.feedbackState(feedback)),
    ]);
    return feedback;
  }

  async listOffers(actor: AuthenticatedPrincipal, query: ListRecruitmentQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const status = this.enumValue(RecruitmentOfferStatus, query.status);
    const rows = await this.prisma.recruitmentOffer.findMany({
      where: {
        tenantId,
        deletedAt: null,
        applicationId: query.applicationId,
        status,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      include: this.offerInclude,
    });
    return this.paginate(rows, limit);
  }

  async createOffer(actor: AuthenticatedPrincipal, dto: CreateOfferDto) {
    const tenantId = this.requireTenant(actor);
    const application = await this.findApplicationOrThrow(tenantId, dto.applicationId);
    const offer = await this.prisma.recruitmentOffer.create({
      data: {
        tenant: { connect: { id: tenantId } },
        application: { connect: { id: application.id } },
        status: dto.status ?? RecruitmentOfferStatus.DRAFT,
        basePayCents: dto.basePayCents,
        currencyCode: dto.currencyCode?.toUpperCase() ?? 'USD',
        startDate: dto.startDate ? this.toDate(dto.startDate) : undefined,
        expiresAt: dto.expiresAt ? this.toDate(dto.expiresAt) : undefined,
        decisionNote: dto.decisionNote?.trim(),
        metadata: this.toJson(dto.metadata),
      },
      include: this.offerInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'RecruitmentOffer', offer.id, null, this.offerState(offer)),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.offer.created', 'RecruitmentOffer', offer.id, this.offerState(offer)),
    ]);
    return offer;
  }

  async updateOffer(actor: AuthenticatedPrincipal, offerId: string, dto: UpdateOfferDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.findOfferOrThrow(tenantId, offerId);
    const updated = await this.prisma.recruitmentOffer.update({
      where: { id: before.id },
      data: {
        status: dto.status,
        basePayCents: dto.basePayCents,
        currencyCode: dto.currencyCode?.toUpperCase(),
        startDate: dto.startDate ? this.toDate(dto.startDate) : undefined,
        expiresAt: dto.expiresAt ? this.toDate(dto.expiresAt) : undefined,
        decisionNote: dto.decisionNote?.trim(),
        metadata: this.toJson(dto.metadata),
      },
      include: this.offerInclude,
    });
    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'RecruitmentOffer', updated.id, this.offerState(before), this.offerState(updated));
    return updated;
  }

  async submitOffer(actor: AuthenticatedPrincipal, offerId: string, dto: DecideRecruitmentDto) {
    const tenantId = this.requireTenant(actor);
    const offer = await this.findOfferOrThrow(tenantId, offerId);

    if (offer.status !== RecruitmentOfferStatus.DRAFT && offer.status !== RecruitmentOfferStatus.REJECTED) {
      throw new BadRequestException('Only draft or rejected offers can be submitted.');
    }

    const route = await this.resolveApprovalRoute(tenantId, offer.application.requisition, 'recruitment.offer.submitted');
    const submitted = await this.prisma.recruitmentOffer.update({
      where: { id: offer.id },
      data: {
        status: RecruitmentOfferStatus.SUBMITTED,
        submittedById: actor.id,
        submittedAt: new Date(),
        workflowSnapshot: route ? this.toJson(route) : undefined,
      },
      include: this.offerInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'RecruitmentOffer', submitted.id, this.offerState(offer), this.offerState(submitted)),
      this.writeTimeline(this.prisma, actor, tenantId, TimelineEventType.RECRUITMENT_OFFER_SUBMITTED, 'Recruitment offer submitted', submitted.application.requisition.title, 'RecruitmentOffer', submitted.id, {
        offerId: submitted.id,
        applicationId: submitted.applicationId,
        route,
      }),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.offer.submitted', 'RecruitmentOffer', submitted.id, this.offerState(submitted)),
    ]);

    const approval = await this.approvalsService.submitRequest(actor, this.offerApprovalSubmission(submitted, route, dto));
    const status = approval.status === ApprovalRequestStatus.APPROVED ? RecruitmentOfferStatus.APPROVED : RecruitmentOfferStatus.SUBMITTED;
    const updated = await this.prisma.recruitmentOffer.update({
      where: { id: submitted.id },
      data: {
        approvalRequestId: approval.id,
        status,
        decidedById: status === RecruitmentOfferStatus.APPROVED ? actor.id : undefined,
        decidedAt: status === RecruitmentOfferStatus.APPROVED ? new Date() : undefined,
      },
      include: this.offerInclude,
    });

    if (status === RecruitmentOfferStatus.APPROVED) {
      await this.writeOfferApprovalEffects(actor, tenantId, updated);
    }
    return updated;
  }

  async approveOffer(actor: AuthenticatedPrincipal, offerId: string, dto: DecideRecruitmentDto) {
    const tenantId = this.requireTenant(actor);
    const offer = await this.findOfferOrThrow(tenantId, offerId);

    if (offer.approvalRequestId) {
      const approval = await this.approvalsService.approveRequest(actor, offer.approvalRequestId, this.approvalAction(dto));
      if (approval.status !== ApprovalRequestStatus.APPROVED) return this.findOfferOrThrow(tenantId, offer.id);
    }

    const updated = await this.prisma.recruitmentOffer.update({
      where: { id: offer.id },
      data: {
        status: RecruitmentOfferStatus.APPROVED,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
      include: this.offerInclude,
    });
    await this.writeOfferApprovalEffects(actor, tenantId, updated);
    return updated;
  }

  async rejectOffer(actor: AuthenticatedPrincipal, offerId: string, dto: DecideRecruitmentDto) {
    const tenantId = this.requireTenant(actor);
    const offer = await this.findOfferOrThrow(tenantId, offerId);

    if (offer.approvalRequestId) {
      await this.approvalsService.rejectRequest(actor, offer.approvalRequestId, this.approvalAction(dto));
    }

    const updated = await this.prisma.recruitmentOffer.update({
      where: { id: offer.id },
      data: {
        status: RecruitmentOfferStatus.REJECTED,
        decidedById: actor.id,
        decidedAt: new Date(),
        decisionNote: dto.comment ?? offer.decisionNote,
      },
      include: this.offerInclude,
    });
    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.REJECT, 'RecruitmentOffer', updated.id, this.offerState(offer), this.offerState(updated)),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.offer.rejected', 'RecruitmentOffer', updated.id, this.offerState(updated)),
    ]);
    return updated;
  }

  async listApprovalRules(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.recruitmentApprovalRule.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      include: { workflow: true },
    });
  }

  async createApprovalRule(actor: AuthenticatedPrincipal, dto: CreateRecruitmentApprovalRuleDto) {
    const tenantId = this.requireTenant(actor);
    await this.validateApprovalRuleReferences(tenantId, dto);
    const rule = await this.prisma.recruitmentApprovalRule.create({
      data: this.approvalRuleCreateData(tenantId, dto),
      include: { workflow: true },
    });
    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.CREATE, 'RecruitmentApprovalRule', rule.id, null, this.approvalRuleState(rule));
    return rule;
  }

  async updateApprovalRule(actor: AuthenticatedPrincipal, ruleId: string, dto: UpdateRecruitmentApprovalRuleDto) {
    const tenantId = this.requireTenant(actor);
    await this.validateApprovalRuleReferences(tenantId, dto);
    const before = await this.prisma.recruitmentApprovalRule.findFirst({ where: { id: ruleId, tenantId, deletedAt: null } });
    if (!before) throw new NotFoundException('Recruitment approval rule not found.');
    const updated = await this.prisma.recruitmentApprovalRule.update({
      where: { id: before.id },
      data: this.approvalRuleUpdateData(dto),
      include: { workflow: true },
    });
    await this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'RecruitmentApprovalRule', updated.id, this.approvalRuleState(before), this.approvalRuleState(updated));
    return updated;
  }

  async getReports(actor: AuthenticatedPrincipal, query: ListRecruitmentQueryDto) {
    const tenantId = this.requireTenant(actor);
    const range = this.queryRange(query, 90);
    const [requisitions, applications, interviews, offers, candidates] = await Promise.all([
      this.prisma.recruitmentRequisition.findMany({
        where: { tenantId, deletedAt: null, createdAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.recruitmentApplication.findMany({
        where: { tenantId, deletedAt: null, appliedAt: { gte: range.from, lte: range.to } },
        include: { candidate: true, requisition: true },
      }),
      this.prisma.recruitmentInterview.findMany({
        where: { tenantId, deletedAt: null, scheduledStartAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.recruitmentOffer.findMany({
        where: { tenantId, deletedAt: null, createdAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.recruitmentCandidate.findMany({
        where: { tenantId, deletedAt: null, createdAt: { gte: range.from, lte: range.to } },
      }),
    ]);

    const sourceMap = new Map<string, number>();
    for (const candidate of candidates) {
      const source = candidate.source ?? 'Unspecified';
      sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1);
    }

    return {
      generatedAt: new Date(),
      range,
      metrics: {
        requisitionsOpened: requisitions.filter((row) => row.status === RecruitmentRequisitionStatus.OPEN).length,
        applications: applications.length,
        interviews: interviews.length,
        offers: offers.length,
        hires: applications.filter((row) => row.status === RecruitmentApplicationStatus.HIRED).length,
        rejectedApplications: applications.filter((row) => row.status === RecruitmentApplicationStatus.REJECTED).length,
      },
      sourceBreakdown: Array.from(sourceMap.entries()).map(([source, count]) => ({ source, count })),
      requisitions,
      applications,
      interviews,
      offers,
    };
  }

  private approvalRuleCreateData(tenantId: string, dto: CreateRecruitmentApprovalRuleDto): Prisma.RecruitmentApprovalRuleCreateInput {
    return {
      tenant: { connect: { id: tenantId } },
      workflow: dto.workflowId ? { connect: { id: dto.workflowId } } : undefined,
      code: this.normalizeCode(dto.code),
      name: dto.name.trim(),
      status: dto.status ?? RecruitmentControlStatus.ACTIVE,
      priority: dto.priority ?? 100,
      organizationNodeId: dto.organizationNodeId,
      costCenterId: dto.costCenterId,
      positionId: dto.positionId,
      employmentType: dto.employmentType,
      minHeadcount: dto.minHeadcount,
      maxHeadcount: dto.maxHeadcount,
      minSalaryCents: dto.minSalaryCents,
      maxSalaryCents: dto.maxSalaryCents,
      workflowCode: dto.workflowCode ? this.normalizeCode(dto.workflowCode) : undefined,
      triggerKey: dto.triggerKey ?? 'recruitment.requisition.submitted',
      metadata: this.toJson(dto.metadata),
    };
  }

  private approvalRuleUpdateData(dto: UpdateRecruitmentApprovalRuleDto): Prisma.RecruitmentApprovalRuleUpdateInput {
    return {
      workflow: dto.workflowId ? { connect: { id: dto.workflowId } } : undefined,
      code: dto.code ? this.normalizeCode(dto.code) : undefined,
      name: dto.name?.trim(),
      status: dto.status,
      priority: dto.priority,
      organizationNodeId: dto.organizationNodeId,
      costCenterId: dto.costCenterId,
      positionId: dto.positionId,
      employmentType: dto.employmentType,
      minHeadcount: dto.minHeadcount,
      maxHeadcount: dto.maxHeadcount,
      minSalaryCents: dto.minSalaryCents,
      maxSalaryCents: dto.maxSalaryCents,
      workflowCode: dto.workflowCode ? this.normalizeCode(dto.workflowCode) : undefined,
      triggerKey: dto.triggerKey,
      metadata: this.toJson(dto.metadata),
    };
  }

  private requisitionApprovalSubmission(
    requisition: RecruitmentRequisition,
    route: ApprovalRoute | null,
    dto: DecideRecruitmentDto,
  ): SubmitApprovalRequestDto {
    return {
      workflowId: route?.workflowId,
      workflowCode: route?.workflowCode,
      triggerKey: route?.triggerKey ?? 'recruitment.requisition.submitted',
      module: 'recruitment',
      entityType: 'RecruitmentRequisition',
      entityId: requisition.id,
      title: `Requisition ${requisition.code}`,
      description: dto.comment ?? requisition.description ?? requisition.title,
      payload: this.requisitionState(requisition),
      metadata: {
        source: 'recruitment.requisition',
        approvalRoute: route,
        ...dto.metadata,
      },
      allowAutoApprovalWithoutWorkflow: true,
    };
  }

  private offerApprovalSubmission(
    offer: RecruitmentOffer & { application: { requisition: RecruitmentRequisition } },
    route: ApprovalRoute | null,
    dto: DecideRecruitmentDto,
  ): SubmitApprovalRequestDto {
    return {
      workflowId: route?.workflowId,
      workflowCode: route?.workflowCode,
      triggerKey: route?.triggerKey ?? 'recruitment.offer.submitted',
      module: 'recruitment',
      entityType: 'RecruitmentOffer',
      entityId: offer.id,
      title: `Offer for ${offer.application.requisition.title}`,
      description: dto.comment ?? offer.decisionNote ?? 'Offer approval requested.',
      payload: this.offerState(offer),
      metadata: {
        source: 'recruitment.offer',
        approvalRoute: route,
        ...dto.metadata,
      },
      allowAutoApprovalWithoutWorkflow: true,
    };
  }

  private approvalAction(dto: DecideRecruitmentDto): ApprovalActionDto {
    return { comment: dto.comment, metadata: dto.metadata };
  }

  private async resolveApprovalRoute(
    tenantId: string,
    requisition: Pick<RecruitmentRequisition, 'positionId' | 'employmentType' | 'headcount' | 'salaryMaxCents'>,
    triggerKey: string,
  ): Promise<ApprovalRoute | null> {
    const rules = await this.prisma.recruitmentApprovalRule.findMany({
      where: {
        tenantId,
        status: RecruitmentControlStatus.ACTIVE,
        deletedAt: null,
        triggerKey,
        AND: [
          { OR: [{ positionId: requisition.positionId ?? undefined }, { positionId: null }] },
          { OR: [{ employmentType: requisition.employmentType }, { employmentType: null }] },
          { OR: [{ minHeadcount: null }, { minHeadcount: { lte: requisition.headcount } }] },
          { OR: [{ maxHeadcount: null }, { maxHeadcount: { gte: requisition.headcount } }] },
          { OR: [{ minSalaryCents: null }, { minSalaryCents: { lte: requisition.salaryMaxCents ?? 0 } }] },
          { OR: [{ maxSalaryCents: null }, { maxSalaryCents: { gte: requisition.salaryMaxCents ?? 0 } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      include: { workflow: true },
    });

    const rule = rules[0];
    if (rule?.workflowId) return { workflowId: rule.workflowId, triggerKey: rule.triggerKey, source: `rule:${rule.code}` };
    if (rule?.workflowCode) return { workflowCode: rule.workflowCode, triggerKey: rule.triggerKey, source: `rule:${rule.code}` };

    const workflow = await this.prisma.workflow.findFirst({
      where: { tenantId, module: 'recruitment', triggerKey, status: WorkflowStatus.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    return workflow ? { workflowId: workflow.id, triggerKey, source: 'module-default' } : null;
  }

  private async validateRequisitionReferences(tenantId: string, dto: Partial<CreateRequisitionDto>) {
    await Promise.all([
      dto.positionId
        ? this.prisma.position.findFirst({ where: { id: dto.positionId, tenantId, deletedAt: null } }).then((row) => {
            if (!row) throw new BadRequestException('Position reference is invalid for this tenant.');
          })
        : Promise.resolve(),
      dto.hiringManagerId ? this.findEmployeeReference(tenantId, dto.hiringManagerId, 'Hiring manager') : Promise.resolve(),
      dto.recruiterId ? this.findEmployeeReference(tenantId, dto.recruiterId, 'Recruiter') : Promise.resolve(),
    ]);
  }

  private async validateApprovalRuleReferences(tenantId: string, dto: Partial<CreateRecruitmentApprovalRuleDto>) {
    if (dto.workflowId) {
      const workflow = await this.prisma.workflow.findFirst({
        where: { id: dto.workflowId, tenantId, module: 'recruitment', deletedAt: null },
      });
      if (!workflow) throw new BadRequestException('Workflow reference is invalid for recruitment.');
    }

    if (dto.workflowCode) {
      const workflow = await this.prisma.workflow.findFirst({
        where: {
          tenantId,
          code: this.normalizeCode(dto.workflowCode),
          module: 'recruitment',
          status: WorkflowStatus.ACTIVE,
          deletedAt: null,
        },
      });
      if (!workflow) throw new BadRequestException('Workflow code must reference an active recruitment workflow.');
    }
  }

  private async findEmployeeReference(tenantId: string, employeeId: string, label: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId, deletedAt: null } });
    if (!employee) throw new BadRequestException(`${label} reference is invalid for this tenant.`);
  }

  private async findRequisitionOrThrow(tenantId: string, requisitionId: string) {
    const requisition = await this.prisma.recruitmentRequisition.findFirst({
      where: { id: requisitionId, tenantId, deletedAt: null },
      include: this.requisitionInclude,
    });
    if (!requisition) throw new NotFoundException('Recruitment requisition not found.');
    return requisition;
  }

  private async findCandidateOrThrow(tenantId: string, candidateId: string) {
    const candidate = await this.prisma.recruitmentCandidate.findFirst({
      where: { id: candidateId, tenantId, deletedAt: null },
    });
    if (!candidate) throw new NotFoundException('Recruitment candidate not found.');
    return candidate;
  }

  private async findApplicationOrThrow(tenantId: string, applicationId: string) {
    const application = await this.prisma.recruitmentApplication.findFirst({
      where: { id: applicationId, tenantId, deletedAt: null },
      include: this.applicationInclude,
    });
    if (!application) throw new NotFoundException('Recruitment application not found.');
    return application;
  }

  private async findOfferOrThrow(tenantId: string, offerId: string) {
    const offer = await this.prisma.recruitmentOffer.findFirst({
      where: { id: offerId, tenantId, deletedAt: null },
      include: this.offerInclude,
    });
    if (!offer) throw new NotFoundException('Recruitment offer not found.');
    return offer;
  }

  private async writeRecruitmentApprovalEffects(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    entityType: string,
    entityId: string,
    title: string,
    state: Prisma.InputJsonObject,
  ) {
    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.APPROVE, entityType, entityId, null, state),
      this.writeTimeline(this.prisma, actor, tenantId, TimelineEventType.RECRUITMENT_REQUISITION_APPROVED, 'Recruitment requisition approved', title, entityType, entityId, {
        entityId,
        entityType,
      }),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.requisition.approved', entityType, entityId, state),
    ]);
  }

  private async writeOfferApprovalEffects(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    offer: RecruitmentOffer & { application: { requisition: RecruitmentRequisition } },
  ) {
    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.APPROVE, 'RecruitmentOffer', offer.id, null, this.offerState(offer)),
      this.writeTimeline(this.prisma, actor, tenantId, TimelineEventType.RECRUITMENT_OFFER_APPROVED, 'Recruitment offer approved', offer.application.requisition.title, 'RecruitmentOffer', offer.id, {
        offerId: offer.id,
        applicationId: offer.applicationId,
      }),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.offer.approved', 'RecruitmentOffer', offer.id, this.offerState(offer)),
    ]);
  }

  private applicationStatusForStage(stageType?: RecruitmentStageType | null) {
    switch (stageType) {
      case RecruitmentStageType.APPLIED:
        return RecruitmentApplicationStatus.APPLIED;
      case RecruitmentStageType.SCREENING:
        return RecruitmentApplicationStatus.SCREENING;
      case RecruitmentStageType.INTERVIEW:
        return RecruitmentApplicationStatus.INTERVIEW;
      case RecruitmentStageType.OFFER:
        return RecruitmentApplicationStatus.OFFER;
      case RecruitmentStageType.HIRED:
        return RecruitmentApplicationStatus.HIRED;
      case RecruitmentStageType.REJECTED:
        return RecruitmentApplicationStatus.REJECTED;
      case RecruitmentStageType.WITHDRAWN:
        return RecruitmentApplicationStatus.WITHDRAWN;
      default:
        return null;
    }
  }

  private queryRange(query: ListRecruitmentQueryDto, fallbackDays: number) {
    const now = new Date();
    const from = query.from ? this.startOfDay(this.toDate(query.from)) : this.addDays(this.startOfDay(now), -fallbackDays);
    const to = query.to ? this.endOfDay(this.toDate(query.to)) : this.endOfDay(this.addDays(now, fallbackDays));
    return { from, to };
  }

  private paginate<T extends { id: string }>(rows: T[], limit: number) {
    const hasNextPage = rows.length > limit;
    const data = hasNextPage ? rows.slice(0, limit) : rows;
    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? data[data.length - 1]?.id ?? null : null,
      },
    };
  }

  private enumValue<T extends Record<string, string>>(source: T, value?: string): T[keyof T] | undefined {
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    return Object.values(source).includes(normalized) ? (normalized as T[keyof T]) : undefined;
  }

  private normalizeCode(value: string) {
    return value.trim().toUpperCase().replace(/\s+/g, '_');
  }

  private toDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date value.');
    }
    return date;
  }

  private startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private endOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private requireTenant(actor: AuthenticatedPrincipal) {
    if (!actor.tenantId) throw new BadRequestException('A tenant context is required.');
    return actor.tenantId;
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private mergeJsonObject(current: Prisma.JsonValue | null | undefined, patch: Record<string, unknown>) {
    const base = current && typeof current === 'object' && !Array.isArray(current) ? current as Record<string, unknown> : {};
    return this.toJson({ ...base, ...patch });
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
        module: 'recruitment',
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
    type: TimelineEventType,
    title: string,
    description: string | undefined,
    entityType: string,
    entityId: string,
    data: Record<string, unknown>,
  ) {
    await client.timelineEvent.create({
      data: {
        tenantId,
        actorUserId: actor.id,
        type,
        title,
        description,
        entityType,
        entityId,
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

  private requisitionState(row: Pick<RecruitmentRequisition, 'id' | 'code' | 'title' | 'status' | 'headcount' | 'employmentType' | 'workMode' | 'positionId' | 'hiringManagerId' | 'recruiterId' | 'approvalRequestId'>): Prisma.InputJsonObject {
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      status: row.status,
      headcount: row.headcount,
      employmentType: row.employmentType,
      workMode: row.workMode,
      positionId: row.positionId,
      hiringManagerId: row.hiringManagerId,
      recruiterId: row.recruiterId,
      approvalRequestId: row.approvalRequestId,
    };
  }

  private candidateState(row: { id: string; firstName: string; lastName: string; email: string; status: RecruitmentCandidateStatus; source: string | null }): Prisma.InputJsonObject {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      status: row.status,
      source: row.source,
    };
  }

  private applicationState(row: Pick<RecruitmentApplication, 'id' | 'candidateId' | 'requisitionId' | 'currentStageId' | 'status' | 'score'>): Prisma.InputJsonObject {
    return {
      id: row.id,
      candidateId: row.candidateId,
      requisitionId: row.requisitionId,
      currentStageId: row.currentStageId,
      status: row.status,
      score: row.score,
    };
  }

  private interviewState(row: { id: string; applicationId: string; stageId: string | null; status: RecruitmentInterviewStatus; scheduledStartAt: Date; scheduledEndAt: Date }): Prisma.InputJsonObject {
    return {
      id: row.id,
      applicationId: row.applicationId,
      stageId: row.stageId,
      status: row.status,
      scheduledStartAt: row.scheduledStartAt.toISOString(),
      scheduledEndAt: row.scheduledEndAt.toISOString(),
    };
  }

  private feedbackState(row: { id: string; interviewId: string; applicationId: string; reviewerUserId: string | null; recommendation: RecruitmentFeedbackRecommendation; rating: number | null }): Prisma.InputJsonObject {
    return {
      id: row.id,
      interviewId: row.interviewId,
      applicationId: row.applicationId,
      reviewerUserId: row.reviewerUserId,
      recommendation: row.recommendation,
      rating: row.rating,
    };
  }

  private offerState(row: Pick<RecruitmentOffer, 'id' | 'applicationId' | 'approvalRequestId' | 'status' | 'basePayCents' | 'currencyCode' | 'startDate' | 'expiresAt'>): Prisma.InputJsonObject {
    return {
      id: row.id,
      applicationId: row.applicationId,
      approvalRequestId: row.approvalRequestId,
      status: row.status,
      basePayCents: row.basePayCents,
      currencyCode: row.currencyCode,
      startDate: row.startDate?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    };
  }

  private approvalRuleState(row: { id: string; code: string; name: string; status: RecruitmentControlStatus; workflowId: string | null; workflowCode: string | null; triggerKey: string }): Prisma.InputJsonObject {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      workflowId: row.workflowId,
      workflowCode: row.workflowCode,
      triggerKey: row.triggerKey,
    };
  }

  private readonly approvalRequestInclude = {
    workflow: { select: { id: true, code: true, name: true, module: true, status: true, triggerKey: true } },
    steps: {
      orderBy: [{ stepOrder: 'asc' as const }],
      include: {
        assignedUser: { select: { id: true, email: true, username: true } },
        assignedRole: { select: { id: true, code: true, name: true } },
      },
    },
  } satisfies Prisma.ApprovalRequestInclude;

  private readonly requisitionInclude = {
    position: true,
    hiringManager: { include: { person: true } },
    recruiter: { include: { person: true } },
    approvalRequest: { include: this.approvalRequestInclude },
    stages: { orderBy: [{ sequence: 'asc' as const }] },
    _count: { select: { applications: true } },
  } satisfies Prisma.RecruitmentRequisitionInclude;

  private readonly applicationInclude = {
    candidate: true,
    requisition: { include: { position: true, hiringManager: { include: { person: true } }, recruiter: { include: { person: true } }, stages: { orderBy: [{ sequence: 'asc' as const }] } } },
    currentStage: true,
    interviews: { orderBy: [{ scheduledStartAt: 'desc' as const }], take: 3 },
    offers: { orderBy: [{ createdAt: 'desc' as const }], take: 3 },
  } satisfies Prisma.RecruitmentApplicationInclude;

  private readonly interviewInclude = {
    application: { include: { candidate: true, requisition: true, currentStage: true } },
    stage: true,
    feedback: { include: { reviewer: { select: { id: true, email: true, username: true } } } },
  } satisfies Prisma.RecruitmentInterviewInclude;

  private readonly offerInclude = {
    application: { include: { candidate: true, requisition: true, currentStage: true } },
    approvalRequest: { include: this.approvalRequestInclude },
  } satisfies Prisma.RecruitmentOfferInclude;
}
