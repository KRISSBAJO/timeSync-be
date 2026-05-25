-- CreateEnum
CREATE TYPE "EmploymentContractType" AS ENUM ('PERMANENT', 'FIXED_TERM', 'CONTRACTOR', 'TEMPORARY', 'INTERNSHIP', 'CONSULTING', 'SEASONAL', 'VOLUNTEER', 'OUTSOURCED', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentTermStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUPERSEDED', 'ENDED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'PROJECT', 'MILESTONE');

-- CreateEnum
CREATE TYPE "CompensationComponentType" AS ENUM ('BASE_PAY', 'ALLOWANCE', 'BONUS', 'COMMISSION', 'STIPEND', 'OVERTIME', 'DEDUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "CompensationChangeStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EFFECTIVE', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReportingRelationshipType" AS ENUM ('MANAGER', 'SUPERVISOR', 'UNIT_HEAD', 'DOTTED_LINE', 'PROJECT_LEAD', 'HR_BUSINESS_PARTNER', 'MENTOR', 'APPROVER', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportingRelationshipStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "EmployeeEmploymentTerm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contractType" "EmploymentContractType" NOT NULL DEFAULT 'PERMANENT',
    "status" "EmploymentTermStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "reference" TEXT,
    "payFrequency" "PayFrequency",
    "currencyCode" TEXT,
    "baseAmount" DECIMAL(18,2),
    "gradeId" TEXT,
    "levelId" TEXT,
    "positionId" TEXT,
    "organizationNodeId" TEXT,
    "costCenterId" TEXT,
    "documentId" TEXT,
    "workflowRequestId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeEmploymentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensationComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "termId" TEXT,
    "type" "CompensationComponentType" NOT NULL DEFAULT 'ALLOWANCE',
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "currencyCode" TEXT,
    "frequency" "PayFrequency",
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "status" "CompensationChangeStatus" NOT NULL DEFAULT 'EFFECTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeCompensationComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensationChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "termId" TEXT,
    "status" "CompensationChangeStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "previousState" JSONB,
    "proposedState" JSONB NOT NULL,
    "finalState" JSONB,
    "workflowRequestId" TEXT,
    "initiatedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "appliedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCompensationChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeReportingRelationship" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "relatedEmployeeId" TEXT NOT NULL,
    "type" "ReportingRelationshipType" NOT NULL,
    "status" "ReportingRelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "organizationNodeId" TEXT,
    "positionId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeReportingRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeEmploymentTerm_tenantId_employeeId_idx" ON "EmployeeEmploymentTerm"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentTerm_tenantId_status_idx" ON "EmployeeEmploymentTerm"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentTerm_employeeId_effectiveFrom_effectiveTo_idx" ON "EmployeeEmploymentTerm"("employeeId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentTerm_gradeId_idx" ON "EmployeeEmploymentTerm"("gradeId");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentTerm_levelId_idx" ON "EmployeeEmploymentTerm"("levelId");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentTerm_positionId_idx" ON "EmployeeEmploymentTerm"("positionId");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentTerm_organizationNodeId_idx" ON "EmployeeEmploymentTerm"("organizationNodeId");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentTerm_costCenterId_idx" ON "EmployeeEmploymentTerm"("costCenterId");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentTerm_workflowRequestId_idx" ON "EmployeeEmploymentTerm"("workflowRequestId");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentTerm_approvedById_idx" ON "EmployeeEmploymentTerm"("approvedById");

-- CreateIndex
CREATE INDEX "EmployeeCompensationComponent_tenantId_employeeId_idx" ON "EmployeeCompensationComponent"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationComponent_employeeId_type_status_idx" ON "EmployeeCompensationComponent"("employeeId", "type", "status");

-- CreateIndex
CREATE INDEX "EmployeeCompensationComponent_termId_idx" ON "EmployeeCompensationComponent"("termId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationComponent_effectiveFrom_effectiveTo_idx" ON "EmployeeCompensationComponent"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_tenantId_employeeId_idx" ON "EmployeeCompensationChange"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_tenantId_status_idx" ON "EmployeeCompensationChange"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_termId_idx" ON "EmployeeCompensationChange"("termId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_workflowRequestId_idx" ON "EmployeeCompensationChange"("workflowRequestId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_initiatedById_idx" ON "EmployeeCompensationChange"("initiatedById");

-- CreateIndex
CREATE INDEX "EmployeeCompensationChange_approvedById_idx" ON "EmployeeCompensationChange"("approvedById");

-- CreateIndex
CREATE INDEX "EmployeeReportingRelationship_tenantId_employeeId_idx" ON "EmployeeReportingRelationship"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeReportingRelationship_tenantId_relatedEmployeeId_idx" ON "EmployeeReportingRelationship"("tenantId", "relatedEmployeeId");

-- CreateIndex
CREATE INDEX "EmployeeReportingRelationship_employeeId_type_status_idx" ON "EmployeeReportingRelationship"("employeeId", "type", "status");

-- CreateIndex
CREATE INDEX "EmployeeReportingRelationship_relatedEmployeeId_type_status_idx" ON "EmployeeReportingRelationship"("relatedEmployeeId", "type", "status");

-- CreateIndex
CREATE INDEX "EmployeeReportingRelationship_organizationNodeId_idx" ON "EmployeeReportingRelationship"("organizationNodeId");

-- CreateIndex
CREATE INDEX "EmployeeReportingRelationship_positionId_idx" ON "EmployeeReportingRelationship"("positionId");

-- CreateIndex
CREATE INDEX "EmployeeReportingRelationship_startsAt_endsAt_idx" ON "EmployeeReportingRelationship"("startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "PositionGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "PositionLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_organizationNodeId_fkey" FOREIGN KEY ("organizationNodeId") REFERENCES "OrganizationNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_workflowRequestId_fkey" FOREIGN KEY ("workflowRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentTerm" ADD CONSTRAINT "EmployeeEmploymentTerm_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationComponent" ADD CONSTRAINT "EmployeeCompensationComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationComponent" ADD CONSTRAINT "EmployeeCompensationComponent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationComponent" ADD CONSTRAINT "EmployeeCompensationComponent_termId_fkey" FOREIGN KEY ("termId") REFERENCES "EmployeeEmploymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationChange" ADD CONSTRAINT "EmployeeCompensationChange_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationChange" ADD CONSTRAINT "EmployeeCompensationChange_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationChange" ADD CONSTRAINT "EmployeeCompensationChange_termId_fkey" FOREIGN KEY ("termId") REFERENCES "EmployeeEmploymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationChange" ADD CONSTRAINT "EmployeeCompensationChange_workflowRequestId_fkey" FOREIGN KEY ("workflowRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationChange" ADD CONSTRAINT "EmployeeCompensationChange_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationChange" ADD CONSTRAINT "EmployeeCompensationChange_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReportingRelationship" ADD CONSTRAINT "EmployeeReportingRelationship_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReportingRelationship" ADD CONSTRAINT "EmployeeReportingRelationship_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReportingRelationship" ADD CONSTRAINT "EmployeeReportingRelationship_relatedEmployeeId_fkey" FOREIGN KEY ("relatedEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReportingRelationship" ADD CONSTRAINT "EmployeeReportingRelationship_organizationNodeId_fkey" FOREIGN KEY ("organizationNodeId") REFERENCES "OrganizationNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReportingRelationship" ADD CONSTRAINT "EmployeeReportingRelationship_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
