-- CreateEnum
CREATE TYPE "RecruitmentControlStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RecruitmentRequisitionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RecruitmentEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERN', 'PER_DIEM');

-- CreateEnum
CREATE TYPE "RecruitmentWorkMode" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "RecruitmentCandidateStatus" AS ENUM ('ACTIVE', 'DO_NOT_CONTACT', 'HIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RecruitmentApplicationStatus" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RecruitmentStageType" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RecruitmentInterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "RecruitmentFeedbackRecommendation" AS ENUM ('STRONG_YES', 'YES', 'MIXED', 'NO', 'STRONG_NO');

-- CreateEnum
CREATE TYPE "RecruitmentOfferStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'EXTENDED', 'ACCEPTED', 'DECLINED', 'REJECTED', 'WITHDRAWN');

-- Timeline parity
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'RECRUITMENT_REQUISITION_SUBMITTED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'RECRUITMENT_REQUISITION_APPROVED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'RECRUITMENT_REQUISITION_OPENED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'RECRUITMENT_CANDIDATE_APPLIED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'RECRUITMENT_INTERVIEW_SCHEDULED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'RECRUITMENT_OFFER_SUBMITTED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'RECRUITMENT_OFFER_APPROVED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'RECRUITMENT_OFFER_ACCEPTED';

-- CreateTable
CREATE TABLE "RecruitmentRequisition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "positionId" TEXT,
    "hiringManagerId" TEXT,
    "recruiterId" TEXT,
    "approvalRequestId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentName" TEXT,
    "locationName" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "status" "RecruitmentRequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "employmentType" "RecruitmentEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "workMode" "RecruitmentWorkMode" NOT NULL DEFAULT 'ONSITE',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "targetStartDate" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "salaryMinCents" INTEGER,
    "salaryMaxCents" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "requirements" TEXT,
    "workflowSnapshot" JSONB,
    "metadata" JSONB,
    "createdById" TEXT,
    "submittedById" TEXT,
    "decidedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RecruitmentRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentApprovalRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecruitmentControlStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "organizationNodeId" TEXT,
    "costCenterId" TEXT,
    "positionId" TEXT,
    "employmentType" "RecruitmentEmploymentType",
    "minHeadcount" INTEGER,
    "maxHeadcount" INTEGER,
    "minSalaryCents" INTEGER,
    "maxSalaryCents" INTEGER,
    "workflowCode" TEXT,
    "triggerKey" TEXT NOT NULL DEFAULT 'recruitment.requisition.submitted',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RecruitmentApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentCandidate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "source" TEXT,
    "status" "RecruitmentCandidateStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentEmployer" TEXT,
    "currentTitle" TEXT,
    "locationName" TEXT,
    "resumeUrl" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RecruitmentCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentPipelineStage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RecruitmentStageType" NOT NULL DEFAULT 'CUSTOM',
    "sequence" INTEGER NOT NULL,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentPipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "currentStageId" TEXT,
    "status" "RecruitmentApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "source" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejectedAt" TIMESTAMP(3),
    "hiredAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "score" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RecruitmentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentInterview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stageId" TEXT,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "locationName" TEXT,
    "meetingUrl" TEXT,
    "status" "RecruitmentInterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "interviewerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RecruitmentInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentInterviewFeedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "rating" INTEGER,
    "recommendation" "RecruitmentFeedbackRecommendation" NOT NULL,
    "strengths" TEXT,
    "concerns" TEXT,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentInterviewFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "approvalRequestId" TEXT,
    "status" "RecruitmentOfferStatus" NOT NULL DEFAULT 'DRAFT',
    "basePayCents" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "startDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "submittedById" TEXT,
    "decidedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "extendedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "workflowSnapshot" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RecruitmentOffer_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "RecruitmentRequisition_tenantId_code_key" ON "RecruitmentRequisition"("tenantId", "code");
CREATE INDEX "RecruitmentRequisition_tenantId_status_idx" ON "RecruitmentRequisition"("tenantId", "status");
CREATE INDEX "RecruitmentRequisition_positionId_idx" ON "RecruitmentRequisition"("positionId");
CREATE INDEX "RecruitmentRequisition_hiringManagerId_idx" ON "RecruitmentRequisition"("hiringManagerId");
CREATE INDEX "RecruitmentRequisition_recruiterId_idx" ON "RecruitmentRequisition"("recruiterId");
CREATE INDEX "RecruitmentRequisition_approvalRequestId_idx" ON "RecruitmentRequisition"("approvalRequestId");

CREATE UNIQUE INDEX "RecruitmentApprovalRule_tenantId_code_key" ON "RecruitmentApprovalRule"("tenantId", "code");
CREATE INDEX "RecruitmentApprovalRule_tenantId_status_idx" ON "RecruitmentApprovalRule"("tenantId", "status");
CREATE INDEX "RecruitmentApprovalRule_workflowId_idx" ON "RecruitmentApprovalRule"("workflowId");
CREATE INDEX "RecruitmentApprovalRule_organizationNodeId_idx" ON "RecruitmentApprovalRule"("organizationNodeId");
CREATE INDEX "RecruitmentApprovalRule_costCenterId_idx" ON "RecruitmentApprovalRule"("costCenterId");
CREATE INDEX "RecruitmentApprovalRule_positionId_idx" ON "RecruitmentApprovalRule"("positionId");

CREATE UNIQUE INDEX "RecruitmentCandidate_tenantId_email_key" ON "RecruitmentCandidate"("tenantId", "email");
CREATE INDEX "RecruitmentCandidate_tenantId_status_idx" ON "RecruitmentCandidate"("tenantId", "status");
CREATE INDEX "RecruitmentCandidate_tenantId_lastName_firstName_idx" ON "RecruitmentCandidate"("tenantId", "lastName", "firstName");

CREATE UNIQUE INDEX "RecruitmentPipelineStage_requisitionId_sequence_key" ON "RecruitmentPipelineStage"("requisitionId", "sequence");
CREATE INDEX "RecruitmentPipelineStage_tenantId_idx" ON "RecruitmentPipelineStage"("tenantId");
CREATE INDEX "RecruitmentPipelineStage_requisitionId_idx" ON "RecruitmentPipelineStage"("requisitionId");
CREATE INDEX "RecruitmentPipelineStage_type_idx" ON "RecruitmentPipelineStage"("type");

CREATE UNIQUE INDEX "RecruitmentApplication_candidateId_requisitionId_key" ON "RecruitmentApplication"("candidateId", "requisitionId");
CREATE INDEX "RecruitmentApplication_tenantId_status_idx" ON "RecruitmentApplication"("tenantId", "status");
CREATE INDEX "RecruitmentApplication_requisitionId_status_idx" ON "RecruitmentApplication"("requisitionId", "status");
CREATE INDEX "RecruitmentApplication_candidateId_idx" ON "RecruitmentApplication"("candidateId");
CREATE INDEX "RecruitmentApplication_currentStageId_idx" ON "RecruitmentApplication"("currentStageId");

CREATE INDEX "RecruitmentInterview_tenantId_scheduledStartAt_idx" ON "RecruitmentInterview"("tenantId", "scheduledStartAt");
CREATE INDEX "RecruitmentInterview_applicationId_idx" ON "RecruitmentInterview"("applicationId");
CREATE INDEX "RecruitmentInterview_stageId_idx" ON "RecruitmentInterview"("stageId");
CREATE INDEX "RecruitmentInterview_tenantId_status_idx" ON "RecruitmentInterview"("tenantId", "status");

CREATE INDEX "RecruitmentInterviewFeedback_tenantId_submittedAt_idx" ON "RecruitmentInterviewFeedback"("tenantId", "submittedAt");
CREATE INDEX "RecruitmentInterviewFeedback_interviewId_idx" ON "RecruitmentInterviewFeedback"("interviewId");
CREATE INDEX "RecruitmentInterviewFeedback_applicationId_idx" ON "RecruitmentInterviewFeedback"("applicationId");
CREATE INDEX "RecruitmentInterviewFeedback_reviewerUserId_idx" ON "RecruitmentInterviewFeedback"("reviewerUserId");

CREATE INDEX "RecruitmentOffer_tenantId_status_idx" ON "RecruitmentOffer"("tenantId", "status");
CREATE INDEX "RecruitmentOffer_applicationId_idx" ON "RecruitmentOffer"("applicationId");
CREATE INDEX "RecruitmentOffer_approvalRequestId_idx" ON "RecruitmentOffer"("approvalRequestId");

-- Foreign keys
ALTER TABLE "RecruitmentRequisition" ADD CONSTRAINT "RecruitmentRequisition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentRequisition" ADD CONSTRAINT "RecruitmentRequisition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecruitmentRequisition" ADD CONSTRAINT "RecruitmentRequisition_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecruitmentRequisition" ADD CONSTRAINT "RecruitmentRequisition_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecruitmentRequisition" ADD CONSTRAINT "RecruitmentRequisition_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecruitmentApprovalRule" ADD CONSTRAINT "RecruitmentApprovalRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentApprovalRule" ADD CONSTRAINT "RecruitmentApprovalRule_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecruitmentCandidate" ADD CONSTRAINT "RecruitmentCandidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruitmentPipelineStage" ADD CONSTRAINT "RecruitmentPipelineStage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentPipelineStage" ADD CONSTRAINT "RecruitmentPipelineStage_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "RecruitmentRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruitmentApplication" ADD CONSTRAINT "RecruitmentApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentApplication" ADD CONSTRAINT "RecruitmentApplication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "RecruitmentCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentApplication" ADD CONSTRAINT "RecruitmentApplication_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "RecruitmentRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentApplication" ADD CONSTRAINT "RecruitmentApplication_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "RecruitmentPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecruitmentInterview" ADD CONSTRAINT "RecruitmentInterview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentInterview" ADD CONSTRAINT "RecruitmentInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentInterview" ADD CONSTRAINT "RecruitmentInterview_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "RecruitmentPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecruitmentInterviewFeedback" ADD CONSTRAINT "RecruitmentInterviewFeedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentInterviewFeedback" ADD CONSTRAINT "RecruitmentInterviewFeedback_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "RecruitmentInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentInterviewFeedback" ADD CONSTRAINT "RecruitmentInterviewFeedback_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentInterviewFeedback" ADD CONSTRAINT "RecruitmentInterviewFeedback_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecruitmentOffer" ADD CONSTRAINT "RecruitmentOffer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentOffer" ADD CONSTRAINT "RecruitmentOffer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RecruitmentApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentOffer" ADD CONSTRAINT "RecruitmentOffer_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
