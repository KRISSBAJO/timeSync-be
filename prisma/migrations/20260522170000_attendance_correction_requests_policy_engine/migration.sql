-- Dedicated attendance correction request workflow and policy review timeline events.
CREATE TYPE "AttendanceCorrectionRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'APPLIED');

ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTION_REQUESTED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTION_APPROVED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTION_REJECTED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTION_CANCELLED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CORRECTION_APPLIED';

CREATE TABLE "AttendanceCorrectionRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceRecordId" TEXT,
    "scheduleAssignmentId" TEXT,
    "policyId" TEXT,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "appliedById" TEXT,
    "appliedRecordId" TEXT,
    "status" "AttendanceCorrectionRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "workDate" TIMESTAMP(3) NOT NULL,
    "requestedClockInAt" TIMESTAMP(3),
    "requestedClockOutAt" TIMESTAMP(3),
    "requestedBreakMinutes" INTEGER,
    "requestedLocationName" TEXT,
    "requestedNotes" TEXT,
    "reason" TEXT NOT NULL,
    "supportingDocumentUrl" TEXT,
    "decisionNote" TEXT,
    "previousSnapshot" JSONB,
    "requestedSnapshot" JSONB NOT NULL,
    "policySnapshot" JSONB,
    "policyViolations" JSONB,
    "metadata" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendanceCorrectionRequest_tenantId_status_idx" ON "AttendanceCorrectionRequest"("tenantId", "status");
CREATE INDEX "AttendanceCorrectionRequest_employeeId_requestedAt_idx" ON "AttendanceCorrectionRequest"("employeeId", "requestedAt");
CREATE INDEX "AttendanceCorrectionRequest_attendanceRecordId_idx" ON "AttendanceCorrectionRequest"("attendanceRecordId");
CREATE INDEX "AttendanceCorrectionRequest_scheduleAssignmentId_idx" ON "AttendanceCorrectionRequest"("scheduleAssignmentId");
CREATE INDEX "AttendanceCorrectionRequest_policyId_idx" ON "AttendanceCorrectionRequest"("policyId");
CREATE INDEX "AttendanceCorrectionRequest_requestedById_idx" ON "AttendanceCorrectionRequest"("requestedById");
CREATE INDEX "AttendanceCorrectionRequest_decidedById_idx" ON "AttendanceCorrectionRequest"("decidedById");
CREATE INDEX "AttendanceCorrectionRequest_appliedRecordId_idx" ON "AttendanceCorrectionRequest"("appliedRecordId");

ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_appliedRecordId_fkey" FOREIGN KEY ("appliedRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_scheduleAssignmentId_fkey" FOREIGN KEY ("scheduleAssignmentId") REFERENCES "ScheduleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AttendancePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
