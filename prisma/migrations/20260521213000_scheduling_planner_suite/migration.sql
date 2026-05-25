-- CreateEnum
CREATE TYPE "ScheduleCoverageRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleSwapRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "ScheduleCoverageRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT,
    "shiftId" TEXT,
    "organizationNodeId" TEXT,
    "costCenterId" TEXT,
    "positionId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "startsAtTime" TEXT,
    "endsAtTime" TEXT,
    "timezone" TEXT,
    "locationName" TEXT,
    "requiredHeadcount" INTEGER NOT NULL DEFAULT 1,
    "minimumHeadcount" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "status" "ScheduleCoverageRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleCoverageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleSwapRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "requesterEmployeeId" TEXT NOT NULL,
    "targetEmployeeId" TEXT,
    "status" "ScheduleSwapRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "decisionNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleSwapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleCoverageRule_tenantId_code_key" ON "ScheduleCoverageRule"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ScheduleCoverageRule_tenantId_status_idx" ON "ScheduleCoverageRule"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ScheduleCoverageRule_tenantId_effectiveFrom_effectiveTo_idx" ON "ScheduleCoverageRule"("tenantId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "ScheduleCoverageRule_policyId_idx" ON "ScheduleCoverageRule"("policyId");

-- CreateIndex
CREATE INDEX "ScheduleCoverageRule_shiftId_idx" ON "ScheduleCoverageRule"("shiftId");

-- CreateIndex
CREATE INDEX "ScheduleCoverageRule_organizationNodeId_idx" ON "ScheduleCoverageRule"("organizationNodeId");

-- CreateIndex
CREATE INDEX "ScheduleCoverageRule_costCenterId_idx" ON "ScheduleCoverageRule"("costCenterId");

-- CreateIndex
CREATE INDEX "ScheduleCoverageRule_positionId_idx" ON "ScheduleCoverageRule"("positionId");

-- CreateIndex
CREATE INDEX "ScheduleSwapRequest_tenantId_status_idx" ON "ScheduleSwapRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ScheduleSwapRequest_assignmentId_idx" ON "ScheduleSwapRequest"("assignmentId");

-- CreateIndex
CREATE INDEX "ScheduleSwapRequest_requesterEmployeeId_idx" ON "ScheduleSwapRequest"("requesterEmployeeId");

-- CreateIndex
CREATE INDEX "ScheduleSwapRequest_targetEmployeeId_idx" ON "ScheduleSwapRequest"("targetEmployeeId");

-- CreateIndex
CREATE INDEX "ScheduleSwapRequest_decidedById_idx" ON "ScheduleSwapRequest"("decidedById");

-- CreateIndex
CREATE INDEX "ScheduleSwapRequest_requestedAt_idx" ON "ScheduleSwapRequest"("requestedAt");

-- AddForeignKey
ALTER TABLE "ScheduleCoverageRule" ADD CONSTRAINT "ScheduleCoverageRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleCoverageRule" ADD CONSTRAINT "ScheduleCoverageRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SchedulePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleCoverageRule" ADD CONSTRAINT "ScheduleCoverageRule_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleCoverageRule" ADD CONSTRAINT "ScheduleCoverageRule_organizationNodeId_fkey" FOREIGN KEY ("organizationNodeId") REFERENCES "OrganizationNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleCoverageRule" ADD CONSTRAINT "ScheduleCoverageRule_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleCoverageRule" ADD CONSTRAINT "ScheduleCoverageRule_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSwapRequest" ADD CONSTRAINT "ScheduleSwapRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSwapRequest" ADD CONSTRAINT "ScheduleSwapRequest_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ScheduleAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSwapRequest" ADD CONSTRAINT "ScheduleSwapRequest_requesterEmployeeId_fkey" FOREIGN KEY ("requesterEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSwapRequest" ADD CONSTRAINT "ScheduleSwapRequest_targetEmployeeId_fkey" FOREIGN KEY ("targetEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSwapRequest" ADD CONSTRAINT "ScheduleSwapRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
