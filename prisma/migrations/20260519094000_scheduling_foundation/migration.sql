-- CreateEnum
CREATE TYPE "SchedulePolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleWeekStart" AS ENUM ('SUNDAY', 'MONDAY', 'SATURDAY');

-- CreateEnum
CREATE TYPE "OvertimePolicyMode" AS ENUM ('DISABLED', 'DAILY', 'WEEKLY', 'DAILY_AND_WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OvertimeApprovalMode" AS ENUM ('NONE', 'MANAGER', 'HR', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleAssignmentStatus" AS ENUM ('DRAFT', 'ASSIGNED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ScheduleAssignmentSource" AS ENUM ('HR_MANAGER', 'MANAGER', 'SELF_SERVICE', 'OPEN_SHIFT', 'OVERTIME');

-- CreateEnum
CREATE TYPE "OpenShiftStatus" AS ENUM ('OPEN', 'CLAIMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OpenShiftClaimStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OvertimeRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EmployeeAvailabilityStatus" AS ENUM ('AVAILABLE', 'PREFERRED', 'UNAVAILABLE');

-- AlterEnum
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'SCHEDULE_ASSIGNED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'OPEN_SHIFT_CLAIMED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'OVERTIME_REQUESTED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'OVERTIME_APPROVED';

-- CreateTable
CREATE TABLE "SchedulePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "SchedulePolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "countryId" TEXT,
    "timezone" TEXT,
    "weekStartsOn" "ScheduleWeekStart" NOT NULL DEFAULT 'MONDAY',
    "standardHoursPerDay" DOUBLE PRECISION,
    "standardHoursPerWeek" DOUBLE PRECISION,
    "overtimeMode" "OvertimePolicyMode" NOT NULL DEFAULT 'DISABLED',
    "overtimeApprovalMode" "OvertimeApprovalMode" NOT NULL DEFAULT 'MANAGER',
    "overtimeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "doubleTimeMultiplier" DOUBLE PRECISION,
    "weekendOvertime" BOOLEAN NOT NULL DEFAULT false,
    "holidayOvertime" BOOLEAN NOT NULL DEFAULT false,
    "allowSelfScheduling" BOOLEAN NOT NULL DEFAULT false,
    "allowOpenShiftPickup" BOOLEAN NOT NULL DEFAULT false,
    "allowManagerAssignment" BOOLEAN NOT NULL DEFAULT true,
    "allowHrAssignment" BOOLEAN NOT NULL DEFAULT true,
    "maxConsecutiveDays" INTEGER,
    "minRestHours" DOUBLE PRECISION,
    "graceMinutesEarly" INTEGER NOT NULL DEFAULT 0,
    "graceMinutesLate" INTEGER NOT NULL DEFAULT 0,
    "roundingMinutes" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SchedulePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ShiftStatus" NOT NULL DEFAULT 'ACTIVE',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "paidBreak" BOOLEAN NOT NULL DEFAULT false,
    "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT,
    "color" TEXT,
    "isOvertimeEligible" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "minHeadcount" INTEGER NOT NULL DEFAULT 1,
    "maxHeadcount" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulePeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SchedulePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT,
    "policyId" TEXT,
    "organizationNodeId" TEXT,
    "costCenterId" TEXT,
    "positionId" TEXT,
    "positionGradeId" TEXT,
    "managerEmployeeId" TEXT,
    "assignedById" TEXT,
    "source" "ScheduleAssignmentSource" NOT NULL DEFAULT 'HR_MANAGER',
    "status" "ScheduleAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "workDate" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT,
    "locationName" TEXT,
    "isOpenShift" BOOLEAN NOT NULL DEFAULT false,
    "isOvertime" BOOLEAN NOT NULL DEFAULT false,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "metadata" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "shiftId" TEXT,
    "policyId" TEXT,
    "organizationNodeId" TEXT,
    "costCenterId" TEXT,
    "positionId" TEXT,
    "positionGradeId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT,
    "locationName" TEXT,
    "requiredHeadcount" INTEGER NOT NULL DEFAULT 1,
    "claimedHeadcount" INTEGER NOT NULL DEFAULT 0,
    "status" "OpenShiftStatus" NOT NULL DEFAULT 'OPEN',
    "pickupRequiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenShiftClaim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "openShiftId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT,
    "assignmentId" TEXT,
    "status" "OpenShiftClaimStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenShiftClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "policyId" TEXT,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "status" "OvertimeRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "source" "ScheduleAssignmentSource" NOT NULL DEFAULT 'OVERTIME',
    "approvalMode" "OvertimeApprovalMode" NOT NULL DEFAULT 'MANAGER',
    "requestDate" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "multiplier" DOUBLE PRECISION,
    "reason" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAvailability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "timezone" TEXT,
    "status" "EmployeeAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reason" TEXT,
    "recurringRule" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchedulePolicy_tenantId_code_key" ON "SchedulePolicy"("tenantId", "code");
CREATE INDEX "SchedulePolicy_tenantId_status_idx" ON "SchedulePolicy"("tenantId", "status");
CREATE INDEX "SchedulePolicy_countryId_idx" ON "SchedulePolicy"("countryId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkShift_tenantId_code_key" ON "WorkShift"("tenantId", "code");
CREATE INDEX "WorkShift_tenantId_status_idx" ON "WorkShift"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulePeriod_tenantId_code_key" ON "SchedulePeriod"("tenantId", "code");
CREATE INDEX "SchedulePeriod_tenantId_status_idx" ON "SchedulePeriod"("tenantId", "status");
CREATE INDEX "SchedulePeriod_tenantId_startsOn_endsOn_idx" ON "SchedulePeriod"("tenantId", "startsOn", "endsOn");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_tenantId_workDate_idx" ON "ScheduleAssignment"("tenantId", "workDate");
CREATE INDEX "ScheduleAssignment_employeeId_startsAt_idx" ON "ScheduleAssignment"("employeeId", "startsAt");
CREATE INDEX "ScheduleAssignment_scheduleId_idx" ON "ScheduleAssignment"("scheduleId");
CREATE INDEX "ScheduleAssignment_shiftId_idx" ON "ScheduleAssignment"("shiftId");
CREATE INDEX "ScheduleAssignment_policyId_idx" ON "ScheduleAssignment"("policyId");
CREATE INDEX "ScheduleAssignment_organizationNodeId_idx" ON "ScheduleAssignment"("organizationNodeId");
CREATE INDEX "ScheduleAssignment_costCenterId_idx" ON "ScheduleAssignment"("costCenterId");
CREATE INDEX "ScheduleAssignment_positionId_idx" ON "ScheduleAssignment"("positionId");
CREATE INDEX "ScheduleAssignment_positionGradeId_idx" ON "ScheduleAssignment"("positionGradeId");
CREATE INDEX "ScheduleAssignment_tenantId_status_idx" ON "ScheduleAssignment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OpenShift_tenantId_status_idx" ON "OpenShift"("tenantId", "status");
CREATE INDEX "OpenShift_tenantId_workDate_idx" ON "OpenShift"("tenantId", "workDate");
CREATE INDEX "OpenShift_scheduleId_idx" ON "OpenShift"("scheduleId");
CREATE INDEX "OpenShift_shiftId_idx" ON "OpenShift"("shiftId");
CREATE INDEX "OpenShift_policyId_idx" ON "OpenShift"("policyId");
CREATE INDEX "OpenShift_organizationNodeId_idx" ON "OpenShift"("organizationNodeId");
CREATE INDEX "OpenShift_positionGradeId_idx" ON "OpenShift"("positionGradeId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenShiftClaim_openShiftId_employeeId_key" ON "OpenShiftClaim"("openShiftId", "employeeId");
CREATE INDEX "OpenShiftClaim_tenantId_status_idx" ON "OpenShiftClaim"("tenantId", "status");
CREATE INDEX "OpenShiftClaim_employeeId_requestedAt_idx" ON "OpenShiftClaim"("employeeId", "requestedAt");
CREATE INDEX "OpenShiftClaim_assignmentId_idx" ON "OpenShiftClaim"("assignmentId");

-- CreateIndex
CREATE INDEX "OvertimeRequest_tenantId_status_idx" ON "OvertimeRequest"("tenantId", "status");
CREATE INDEX "OvertimeRequest_employeeId_requestDate_idx" ON "OvertimeRequest"("employeeId", "requestDate");
CREATE INDEX "OvertimeRequest_assignmentId_idx" ON "OvertimeRequest"("assignmentId");
CREATE INDEX "OvertimeRequest_policyId_idx" ON "OvertimeRequest"("policyId");

-- CreateIndex
CREATE INDEX "EmployeeAvailability_tenantId_date_idx" ON "EmployeeAvailability"("tenantId", "date");
CREATE INDEX "EmployeeAvailability_employeeId_date_idx" ON "EmployeeAvailability"("employeeId", "date");
CREATE INDEX "EmployeeAvailability_tenantId_status_idx" ON "EmployeeAvailability"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "SchedulePolicy" ADD CONSTRAINT "SchedulePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePolicy" ADD CONSTRAINT "SchedulePolicy_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkShift" ADD CONSTRAINT "WorkShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePeriod" ADD CONSTRAINT "SchedulePeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "SchedulePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SchedulePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_organizationNodeId_fkey" FOREIGN KEY ("organizationNodeId") REFERENCES "OrganizationNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_positionGradeId_fkey" FOREIGN KEY ("positionGradeId") REFERENCES "PositionGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "SchedulePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SchedulePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_organizationNodeId_fkey" FOREIGN KEY ("organizationNodeId") REFERENCES "OrganizationNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_positionGradeId_fkey" FOREIGN KEY ("positionGradeId") REFERENCES "PositionGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenShiftClaim" ADD CONSTRAINT "OpenShiftClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenShiftClaim" ADD CONSTRAINT "OpenShiftClaim_openShiftId_fkey" FOREIGN KEY ("openShiftId") REFERENCES "OpenShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenShiftClaim" ADD CONSTRAINT "OpenShiftClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenShiftClaim" ADD CONSTRAINT "OpenShiftClaim_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ScheduleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ScheduleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SchedulePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAvailability" ADD CONSTRAINT "EmployeeAvailability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeAvailability" ADD CONSTRAINT "EmployeeAvailability_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
