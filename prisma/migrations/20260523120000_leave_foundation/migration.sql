-- CreateEnum
CREATE TYPE "LeavePolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeaveTypeUnit" AS ENUM ('DAYS', 'HOURS');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN', 'TAKEN', 'REVERSED');

-- CreateEnum
CREATE TYPE "LeaveLedgerEntryType" AS ENUM ('OPENING_BALANCE', 'ACCRUAL', 'CARRYOVER', 'EXPIRY', 'CREDIT_ADJUSTMENT', 'DEBIT_ADJUSTMENT', 'REQUESTED', 'APPROVED_USAGE', 'CANCELLED_RESTORE', 'REVERSAL');

-- Timeline parity
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'LEAVE_REQUESTED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'LEAVE_APPROVED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'LEAVE_REJECTED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'LEAVE_CANCELLED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'LEAVE_BALANCE_ADJUSTED';

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'PTO',
    "unit" "LeaveTypeUnit" NOT NULL DEFAULT 'DAYS',
    "status" "LeavePolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "requiresDocumentation" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "LeavePolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "eligibilityDays" INTEGER NOT NULL DEFAULT 0,
    "annualAllowanceMinutes" INTEGER NOT NULL DEFAULT 0,
    "accrualMethod" TEXT NOT NULL DEFAULT 'ANNUAL_GRANT',
    "accrualRateMinutes" INTEGER,
    "maxBalanceMinutes" INTEGER,
    "carryoverLimitMinutes" INTEGER,
    "expiryMonth" INTEGER,
    "expiryDay" INTEGER,
    "allowNegativeBalance" BOOLEAN NOT NULL DEFAULT false,
    "negativeBalanceLimitMinutes" INTEGER NOT NULL DEFAULT 0,
    "minimumRequestMinutes" INTEGER NOT NULL DEFAULT 60,
    "maximumRequestMinutes" INTEGER,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "workflowCode" TEXT,
    "workflowTriggerKey" TEXT NOT NULL DEFAULT 'leave.request.submitted',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApprovalRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaveTypeId" TEXT,
    "policyId" TEXT,
    "workflowId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "LeavePolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "organizationNodeId" TEXT,
    "costCenterId" TEXT,
    "positionId" TEXT,
    "minMinutes" INTEGER,
    "maxMinutes" INTEGER,
    "workflowCode" TEXT,
    "triggerKey" TEXT NOT NULL DEFAULT 'leave.request.submitted',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "policyId" TEXT,
    "balanceMinutes" INTEGER NOT NULL DEFAULT 0,
    "accruedMinutes" INTEGER NOT NULL DEFAULT 0,
    "usedMinutes" INTEGER NOT NULL DEFAULT 0,
    "pendingMinutes" INTEGER NOT NULL DEFAULT 0,
    "carryoverMinutes" INTEGER NOT NULL DEFAULT 0,
    "asOfDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "policyId" TEXT,
    "approvalRequestId" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "requestedMinutes" INTEGER NOT NULL,
    "paidMinutes" INTEGER NOT NULL DEFAULT 0,
    "unpaidMinutes" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "supportingDocumentUrl" TEXT,
    "submittedById" TEXT,
    "decidedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "workflowSnapshot" JSONB,
    "balanceSnapshot" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveLedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "balanceId" TEXT,
    "requestId" TEXT,
    "type" "LeaveLedgerEntryType" NOT NULL,
    "minutes" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "LeaveType_tenantId_code_key" ON "LeaveType"("tenantId", "code");
CREATE INDEX "LeaveType_tenantId_status_idx" ON "LeaveType"("tenantId", "status");

CREATE UNIQUE INDEX "LeavePolicy_tenantId_code_key" ON "LeavePolicy"("tenantId", "code");
CREATE INDEX "LeavePolicy_tenantId_status_idx" ON "LeavePolicy"("tenantId", "status");
CREATE INDEX "LeavePolicy_leaveTypeId_idx" ON "LeavePolicy"("leaveTypeId");

CREATE UNIQUE INDEX "LeaveApprovalRule_tenantId_code_key" ON "LeaveApprovalRule"("tenantId", "code");
CREATE INDEX "LeaveApprovalRule_tenantId_status_idx" ON "LeaveApprovalRule"("tenantId", "status");
CREATE INDEX "LeaveApprovalRule_leaveTypeId_idx" ON "LeaveApprovalRule"("leaveTypeId");
CREATE INDEX "LeaveApprovalRule_policyId_idx" ON "LeaveApprovalRule"("policyId");
CREATE INDEX "LeaveApprovalRule_workflowId_idx" ON "LeaveApprovalRule"("workflowId");
CREATE INDEX "LeaveApprovalRule_organizationNodeId_idx" ON "LeaveApprovalRule"("organizationNodeId");
CREATE INDEX "LeaveApprovalRule_costCenterId_idx" ON "LeaveApprovalRule"("costCenterId");
CREATE INDEX "LeaveApprovalRule_positionId_idx" ON "LeaveApprovalRule"("positionId");

CREATE UNIQUE INDEX "LeaveBalance_tenantId_employeeId_leaveTypeId_key" ON "LeaveBalance"("tenantId", "employeeId", "leaveTypeId");
CREATE INDEX "LeaveBalance_tenantId_employeeId_idx" ON "LeaveBalance"("tenantId", "employeeId");
CREATE INDEX "LeaveBalance_leaveTypeId_idx" ON "LeaveBalance"("leaveTypeId");
CREATE INDEX "LeaveBalance_policyId_idx" ON "LeaveBalance"("policyId");

CREATE INDEX "LeaveRequest_tenantId_status_idx" ON "LeaveRequest"("tenantId", "status");
CREATE INDEX "LeaveRequest_tenantId_startAt_endAt_idx" ON "LeaveRequest"("tenantId", "startAt", "endAt");
CREATE INDEX "LeaveRequest_employeeId_startAt_idx" ON "LeaveRequest"("employeeId", "startAt");
CREATE INDEX "LeaveRequest_leaveTypeId_idx" ON "LeaveRequest"("leaveTypeId");
CREATE INDEX "LeaveRequest_policyId_idx" ON "LeaveRequest"("policyId");
CREATE INDEX "LeaveRequest_approvalRequestId_idx" ON "LeaveRequest"("approvalRequestId");
CREATE INDEX "LeaveRequest_submittedById_idx" ON "LeaveRequest"("submittedById");
CREATE INDEX "LeaveRequest_decidedById_idx" ON "LeaveRequest"("decidedById");

CREATE INDEX "LeaveLedgerEntry_tenantId_employeeId_effectiveAt_idx" ON "LeaveLedgerEntry"("tenantId", "employeeId", "effectiveAt");
CREATE INDEX "LeaveLedgerEntry_leaveTypeId_idx" ON "LeaveLedgerEntry"("leaveTypeId");
CREATE INDEX "LeaveLedgerEntry_balanceId_idx" ON "LeaveLedgerEntry"("balanceId");
CREATE INDEX "LeaveLedgerEntry_requestId_idx" ON "LeaveLedgerEntry"("requestId");
CREATE INDEX "LeaveLedgerEntry_actorUserId_idx" ON "LeaveLedgerEntry"("actorUserId");

-- Foreign keys
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveApprovalRule" ADD CONSTRAINT "LeaveApprovalRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveApprovalRule" ADD CONSTRAINT "LeaveApprovalRule_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveApprovalRule" ADD CONSTRAINT "LeaveApprovalRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LeavePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveApprovalRule" ADD CONSTRAINT "LeaveApprovalRule_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LeavePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LeavePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "LeaveBalance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
