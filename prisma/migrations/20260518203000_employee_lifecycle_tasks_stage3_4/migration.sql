-- CreateEnum
CREATE TYPE "EmployeeReferenceType" AS ENUM ('PROFESSIONAL', 'EMPLOYMENT', 'ACADEMIC', 'CHARACTER', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeBackgroundCheckStatus" AS ENUM ('NOT_STARTED', 'REQUESTED', 'IN_PROGRESS', 'CLEAR', 'REVIEW_REQUIRED', 'ADVERSE_ACTION', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EmployeeLifecyclePlanType" AS ENUM ('PREBOARDING', 'ONBOARDING', 'CROSSBOARDING', 'OFFBOARDING', 'REHIRE');

-- CreateEnum
CREATE TYPE "EmployeeLifecyclePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmployeeLifecycleTaskOwnerType" AS ENUM ('EMPLOYEE', 'MANAGER', 'HR', 'IT', 'FINANCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EmployeeLifecycleTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmployeeLifecycleTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EmployeeStatutoryIdentifierType" AS ENUM ('TAX_ID', 'NATIONAL_ID', 'SOCIAL_SECURITY', 'PENSION', 'INSURANCE', 'HEALTH_INSURANCE', 'WORK_PERMIT', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeStatutoryIdentifierStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'EXPIRED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "EmployeeReference" ADD COLUMN "type" "EmployeeReferenceType" NOT NULL DEFAULT 'PROFESSIONAL';

-- CreateTable
CREATE TABLE "EmployeeReferenceDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "referenceId" TEXT,
    "documentId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "verificationStatus" "DocumentVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeReferenceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBackgroundCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "provider" TEXT,
    "packageName" TEXT,
    "status" "EmployeeBackgroundCheckStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "requestedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "adjudicatedAt" TIMESTAMP(3),
    "adjudicatedById" TEXT,
    "resultSummary" TEXT,
    "reportUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeBackgroundCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLifecyclePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EmployeeLifecyclePlanType" NOT NULL,
    "status" "EmployeeLifecyclePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLifecyclePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLifecycleTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "ownerType" "EmployeeLifecycleTaskOwnerType" NOT NULL DEFAULT 'HR',
    "assignedUserId" TEXT,
    "assignedEmployeeId" TEXT,
    "status" "EmployeeLifecycleTaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "EmployeeLifecycleTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "waivedAt" TIMESTAMP(3),
    "waivedById" TEXT,
    "blockedReason" TEXT,
    "instructions" TEXT,
    "evidence" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLifecycleTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeStatutoryIdentifier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EmployeeStatutoryIdentifierType" NOT NULL,
    "label" TEXT,
    "countryId" TEXT,
    "identifierLast4" TEXT,
    "identifierFingerprint" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "EmployeeStatutoryIdentifierStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeStatutoryIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeReference_type_idx" ON "EmployeeReference"("type");

-- CreateIndex
CREATE INDEX "EmployeeReferenceDocument_tenantId_employeeId_idx" ON "EmployeeReferenceDocument"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeReferenceDocument_referenceId_idx" ON "EmployeeReferenceDocument"("referenceId");

-- CreateIndex
CREATE INDEX "EmployeeReferenceDocument_documentId_idx" ON "EmployeeReferenceDocument"("documentId");

-- CreateIndex
CREATE INDEX "EmployeeReferenceDocument_uploadedById_idx" ON "EmployeeReferenceDocument"("uploadedById");

-- CreateIndex
CREATE INDEX "EmployeeReferenceDocument_verificationStatus_idx" ON "EmployeeReferenceDocument"("verificationStatus");

-- CreateIndex
CREATE INDEX "EmployeeBackgroundCheck_tenantId_employeeId_idx" ON "EmployeeBackgroundCheck"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeBackgroundCheck_status_idx" ON "EmployeeBackgroundCheck"("status");

-- CreateIndex
CREATE INDEX "EmployeeBackgroundCheck_adjudicatedById_idx" ON "EmployeeBackgroundCheck"("adjudicatedById");

-- CreateIndex
CREATE INDEX "EmployeeLifecyclePlan_tenantId_employeeId_idx" ON "EmployeeLifecyclePlan"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeLifecyclePlan_tenantId_status_idx" ON "EmployeeLifecyclePlan"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EmployeeLifecyclePlan_type_idx" ON "EmployeeLifecyclePlan"("type");

-- CreateIndex
CREATE INDEX "EmployeeLifecyclePlan_createdById_idx" ON "EmployeeLifecyclePlan"("createdById");

-- CreateIndex
CREATE INDEX "EmployeeLifecyclePlan_updatedById_idx" ON "EmployeeLifecyclePlan"("updatedById");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTask_tenantId_employeeId_idx" ON "EmployeeLifecycleTask"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTask_tenantId_status_idx" ON "EmployeeLifecycleTask"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTask_planId_status_idx" ON "EmployeeLifecycleTask"("planId", "status");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTask_assignedUserId_idx" ON "EmployeeLifecycleTask"("assignedUserId");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTask_assignedEmployeeId_idx" ON "EmployeeLifecycleTask"("assignedEmployeeId");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTask_dueAt_idx" ON "EmployeeLifecycleTask"("dueAt");

-- CreateIndex
CREATE INDEX "EmployeeStatutoryIdentifier_tenantId_employeeId_idx" ON "EmployeeStatutoryIdentifier"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeStatutoryIdentifier_employeeId_type_idx" ON "EmployeeStatutoryIdentifier"("employeeId", "type");

-- CreateIndex
CREATE INDEX "EmployeeStatutoryIdentifier_countryId_idx" ON "EmployeeStatutoryIdentifier"("countryId");

-- CreateIndex
CREATE INDEX "EmployeeStatutoryIdentifier_verifiedById_idx" ON "EmployeeStatutoryIdentifier"("verifiedById");

-- CreateIndex
CREATE INDEX "EmployeeStatutoryIdentifier_status_idx" ON "EmployeeStatutoryIdentifier"("status");

-- AddForeignKey
ALTER TABLE "EmployeeReferenceDocument" ADD CONSTRAINT "EmployeeReferenceDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReferenceDocument" ADD CONSTRAINT "EmployeeReferenceDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReferenceDocument" ADD CONSTRAINT "EmployeeReferenceDocument_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "EmployeeReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReferenceDocument" ADD CONSTRAINT "EmployeeReferenceDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReferenceDocument" ADD CONSTRAINT "EmployeeReferenceDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBackgroundCheck" ADD CONSTRAINT "EmployeeBackgroundCheck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBackgroundCheck" ADD CONSTRAINT "EmployeeBackgroundCheck_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBackgroundCheck" ADD CONSTRAINT "EmployeeBackgroundCheck_adjudicatedById_fkey" FOREIGN KEY ("adjudicatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecyclePlan" ADD CONSTRAINT "EmployeeLifecyclePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecyclePlan" ADD CONSTRAINT "EmployeeLifecyclePlan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecyclePlan" ADD CONSTRAINT "EmployeeLifecyclePlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecyclePlan" ADD CONSTRAINT "EmployeeLifecyclePlan_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTask" ADD CONSTRAINT "EmployeeLifecycleTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTask" ADD CONSTRAINT "EmployeeLifecycleTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EmployeeLifecyclePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTask" ADD CONSTRAINT "EmployeeLifecycleTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTask" ADD CONSTRAINT "EmployeeLifecycleTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTask" ADD CONSTRAINT "EmployeeLifecycleTask_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTask" ADD CONSTRAINT "EmployeeLifecycleTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTask" ADD CONSTRAINT "EmployeeLifecycleTask_waivedById_fkey" FOREIGN KEY ("waivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeStatutoryIdentifier" ADD CONSTRAINT "EmployeeStatutoryIdentifier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeStatutoryIdentifier" ADD CONSTRAINT "EmployeeStatutoryIdentifier_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeStatutoryIdentifier" ADD CONSTRAINT "EmployeeStatutoryIdentifier_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeStatutoryIdentifier" ADD CONSTRAINT "EmployeeStatutoryIdentifier_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
