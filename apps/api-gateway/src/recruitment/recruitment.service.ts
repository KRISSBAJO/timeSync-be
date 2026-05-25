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
  RecruitmentPostingStatus,
  RecruitmentRequisitionStatus,
  RecruitmentStageType,
  RecruitmentTalentProfileStatus,
  TenantFeatureStatus,
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
  PublicCareerQueryDto,
  PublicHiringMarketplaceQueryDto,
  PublicJobApplicationDto,
  PublicTalentProfileDto,
  PublishRecruitmentPostingDto,
  ScheduleInterviewDto,
  SubmitInterviewFeedbackDto,
  UpdateCandidateDto,
  UpdateOfferDto,
  UpdateRecruitmentPostingDto,
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
  { name: 'Withdrawn', type: RecruitmentStageType.WITHDRAWN, sequence: 70, isTerminal: true },
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

  async getRequisitionDetail(actor: AuthenticatedPrincipal, requisitionId: string) {
    const tenantId = this.requireTenant(actor);
    const record = await this.prisma.recruitmentRequisition.findFirst({
      where: { id: requisitionId, tenantId, deletedAt: null },
      include: this.requisitionDetailInclude,
    });
    if (!record) throw new NotFoundException('Recruitment requisition not found.');

    return {
      record,
      ...(await this.recordHistory(tenantId, [
        { entityType: 'RecruitmentRequisition', entityId: record.id },
        ...record.applications.map((application) => ({ entityType: 'RecruitmentApplication', entityId: application.id })),
      ])),
    };
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

  async listJobPostings(actor: AuthenticatedPrincipal, query: ListRecruitmentQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;
    const status = this.enumValue(RecruitmentPostingStatus, query.status);
    const rows = await this.prisma.recruitmentJobPosting.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status,
        requisitionId: query.requisitionId,
        OR: query.search
          ? [
              { slug: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              { summary: { contains: query.search, mode: 'insensitive' } },
              { departmentName: { contains: query.search, mode: 'insensitive' } },
              { locationName: { contains: query.search, mode: 'insensitive' } },
              { requisition: { code: { contains: query.search, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      include: this.jobPostingInclude,
    });

    return this.paginate(rows, limit);
  }

  async publishRequisition(actor: AuthenticatedPrincipal, requisitionId: string, dto: PublishRecruitmentPostingDto) {
    const tenantId = this.requireTenant(actor);
    const requisition = await this.findRequisitionOrThrow(tenantId, requisitionId);

    if (requisition.status !== RecruitmentRequisitionStatus.OPEN) {
      throw new BadRequestException('Only open requisitions can be published to the public careers board.');
    }

    const existing = await this.prisma.recruitmentJobPosting.findUnique({
      where: { requisitionId: requisition.id },
    });
    const slug = await this.resolveUniquePostingSlug(
      tenantId,
      dto.slug ?? `${requisition.title}-${requisition.code}`,
      existing?.id,
    );
    const status = dto.status ?? RecruitmentPostingStatus.PUBLISHED;
    const now = new Date();
    const posting = await this.prisma.recruitmentJobPosting.upsert({
      where: { requisitionId: requisition.id },
      create: {
        tenant: { connect: { id: tenantId } },
        requisition: { connect: { id: requisition.id } },
        slug,
        title: dto.title?.trim() || requisition.title,
        summary: dto.summary?.trim() ?? this.defaultPostingSummary(requisition),
        description: dto.description?.trim() ?? requisition.description,
        requirements: dto.requirements?.trim() ?? requisition.requirements,
        departmentName: requisition.departmentName,
        locationName: requisition.locationName,
        employmentType: requisition.employmentType,
        workMode: requisition.workMode,
        salaryMinCents: requisition.salaryMinCents,
        salaryMaxCents: requisition.salaryMaxCents,
        currencyCode: requisition.currencyCode,
        status,
        internalOnly: dto.internalOnly ?? false,
        publishedAt: status === RecruitmentPostingStatus.PUBLISHED ? now : undefined,
        expiresAt: dto.expiresAt ? this.toDate(dto.expiresAt) : undefined,
        applyBy: dto.applyBy ? this.toDate(dto.applyBy) : undefined,
        questionSet: this.toJson(dto.questionSet),
        consentText: dto.consentText?.trim() ?? this.defaultConsentText(),
        sourceLabel: dto.sourceLabel?.trim() ?? 'Public careers site',
        metadata: this.toJson(dto.metadata),
      },
      update: {
        slug,
        title: dto.title?.trim() || requisition.title,
        summary: dto.summary?.trim() ?? this.defaultPostingSummary(requisition),
        description: dto.description?.trim() ?? requisition.description,
        requirements: dto.requirements?.trim() ?? requisition.requirements,
        departmentName: requisition.departmentName,
        locationName: requisition.locationName,
        employmentType: requisition.employmentType,
        workMode: requisition.workMode,
        salaryMinCents: requisition.salaryMinCents,
        salaryMaxCents: requisition.salaryMaxCents,
        currencyCode: requisition.currencyCode,
        status,
        internalOnly: dto.internalOnly ?? existing?.internalOnly ?? false,
        publishedAt: status === RecruitmentPostingStatus.PUBLISHED ? existing?.publishedAt ?? now : existing?.publishedAt,
        expiresAt: dto.expiresAt ? this.toDate(dto.expiresAt) : null,
        applyBy: dto.applyBy ? this.toDate(dto.applyBy) : null,
        questionSet: this.toJson(dto.questionSet),
        consentText: dto.consentText?.trim() ?? existing?.consentText ?? this.defaultConsentText(),
        sourceLabel: dto.sourceLabel?.trim() ?? existing?.sourceLabel ?? 'Public careers site',
        metadata: this.mergeJsonObject(existing?.metadata, dto.metadata ?? {}),
        deletedAt: null,
      },
      include: this.jobPostingInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, existing ? AuditAction.UPDATE : AuditAction.CREATE, 'RecruitmentJobPosting', posting.id, existing ? this.postingState(existing) : null, this.postingState(posting)),
      this.writeTimeline(this.prisma, actor, tenantId, TimelineEventType.SYSTEM, 'Recruitment posting published', posting.title, 'RecruitmentJobPosting', posting.id, {
        postingId: posting.id,
        requisitionId: requisition.id,
        slug: posting.slug,
        status: posting.status,
      }),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.posting.published', 'RecruitmentJobPosting', posting.id, this.postingState(posting)),
    ]);

    return posting;
  }

  async updateJobPosting(actor: AuthenticatedPrincipal, postingId: string, dto: UpdateRecruitmentPostingDto) {
    const tenantId = this.requireTenant(actor);
    const before = await this.prisma.recruitmentJobPosting.findFirst({
      where: { id: postingId, tenantId, deletedAt: null },
    });
    if (!before) throw new NotFoundException('Recruitment job posting not found.');

    const slug = dto.slug ? await this.resolveUniquePostingSlug(tenantId, dto.slug, before.id) : before.slug;
    const updated = await this.prisma.recruitmentJobPosting.update({
      where: { id: before.id },
      data: {
        slug,
        title: dto.title?.trim(),
        summary: dto.summary?.trim(),
        description: dto.description?.trim(),
        requirements: dto.requirements?.trim(),
        status: dto.status,
        internalOnly: dto.internalOnly,
        publishedAt: dto.status === RecruitmentPostingStatus.PUBLISHED && !before.publishedAt ? new Date() : undefined,
        expiresAt: dto.expiresAt ? this.toDate(dto.expiresAt) : undefined,
        applyBy: dto.applyBy ? this.toDate(dto.applyBy) : undefined,
        questionSet: this.toJson(dto.questionSet),
        consentText: dto.consentText?.trim(),
        sourceLabel: dto.sourceLabel?.trim(),
        metadata: dto.metadata === undefined ? undefined : this.mergeJsonObject(before.metadata, dto.metadata),
      },
      include: this.jobPostingInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.UPDATE, 'RecruitmentJobPosting', updated.id, this.postingState(before), this.postingState(updated)),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.posting.updated', 'RecruitmentJobPosting', updated.id, this.postingState(updated)),
    ]);
    return updated;
  }

  async unpublishRequisition(actor: AuthenticatedPrincipal, requisitionId: string) {
    const tenantId = this.requireTenant(actor);
    const posting = await this.prisma.recruitmentJobPosting.findFirst({
      where: { tenantId, requisitionId, deletedAt: null },
    });
    if (!posting) throw new NotFoundException('Recruitment job posting not found.');

    const updated = await this.prisma.recruitmentJobPosting.update({
      where: { id: posting.id },
      data: { status: RecruitmentPostingStatus.PAUSED },
      include: this.jobPostingInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, AuditAction.DISABLE, 'RecruitmentJobPosting', updated.id, this.postingState(posting), this.postingState(updated)),
      this.writeTimeline(this.prisma, actor, tenantId, TimelineEventType.SYSTEM, 'Recruitment posting paused', updated.title, 'RecruitmentJobPosting', updated.id, {
        postingId: updated.id,
        requisitionId,
      }),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.posting.paused', 'RecruitmentJobPosting', updated.id, this.postingState(updated)),
    ]);
    return updated;
  }

  async getPublicCareersBoard(tenantSlug: string, query: PublicCareerQueryDto) {
    const tenant = await this.findPublicCareersTenant(tenantSlug);
    const limit = query.limit ?? 50;
    const now = new Date();
    const workMode = this.enumValue(RecruitmentWorkMode, query.workMode);
    const employmentType = this.enumValue(RecruitmentEmploymentType, query.employmentType);

    const where: Prisma.RecruitmentJobPostingWhereInput = {
      tenantId: tenant.id,
      status: RecruitmentPostingStatus.PUBLISHED,
      internalOnly: false,
      deletedAt: null,
      workMode,
      employmentType,
      OR: [
        { expiresAt: null },
        { expiresAt: { gte: now } },
      ],
      AND: [
        { OR: [{ applyBy: null }, { applyBy: { gte: now } }] },
        { requisition: { status: RecruitmentRequisitionStatus.OPEN, deletedAt: null } },
        ...(query.search
          ? [{
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { summary: { contains: query.search, mode: 'insensitive' as const } },
                { departmentName: { contains: query.search, mode: 'insensitive' as const } },
                { locationName: { contains: query.search, mode: 'insensitive' as const } },
                { requisition: { code: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            }]
          : []),
      ],
    };

    const [jobs, total] = await Promise.all([
      this.prisma.recruitmentJobPosting.findMany({
        where,
        take: limit,
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
        include: this.publicPostingInclude,
      }),
      this.prisma.recruitmentJobPosting.count({ where }),
    ]);

    return {
      tenant: this.publicTenantState(tenant),
      data: jobs.map((job) => this.publicJobSummary(job)),
      page: { limit, total },
    };
  }

  async getPublicJob(tenantSlug: string, jobSlug: string) {
    const tenant = await this.findPublicCareersTenant(tenantSlug);
    const posting = await this.findPublicPostingOrThrow(tenant.id, jobSlug);
    return {
      tenant: this.publicTenantState(tenant),
      job: this.publicJobDetail(posting),
    };
  }

  async applyToPublicJob(tenantSlug: string, jobSlug: string, dto: PublicJobApplicationDto) {
    if (!dto.consentAccepted) {
      throw new BadRequestException('Candidate consent is required before submitting an application.');
    }

    const tenant = await this.findPublicCareersTenant(tenantSlug);
    const posting = await this.findPublicPostingOrThrow(tenant.id, jobSlug);
    const now = new Date();

    if (posting.applyBy && posting.applyBy < now) {
      throw new BadRequestException('This job posting is no longer accepting applications.');
    }

    const email = dto.email.trim().toLowerCase();
    const candidateBefore = await this.prisma.recruitmentCandidate.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });
    const candidate = await this.prisma.recruitmentCandidate.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      create: {
        tenant: { connect: { id: tenant.id } },
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email,
        phone: dto.phone?.trim(),
        source: dto.source?.trim() || posting.sourceLabel || 'Public careers site',
        status: RecruitmentCandidateStatus.ACTIVE,
        currentEmployer: dto.currentEmployer?.trim(),
        currentTitle: dto.currentTitle?.trim(),
        locationName: dto.locationName?.trim(),
        resumeUrl: dto.resumeUrl,
        tags: ['public-applicant'],
        metadata: this.toJson({
          publicProfile: {
            consentAccepted: dto.consentAccepted,
            availabilityNote: dto.availabilityNote,
            lastAppliedAt: now.toISOString(),
          },
          ...dto.metadata,
        }),
      },
      update: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim(),
        source: dto.source?.trim() || posting.sourceLabel || 'Public careers site',
        currentEmployer: dto.currentEmployer?.trim(),
        currentTitle: dto.currentTitle?.trim(),
        locationName: dto.locationName?.trim(),
        resumeUrl: dto.resumeUrl,
        tags: { push: 'public-applicant' },
        metadata: this.mergeJsonObject(undefined, {
          publicProfile: {
            consentAccepted: dto.consentAccepted,
            availabilityNote: dto.availabilityNote,
            lastAppliedAt: now.toISOString(),
          },
          ...dto.metadata,
        }),
        deletedAt: null,
      },
    });

    const existingApplication = await this.prisma.recruitmentApplication.findFirst({
      where: {
        tenantId: tenant.id,
        candidateId: candidate.id,
        requisitionId: posting.requisitionId,
        deletedAt: null,
      },
      include: this.applicationInclude,
    });

    if (existingApplication) {
      return {
        received: true,
        alreadyApplied: true,
        application: this.publicApplicationReceipt(existingApplication),
        job: this.publicJobSummary(posting),
      };
    }

    const stage = await this.ensurePipelineStage(tenant.id, posting.requisitionId, RecruitmentStageType.APPLIED);
    const application = await this.prisma.recruitmentApplication.create({
      data: {
        tenant: { connect: { id: tenant.id } },
        candidate: { connect: { id: candidate.id } },
        requisition: { connect: { id: posting.requisitionId } },
        currentStage: { connect: { id: stage.id } },
        status: RecruitmentApplicationStatus.APPLIED,
        source: dto.source?.trim() || posting.sourceLabel || 'Public careers site',
        appliedAt: now,
        lastActivityAt: now,
        metadata: this.toJson({
          source: 'public_careers',
          postingId: posting.id,
          postingSlug: posting.slug,
          tenantSlug,
          availabilityNote: dto.availabilityNote,
          consentAccepted: dto.consentAccepted,
          answers: dto.answers ?? {},
          ...dto.metadata,
        }),
      },
      include: this.applicationInclude,
    });

    await Promise.all([
      this.writeAudit(
        this.prisma,
        null,
        tenant.id,
        candidateBefore ? AuditAction.UPDATE : AuditAction.CREATE,
        'RecruitmentCandidate',
        candidate.id,
        candidateBefore ? this.candidateState(candidateBefore) : null,
        this.candidateState(candidate),
      ),
      this.writeAudit(this.prisma, null, tenant.id, AuditAction.CREATE, 'RecruitmentApplication', application.id, null, this.applicationState(application)),
      this.writeTimeline(this.prisma, null, tenant.id, TimelineEventType.RECRUITMENT_CANDIDATE_APPLIED, 'Candidate applied from careers site', `${candidate.firstName} ${candidate.lastName} applied to ${posting.title}`, 'RecruitmentApplication', application.id, {
        applicationId: application.id,
        candidateId: candidate.id,
        requisitionId: posting.requisitionId,
        postingId: posting.id,
        source: application.source,
      }),
      this.enqueueOutbox(this.prisma, tenant.id, 'recruitment.public_application.received', 'RecruitmentApplication', application.id, this.applicationState(application)),
    ]);

    return {
      received: true,
      alreadyApplied: false,
      application: this.publicApplicationReceipt(application),
      job: this.publicJobSummary(posting),
    };
  }

  async getPublicHiringMarketplace(query: PublicHiringMarketplaceQueryDto) {
    const limit = query.limit ?? 50;
    const now = new Date();
    const workMode = this.enumValue(RecruitmentWorkMode, query.workMode);
    const employmentType = this.enumValue(RecruitmentEmploymentType, query.employmentType);

    const where: Prisma.RecruitmentJobPostingWhereInput = {
      status: RecruitmentPostingStatus.PUBLISHED,
      internalOnly: false,
      deletedAt: null,
      workMode,
      employmentType,
      locationName: query.location ? { contains: query.location, mode: 'insensitive' } : undefined,
      departmentName: query.department ? { contains: query.department, mode: 'insensitive' } : undefined,
      tenant: {
        slug: query.tenantSlug,
        deletedAt: null,
        features: {
          some: {
            status: { in: [TenantFeatureStatus.ENABLED, TenantFeatureStatus.BETA, TenantFeatureStatus.TRIAL] },
            platformFeature: { code: 'RECRUITMENT', isActive: true },
          },
        },
      },
      OR: [
        { expiresAt: null },
        { expiresAt: { gte: now } },
      ],
      AND: [
        { OR: [{ applyBy: null }, { applyBy: { gte: now } }] },
        { requisition: { status: RecruitmentRequisitionStatus.OPEN, deletedAt: null } },
        ...(query.search
          ? [{
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { summary: { contains: query.search, mode: 'insensitive' as const } },
                { departmentName: { contains: query.search, mode: 'insensitive' as const } },
                { locationName: { contains: query.search, mode: 'insensitive' as const } },
                { sourceLabel: { contains: query.search, mode: 'insensitive' as const } },
                { tenant: { name: { contains: query.search, mode: 'insensitive' as const } } },
                { requisition: { code: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            }]
          : []),
      ],
    };

    const [jobs, total, companyCount, latestProfiles] = await Promise.all([
      this.prisma.recruitmentJobPosting.findMany({
        where,
        take: limit,
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
        include: this.marketplacePostingInclude,
      }),
      this.prisma.recruitmentJobPosting.count({ where }),
      this.prisma.recruitmentJobPosting.findMany({
        where: {
          status: RecruitmentPostingStatus.PUBLISHED,
          internalOnly: false,
          deletedAt: null,
          tenant: {
            deletedAt: null,
            features: {
              some: {
                status: { in: [TenantFeatureStatus.ENABLED, TenantFeatureStatus.BETA, TenantFeatureStatus.TRIAL] },
                platformFeature: { code: 'RECRUITMENT', isActive: true },
              },
            },
          },
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
          AND: [
            { OR: [{ applyBy: null }, { applyBy: { gte: now } }] },
            { requisition: { status: RecruitmentRequisitionStatus.OPEN, deletedAt: null } },
          ],
        },
        distinct: ['tenantId'],
        select: { tenantId: true },
      }),
      this.prisma.recruitmentTalentProfile.findMany({
        where: { status: RecruitmentTalentProfileStatus.ACTIVE, deletedAt: null },
        orderBy: [{ updatedAt: 'desc' }],
        take: 6,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          desiredTitle: true,
          locationName: true,
          skills: true,
          workModes: true,
          employmentTypes: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      generatedAt: new Date(),
      metrics: {
        openJobs: total,
        companies: companyCount.length,
        talentProfiles: await this.prisma.recruitmentTalentProfile.count({
          where: { status: RecruitmentTalentProfileStatus.ACTIVE, deletedAt: null },
        }),
      },
      data: jobs.map((job) => this.publicMarketplaceJobSummary(job)),
      talentProfiles: latestProfiles.map((profile) => ({
        ...profile,
        displayName: `${profile.firstName} ${profile.lastName.slice(0, 1)}.`,
      })),
      page: { limit, total },
    };
  }

  async submitPublicTalentProfile(dto: PublicTalentProfileDto) {
    if (!dto.consentAccepted) {
      throw new BadRequestException('Candidate consent is required before publishing a talent profile.');
    }

    const email = dto.email.trim().toLowerCase();
    const tenant = dto.preferredTenantSlug
      ? await this.prisma.tenant.findFirst({
          where: {
            slug: dto.preferredTenantSlug.trim().toLowerCase(),
            deletedAt: null,
            features: {
              some: {
                status: { in: [TenantFeatureStatus.ENABLED, TenantFeatureStatus.BETA, TenantFeatureStatus.TRIAL] },
                platformFeature: { code: 'RECRUITMENT', isActive: true },
              },
            },
          },
          select: { id: true, slug: true, name: true },
        })
      : null;

    const before = await this.prisma.recruitmentTalentProfile.findUnique({ where: { email } });
    const profile = await this.prisma.recruitmentTalentProfile.upsert({
      where: { email },
      create: {
        tenantId: tenant?.id,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email,
        phone: dto.phone?.trim(),
        desiredTitle: dto.desiredTitle?.trim(),
        currentTitle: dto.currentTitle?.trim(),
        currentEmployer: dto.currentEmployer?.trim(),
        locationName: dto.locationName?.trim(),
        workModes: dto.workModes ?? [],
        employmentTypes: dto.employmentTypes ?? [],
        skills: this.cleanStringList(dto.skills),
        resumeUrl: dto.resumeUrl,
        portfolioUrl: dto.portfolioUrl,
        availabilityNote: dto.availabilityNote?.trim(),
        source: dto.source?.trim() ?? 'Public hiring marketplace',
        status: dto.status ?? RecruitmentTalentProfileStatus.ACTIVE,
        consentAccepted: dto.consentAccepted,
        metadata: this.toJson({
          preferredTenant: tenant,
          source: 'public_hiring_marketplace',
          ...dto.metadata,
        }),
      },
      update: {
        tenantId: tenant?.id,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim(),
        desiredTitle: dto.desiredTitle?.trim(),
        currentTitle: dto.currentTitle?.trim(),
        currentEmployer: dto.currentEmployer?.trim(),
        locationName: dto.locationName?.trim(),
        workModes: dto.workModes ?? [],
        employmentTypes: dto.employmentTypes ?? [],
        skills: this.cleanStringList(dto.skills),
        resumeUrl: dto.resumeUrl,
        portfolioUrl: dto.portfolioUrl,
        availabilityNote: dto.availabilityNote?.trim(),
        source: dto.source?.trim() ?? before?.source ?? 'Public hiring marketplace',
        status: dto.status ?? RecruitmentTalentProfileStatus.ACTIVE,
        consentAccepted: dto.consentAccepted,
        metadata: this.mergeJsonObject(before?.metadata, {
          preferredTenant: tenant,
          source: 'public_hiring_marketplace',
          lastSubmittedAt: new Date().toISOString(),
          ...dto.metadata,
        }),
        deletedAt: null,
      },
    });

    await Promise.all([
      this.prisma.auditLog.create({
        data: {
          tenantId: tenant?.id,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          module: 'recruitment',
          entityType: 'RecruitmentTalentProfile',
          entityId: profile.id,
          before: before ? this.talentProfileState(before) : undefined,
          after: this.talentProfileState(profile),
          metadata: { source: 'public_hiring_marketplace' },
        },
      }),
      this.enqueueOutbox(this.prisma, tenant?.id ?? null, 'recruitment.public_talent_profile.submitted', 'RecruitmentTalentProfile', profile.id, this.talentProfileState(profile)),
    ]);

    return {
      received: true,
      profile: {
        id: profile.id,
        status: profile.status,
        displayName: `${profile.firstName} ${profile.lastName.slice(0, 1)}.`,
        desiredTitle: profile.desiredTitle,
        locationName: profile.locationName,
        skills: profile.skills,
        updatedAt: profile.updatedAt,
      },
    };
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

  async getCandidateDetail(actor: AuthenticatedPrincipal, candidateId: string) {
    const tenantId = this.requireTenant(actor);
    const record = await this.prisma.recruitmentCandidate.findFirst({
      where: { id: candidateId, tenantId, deletedAt: null },
      include: this.candidateDetailInclude,
    });
    if (!record) throw new NotFoundException('Recruitment candidate not found.');

    return {
      record,
      ...(await this.recordHistory(tenantId, [
        { entityType: 'RecruitmentCandidate', entityId: record.id },
        ...record.applications.map((application) => ({ entityType: 'RecruitmentApplication', entityId: application.id })),
      ])),
    };
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

  async getApplicationDetail(actor: AuthenticatedPrincipal, applicationId: string) {
    const tenantId = this.requireTenant(actor);
    const record = await this.prisma.recruitmentApplication.findFirst({
      where: { id: applicationId, tenantId, deletedAt: null },
      include: this.applicationDetailInclude,
    });
    if (!record) throw new NotFoundException('Recruitment application not found.');

    return {
      record,
      ...(await this.recordHistory(tenantId, [
        { entityType: 'RecruitmentApplication', entityId: record.id },
        ...record.interviews.map((interview) => ({ entityType: 'RecruitmentInterview', entityId: interview.id })),
        ...record.offers.map((offer) => ({ entityType: 'RecruitmentOffer', entityId: offer.id })),
      ])),
    };
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
    const stage = await this.resolveApplicationStage(tenantId, application.requisitionId, dto);
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
      status === RecruitmentApplicationStatus.HIRED
        ? this.prisma.recruitmentCandidate.update({
            where: { id: updated.candidateId },
            data: { status: RecruitmentCandidateStatus.HIRED },
          })
        : Promise.resolve(),
      this.writeTimeline(this.prisma, actor, tenantId, TimelineEventType.SYSTEM, 'Recruitment application moved', `${updated.candidate.firstName} ${updated.candidate.lastName} moved to ${stage.name}`, 'RecruitmentApplication', updated.id, {
        applicationId: updated.id,
        candidateId: updated.candidateId,
        requisitionId: updated.requisitionId,
        stageType: stage.type,
        status,
        decisionReason: dto.decisionReason,
      }),
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

  async getInterviewDetail(actor: AuthenticatedPrincipal, interviewId: string) {
    const tenantId = this.requireTenant(actor);
    const record = await this.prisma.recruitmentInterview.findFirst({
      where: { id: interviewId, tenantId, deletedAt: null },
      include: this.interviewDetailInclude,
    });
    if (!record) throw new NotFoundException('Interview not found.');

    return {
      record,
      ...(await this.recordHistory(tenantId, [
        { entityType: 'RecruitmentInterview', entityId: record.id },
        { entityType: 'RecruitmentApplication', entityId: record.applicationId },
      ])),
    };
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

  async getOfferDetail(actor: AuthenticatedPrincipal, offerId: string) {
    const tenantId = this.requireTenant(actor);
    const record = await this.prisma.recruitmentOffer.findFirst({
      where: { id: offerId, tenantId, deletedAt: null },
      include: this.offerDetailInclude,
    });
    if (!record) throw new NotFoundException('Recruitment offer not found.');

    return {
      record,
      ...(await this.recordHistory(tenantId, [
        { entityType: 'RecruitmentOffer', entityId: record.id },
        { entityType: 'RecruitmentApplication', entityId: record.applicationId },
      ])),
    };
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

  async extendOffer(actor: AuthenticatedPrincipal, offerId: string, dto: DecideRecruitmentDto) {
    const tenantId = this.requireTenant(actor);
    const offer = await this.findOfferOrThrow(tenantId, offerId);

    if (offer.status !== RecruitmentOfferStatus.APPROVED && offer.status !== RecruitmentOfferStatus.EXTENDED) {
      throw new BadRequestException('Only approved offers can be extended.');
    }

    return this.transitionOffer(actor, tenantId, offer, RecruitmentOfferStatus.EXTENDED, dto, {
      eventType: 'recruitment.offer.extended',
      auditAction: AuditAction.UPDATE,
      timelineTitle: 'Recruitment offer extended',
      data: { extendedAt: new Date() },
    });
  }

  async acceptOffer(actor: AuthenticatedPrincipal, offerId: string, dto: DecideRecruitmentDto) {
    const tenantId = this.requireTenant(actor);
    const offer = await this.findOfferOrThrow(tenantId, offerId);

    if (offer.status !== RecruitmentOfferStatus.EXTENDED && offer.status !== RecruitmentOfferStatus.APPROVED) {
      throw new BadRequestException('Only approved or extended offers can be accepted.');
    }

    const hiredStage = await this.ensurePipelineStage(tenantId, offer.application.requisitionId, RecruitmentStageType.HIRED);
    const updated = await this.transitionOffer(actor, tenantId, offer, RecruitmentOfferStatus.ACCEPTED, dto, {
      eventType: 'recruitment.offer.accepted',
      auditAction: AuditAction.APPROVE,
      timelineType: TimelineEventType.RECRUITMENT_OFFER_ACCEPTED,
      timelineTitle: 'Recruitment offer accepted',
      data: { acceptedAt: new Date() },
    });

    await Promise.all([
      this.prisma.recruitmentApplication.update({
        where: { id: offer.applicationId },
        data: {
          currentStageId: hiredStage.id,
          status: RecruitmentApplicationStatus.HIRED,
          hiredAt: new Date(),
          decisionReason: dto.comment?.trim(),
          lastActivityAt: new Date(),
        },
      }),
      this.prisma.recruitmentCandidate.update({
        where: { id: offer.application.candidateId },
        data: { status: RecruitmentCandidateStatus.HIRED },
      }),
      this.enqueueOutbox(this.prisma, tenantId, 'recruitment.application.hired', 'RecruitmentApplication', offer.applicationId, {
        applicationId: offer.applicationId,
        candidateId: offer.application.candidateId,
        offerId: offer.id,
      }),
    ]);

    return updated;
  }

  async declineOffer(actor: AuthenticatedPrincipal, offerId: string, dto: DecideRecruitmentDto) {
    const tenantId = this.requireTenant(actor);
    const offer = await this.findOfferOrThrow(tenantId, offerId);

    if (offer.status !== RecruitmentOfferStatus.EXTENDED && offer.status !== RecruitmentOfferStatus.APPROVED) {
      throw new BadRequestException('Only approved or extended offers can be declined.');
    }

    return this.transitionOffer(actor, tenantId, offer, RecruitmentOfferStatus.DECLINED, dto, {
      eventType: 'recruitment.offer.declined',
      auditAction: AuditAction.REJECT,
      timelineTitle: 'Recruitment offer declined',
      data: {},
    });
  }

  async withdrawOffer(actor: AuthenticatedPrincipal, offerId: string, dto: DecideRecruitmentDto) {
    const tenantId = this.requireTenant(actor);
    const offer = await this.findOfferOrThrow(tenantId, offerId);

    if (offer.status === RecruitmentOfferStatus.ACCEPTED || offer.status === RecruitmentOfferStatus.DECLINED) {
      throw new BadRequestException('Accepted or declined offers cannot be withdrawn.');
    }

    return this.transitionOffer(actor, tenantId, offer, RecruitmentOfferStatus.WITHDRAWN, dto, {
      eventType: 'recruitment.offer.withdrawn',
      auditAction: AuditAction.ARCHIVE,
      timelineTitle: 'Recruitment offer withdrawn',
      data: {},
    });
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

  private async findPublicCareersTenant(tenantSlug: string) {
    const normalizedSlug = tenantSlug.trim().toLowerCase();
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug: normalizedSlug,
        deletedAt: null,
        features: {
          some: {
            status: { in: [TenantFeatureStatus.ENABLED, TenantFeatureStatus.BETA, TenantFeatureStatus.TRIAL] },
            platformFeature: { code: 'RECRUITMENT', isActive: true },
          },
        },
      },
      include: { branding: true },
    });

    if (!tenant) {
      throw new NotFoundException('Public careers board not found.');
    }

    return tenant;
  }

  private async findPublicPostingOrThrow(tenantId: string, jobSlug: string) {
    const now = new Date();
    const posting = await this.prisma.recruitmentJobPosting.findFirst({
      where: {
        tenantId,
        slug: this.slugify(jobSlug),
        status: RecruitmentPostingStatus.PUBLISHED,
        internalOnly: false,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        AND: [
          { OR: [{ applyBy: null }, { applyBy: { gte: now } }] },
          { requisition: { status: RecruitmentRequisitionStatus.OPEN, deletedAt: null } },
        ],
      },
      include: this.publicPostingInclude,
    });

    if (!posting) {
      throw new NotFoundException('Public job posting not found.');
    }

    return posting;
  }

  private async resolveUniquePostingSlug(tenantId: string, value: string, currentPostingId?: string) {
    const base = this.slugify(value) || 'job';
    let candidate = base;
    let suffix = 2;

    while (await this.prisma.recruitmentJobPosting.findFirst({
      where: {
        tenantId,
        slug: candidate,
        id: currentPostingId ? { not: currentPostingId } : undefined,
      },
      select: { id: true },
    })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private publicTenantState(tenant: {
    id: string;
    name: string;
    slug: string;
    industry?: string | null;
    website?: string | null;
    supportEmail?: string | null;
    supportPhone?: string | null;
    branding?: {
      logoUrl?: string | null;
      primaryColor?: string | null;
      secondaryColor?: string | null;
      accentColor?: string | null;
    } | null;
  }) {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      industry: tenant.industry,
      website: tenant.website,
      supportEmail: tenant.supportEmail,
      supportPhone: tenant.supportPhone,
      branding: tenant.branding,
    };
  }

  private publicJobSummary(posting: {
    id: string;
    slug: string;
    title: string;
    summary?: string | null;
    departmentName?: string | null;
    locationName?: string | null;
    employmentType?: RecruitmentEmploymentType | null;
    workMode?: RecruitmentWorkMode | null;
    salaryMinCents?: number | null;
    salaryMaxCents?: number | null;
    currencyCode: string;
    publishedAt?: Date | null;
    applyBy?: Date | null;
    sourceLabel?: string | null;
    requisition: {
      id: string;
      code: string;
      headcount: number;
      _count?: { applications: number };
    };
  }) {
    return {
      id: posting.id,
      slug: posting.slug,
      title: posting.title,
      summary: posting.summary,
      departmentName: posting.departmentName,
      locationName: posting.locationName,
      employmentType: posting.employmentType,
      workMode: posting.workMode,
      salaryMinCents: posting.salaryMinCents,
      salaryMaxCents: posting.salaryMaxCents,
      currencyCode: posting.currencyCode,
      publishedAt: posting.publishedAt,
      applyBy: posting.applyBy,
      sourceLabel: posting.sourceLabel,
      requisition: {
        id: posting.requisition.id,
        code: posting.requisition.code,
        headcount: posting.requisition.headcount,
        applications: posting.requisition._count?.applications ?? 0,
      },
    };
  }

  private publicMarketplaceJobSummary(posting: {
    id: string;
    slug: string;
    title: string;
    summary?: string | null;
    departmentName?: string | null;
    locationName?: string | null;
    employmentType?: RecruitmentEmploymentType | null;
    workMode?: RecruitmentWorkMode | null;
    salaryMinCents?: number | null;
    salaryMaxCents?: number | null;
    currencyCode: string;
    publishedAt?: Date | null;
    applyBy?: Date | null;
    sourceLabel?: string | null;
    tenant: {
      id: string;
      name: string;
      slug: string;
      industry?: string | null;
      branding?: {
        logoUrl?: string | null;
        primaryColor?: string | null;
        secondaryColor?: string | null;
        accentColor?: string | null;
      } | null;
    };
    requisition: {
      id: string;
      code: string;
      headcount: number;
      _count?: { applications: number };
    };
  }) {
    return {
      ...this.publicJobSummary(posting),
      tenant: this.publicTenantState(posting.tenant),
      publicUrl: `/careers/${posting.tenant.slug}/jobs/${posting.slug}`,
    };
  }

  private publicJobDetail(posting: {
    id: string;
    slug: string;
    title: string;
    summary?: string | null;
    description?: string | null;
    requirements?: string | null;
    departmentName?: string | null;
    locationName?: string | null;
    employmentType?: RecruitmentEmploymentType | null;
    workMode?: RecruitmentWorkMode | null;
    salaryMinCents?: number | null;
    salaryMaxCents?: number | null;
    currencyCode: string;
    publishedAt?: Date | null;
    applyBy?: Date | null;
    sourceLabel?: string | null;
    questionSet?: Prisma.JsonValue | null;
    consentText?: string | null;
    requisition: {
      id: string;
      code: string;
      headcount: number;
      _count?: { applications: number };
    };
  }) {
    return {
      ...this.publicJobSummary(posting),
      description: posting.description,
      requirements: posting.requirements,
      questionSet: posting.questionSet,
      consentText: posting.consentText ?? this.defaultConsentText(),
    };
  }

  private publicApplicationReceipt(application: RecruitmentApplication & {
    candidate?: { firstName: string; lastName: string; email: string } | null;
    currentStage?: { name: string; type: RecruitmentStageType } | null;
  }) {
    return {
      id: application.id,
      status: application.status,
      appliedAt: application.appliedAt,
      currentStage: application.currentStage ? {
        name: application.currentStage.name,
        type: application.currentStage.type,
      } : null,
      candidate: application.candidate ? {
        firstName: application.candidate.firstName,
        lastName: application.candidate.lastName,
        email: application.candidate.email,
      } : null,
    };
  }

  private postingState(row: {
    id: string;
    requisitionId: string;
    slug: string;
    title: string;
    status: RecruitmentPostingStatus;
    internalOnly: boolean;
    publishedAt?: Date | null;
    expiresAt?: Date | null;
    applyBy?: Date | null;
  }): Prisma.InputJsonObject {
    return {
      id: row.id,
      requisitionId: row.requisitionId,
      slug: row.slug,
      title: row.title,
      status: row.status,
      internalOnly: row.internalOnly,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      applyBy: row.applyBy?.toISOString() ?? null,
    };
  }

  private talentProfileState(row: {
    id: string;
    tenantId?: string | null;
    firstName: string;
    lastName: string;
    email: string;
    desiredTitle?: string | null;
    locationName?: string | null;
    workModes: RecruitmentWorkMode[];
    employmentTypes: RecruitmentEmploymentType[];
    skills: string[];
    status: RecruitmentTalentProfileStatus;
    consentAccepted: boolean;
  }): Prisma.InputJsonObject {
    return {
      id: row.id,
      tenantId: row.tenantId ?? null,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      desiredTitle: row.desiredTitle ?? null,
      locationName: row.locationName ?? null,
      workModes: row.workModes,
      employmentTypes: row.employmentTypes,
      skills: row.skills,
      status: row.status,
      consentAccepted: row.consentAccepted,
    };
  }

  private defaultPostingSummary(requisition: Pick<RecruitmentRequisition, 'departmentName' | 'locationName' | 'employmentType' | 'workMode'>) {
    return [
      requisition.departmentName,
      requisition.locationName,
      this.humanizeText(requisition.employmentType),
      this.humanizeText(requisition.workMode),
    ].filter(Boolean).join(' · ');
  }

  private defaultConsentText() {
    return 'I certify that the information I provide is accurate and consent to TimeSync and this employer processing my application for recruitment purposes.';
  }

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 140);
  }

  private humanizeText(value: string) {
    return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private cleanStringList(value?: string[]) {
    return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean))).slice(0, 30);
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

  private async transitionOffer(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    offer: RecruitmentOffer & { application: { candidateId: string; requisitionId: string; requisition: RecruitmentRequisition } },
    status: RecruitmentOfferStatus,
    dto: DecideRecruitmentDto,
    options: {
      eventType: string;
      auditAction: AuditAction;
      timelineTitle: string;
      timelineType?: TimelineEventType;
      data: Prisma.RecruitmentOfferUpdateInput;
    },
  ) {
    const updated = await this.prisma.recruitmentOffer.update({
      where: { id: offer.id },
      data: {
        ...options.data,
        status,
        decidedById: status === RecruitmentOfferStatus.DECLINED || status === RecruitmentOfferStatus.WITHDRAWN ? actor.id : undefined,
        decidedAt: status === RecruitmentOfferStatus.DECLINED || status === RecruitmentOfferStatus.WITHDRAWN ? new Date() : undefined,
        decisionNote: dto.comment?.trim() ?? offer.decisionNote,
        metadata: this.mergeJsonObject(offer.metadata, { lastLifecycleComment: dto.comment, lastLifecycleStatus: status }),
      },
      include: this.offerInclude,
    });

    await Promise.all([
      this.writeAudit(this.prisma, actor, tenantId, options.auditAction, 'RecruitmentOffer', updated.id, this.offerState(offer), this.offerState(updated)),
      this.writeTimeline(
        this.prisma,
        actor,
        tenantId,
        options.timelineType ?? TimelineEventType.SYSTEM,
        options.timelineTitle,
        updated.application.requisition.title,
        'RecruitmentOffer',
        updated.id,
        {
          offerId: updated.id,
          applicationId: updated.applicationId,
          status,
          comment: dto.comment,
        },
      ),
      this.enqueueOutbox(this.prisma, tenantId, options.eventType, 'RecruitmentOffer', updated.id, this.offerState(updated)),
    ]);

    return updated;
  }

  private async resolveApplicationStage(tenantId: string, requisitionId: string, dto: MoveApplicationDto) {
    if (dto.stageId) {
      return this.prisma.recruitmentPipelineStage.findFirst({
        where: { id: dto.stageId, tenantId, requisitionId },
      });
    }

    if (dto.stageType) {
      return this.ensurePipelineStage(tenantId, requisitionId, dto.stageType);
    }

    throw new BadRequestException('A stageId or stageType is required to move an application.');
  }

  private async ensurePipelineStage(tenantId: string, requisitionId: string, stageType: RecruitmentStageType) {
    const existing = await this.prisma.recruitmentPipelineStage.findFirst({
      where: { tenantId, requisitionId, type: stageType },
      orderBy: [{ sequence: 'asc' }],
    });
    if (existing) return existing;

    const definition = DEFAULT_PIPELINE_STAGES.find((stage) => stage.type === stageType) ?? {
      name: this.humanizeStage(stageType),
      type: stageType,
      sequence: 90,
      isTerminal: false,
    };
    const sequenceTaken = await this.prisma.recruitmentPipelineStage.findFirst({
      where: { tenantId, requisitionId, sequence: definition.sequence },
      select: { id: true },
    });
    const maxSequence = sequenceTaken
      ? await this.prisma.recruitmentPipelineStage.aggregate({
          where: { tenantId, requisitionId },
          _max: { sequence: true },
        })
      : null;

    return this.prisma.recruitmentPipelineStage.create({
      data: {
        tenant: { connect: { id: tenantId } },
        requisition: { connect: { id: requisitionId } },
        name: definition.name,
        type: definition.type,
        sequence: sequenceTaken ? (maxSequence?._max.sequence ?? definition.sequence) + 10 : definition.sequence,
        isTerminal: definition.isTerminal ?? false,
      },
    });
  }

  private humanizeStage(stageType: RecruitmentStageType) {
    return stageType.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private async recordHistory(tenantId: string, references: Array<{ entityType: string; entityId: string }>) {
    const OR = references.map((reference) => ({ entityType: reference.entityType, entityId: reference.entityId }));
    const [timeline, audit] = await Promise.all([
      this.prisma.timelineEvent.findMany({
        where: { tenantId, OR },
        orderBy: [{ createdAt: 'desc' }],
        take: 30,
        include: { actor: { select: { id: true, email: true, username: true } } },
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId, OR },
        orderBy: [{ createdAt: 'desc' }],
        take: 30,
        include: { actor: { select: { id: true, email: true, username: true } } },
      }),
    ]);

    return { timeline, audit };
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
    actor: AuthenticatedPrincipal | null,
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
        actorUserId: actor?.id,
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
    actor: AuthenticatedPrincipal | null,
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
        actorUserId: actor?.id,
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
    tenantId: string | null,
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
    jobPosting: true,
    stages: { orderBy: [{ sequence: 'asc' as const }] },
    _count: { select: { applications: true } },
  } satisfies Prisma.RecruitmentRequisitionInclude;

  private readonly jobPostingInclude = {
    requisition: {
      include: {
        position: true,
        hiringManager: { include: { person: true } },
        recruiter: { include: { person: true } },
        approvalRequest: { include: this.approvalRequestInclude },
        stages: { orderBy: [{ sequence: 'asc' as const }] },
        _count: { select: { applications: true } },
      },
    },
  } satisfies Prisma.RecruitmentJobPostingInclude;

  private readonly publicPostingInclude = {
    requisition: {
      select: {
        id: true,
        code: true,
        headcount: true,
        status: true,
        openedAt: true,
        _count: { select: { applications: true } },
      },
    },
  } satisfies Prisma.RecruitmentJobPostingInclude;

  private readonly marketplacePostingInclude = {
    tenant: {
      select: {
        id: true,
        name: true,
        slug: true,
        industry: true,
        branding: {
          select: {
            logoUrl: true,
            primaryColor: true,
            secondaryColor: true,
            accentColor: true,
          },
        },
      },
    },
    requisition: {
      select: {
        id: true,
        code: true,
        headcount: true,
        status: true,
        openedAt: true,
        _count: { select: { applications: true } },
      },
    },
  } satisfies Prisma.RecruitmentJobPostingInclude;

  private readonly applicationInclude = {
    candidate: true,
    requisition: { include: { position: true, hiringManager: { include: { person: true } }, recruiter: { include: { person: true } }, jobPosting: true, stages: { orderBy: [{ sequence: 'asc' as const }] } } },
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

  private readonly requisitionDetailInclude = {
    position: true,
    hiringManager: { include: { person: true } },
    recruiter: { include: { person: true } },
    approvalRequest: { include: this.approvalRequestInclude },
    jobPosting: true,
    stages: { orderBy: [{ sequence: 'asc' as const }] },
    applications: {
      orderBy: [{ lastActivityAt: 'desc' as const }],
      include: {
        candidate: true,
        currentStage: true,
        interviews: { orderBy: [{ scheduledStartAt: 'desc' as const }], take: 3 },
        offers: { orderBy: [{ createdAt: 'desc' as const }], take: 3 },
      },
    },
    _count: { select: { applications: true } },
  } satisfies Prisma.RecruitmentRequisitionInclude;

  private readonly candidateDetailInclude = {
    applications: {
      orderBy: [{ lastActivityAt: 'desc' as const }],
      include: {
        requisition: { include: { position: true, jobPosting: true, stages: { orderBy: [{ sequence: 'asc' as const }] } } },
        currentStage: true,
        interviews: {
          orderBy: [{ scheduledStartAt: 'desc' as const }],
          take: 5,
          include: {
            stage: true,
            feedback: { include: { reviewer: { select: { id: true, email: true, username: true } } } },
          },
        },
        offers: {
          orderBy: [{ createdAt: 'desc' as const }],
          take: 5,
          include: { approvalRequest: { include: this.approvalRequestInclude } },
        },
      },
    },
  } satisfies Prisma.RecruitmentCandidateInclude;

  private readonly applicationDetailInclude = {
    candidate: true,
    requisition: {
      include: {
        position: true,
        hiringManager: { include: { person: true } },
        recruiter: { include: { person: true } },
        approvalRequest: { include: this.approvalRequestInclude },
        jobPosting: true,
        stages: { orderBy: [{ sequence: 'asc' as const }] },
      },
    },
    currentStage: true,
    interviews: {
      orderBy: [{ scheduledStartAt: 'desc' as const }],
      include: {
        stage: true,
        feedback: { include: { reviewer: { select: { id: true, email: true, username: true } } } },
      },
    },
    offers: {
      orderBy: [{ createdAt: 'desc' as const }],
      include: { approvalRequest: { include: this.approvalRequestInclude } },
    },
  } satisfies Prisma.RecruitmentApplicationInclude;

  private readonly interviewDetailInclude = {
    application: {
      include: {
        candidate: true,
        requisition: { include: { position: true, jobPosting: true, stages: { orderBy: [{ sequence: 'asc' as const }] } } },
        currentStage: true,
        offers: { orderBy: [{ createdAt: 'desc' as const }], take: 5 },
      },
    },
    stage: true,
    feedback: { include: { reviewer: { select: { id: true, email: true, username: true } } } },
  } satisfies Prisma.RecruitmentInterviewInclude;

  private readonly offerDetailInclude = {
    application: {
      include: {
        candidate: true,
        requisition: {
          include: {
            position: true,
            hiringManager: { include: { person: true } },
            recruiter: { include: { person: true } },
            jobPosting: true,
            stages: { orderBy: [{ sequence: 'asc' as const }] },
          },
        },
        currentStage: true,
        interviews: {
          orderBy: [{ scheduledStartAt: 'desc' as const }],
          take: 5,
          include: {
            stage: true,
            feedback: { include: { reviewer: { select: { id: true, email: true, username: true } } } },
          },
        },
      },
    },
    approvalRequest: { include: this.approvalRequestInclude },
  } satisfies Prisma.RecruitmentOfferInclude;
}
