-- CreateEnum
CREATE TYPE "AttendancePolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AttendancePunchType" AS ENUM ('CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('WEB', 'MOBILE', 'KIOSK', 'MANUAL', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AttendanceRecordStatus" AS ENUM ('OPEN', 'COMPLETED', 'FLAGGED', 'VOIDED');

-- CreateEnum
CREATE TYPE "AttendanceExceptionType" AS ENUM ('LATE_ARRIVAL', 'EARLY_DEPARTURE', 'MISSED_CLOCK_IN', 'MISSED_CLOCK_OUT', 'MISSED_BREAK', 'ABSENCE', 'UNSCHEDULED_WORK', 'OVERTIME', 'UNAPPROVED_LOCATION', 'OUTSIDE_GEOFENCE', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AttendanceExceptionStatus" AS ENUM ('OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WAIVED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceTimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED', 'REOPENED');

-- CreateEnum
CREATE TYPE "AttendanceTimesheetEntryStatus" AS ENUM ('DRAFT', 'READY', 'EXCEPTION', 'APPROVED', 'REJECTED', 'LOCKED');

-- CreateTable
CREATE TABLE "AttendancePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AttendancePolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "timezone" TEXT,
    "allowWebClockIn" BOOLEAN NOT NULL DEFAULT true,
    "allowMobileClockIn" BOOLEAN NOT NULL DEFAULT true,
    "allowKioskClockIn" BOOLEAN NOT NULL DEFAULT true,
    "requireScheduleForClockIn" BOOLEAN NOT NULL DEFAULT false,
    "requireLocationCapture" BOOLEAN NOT NULL DEFAULT false,
    "allowManualAdjustments" BOOLEAN NOT NULL DEFAULT true,
    "autoCreateTimesheetEntries" BOOLEAN NOT NULL DEFAULT true,
    "graceMinutesLate" INTEGER NOT NULL DEFAULT 5,
    "graceMinutesEarlyLeave" INTEGER NOT NULL DEFAULT 5,
    "roundingMinutes" INTEGER,
    "maxShiftMinutes" INTEGER NOT NULL DEFAULT 960,
    "dailyOvertimeMinutes" INTEGER,
    "weeklyOvertimeMinutes" INTEGER,
    "breakRequiredAfterMinutes" INTEGER,
    "breakDurationMinutes" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "scheduleAssignmentId" TEXT,
    "policyId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "scheduledStartAt" TIMESTAMP(3),
    "scheduledEndAt" TIMESTAMP(3),
    "actualClockInAt" TIMESTAMP(3),
    "actualClockOutAt" TIMESTAMP(3),
    "firstPunchAt" TIMESTAMP(3),
    "lastPunchAt" TIMESTAMP(3),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "scheduledMinutes" INTEGER NOT NULL DEFAULT 0,
    "actualMinutes" INTEGER NOT NULL DEFAULT 0,
    "payableMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceRecordStatus" NOT NULL DEFAULT 'OPEN',
    "source" "AttendanceSource" NOT NULL DEFAULT 'WEB',
    "timezone" TEXT,
    "locationName" TEXT,
    "deviceId" TEXT,
    "ipAddress" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendancePunch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceRecordId" TEXT,
    "scheduleAssignmentId" TEXT,
    "type" "AttendancePunchType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "source" "AttendanceSource" NOT NULL DEFAULT 'WEB',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationName" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendancePunch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceBreak" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceRecordId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "source" "AttendanceSource" NOT NULL DEFAULT 'WEB',
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceBreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceRecordId" TEXT,
    "scheduleAssignmentId" TEXT,
    "type" "AttendanceExceptionType" NOT NULL,
    "status" "AttendanceExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceTimesheet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "policyId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceTimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "regularMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceTimesheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceTimesheetEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "timesheetId" TEXT,
    "employeeId" TEXT NOT NULL,
    "attendanceRecordId" TEXT,
    "scheduleAssignmentId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceTimesheetEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledMinutes" INTEGER NOT NULL DEFAULT 0,
    "actualMinutes" INTEGER NOT NULL DEFAULT 0,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "payableMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceTimesheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendancePolicy_tenantId_code_key" ON "AttendancePolicy"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AttendancePolicy_tenantId_status_idx" ON "AttendancePolicy"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AttendanceRecord_tenantId_workDate_idx" ON "AttendanceRecord"("tenantId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceRecord_employeeId_workDate_idx" ON "AttendanceRecord"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceRecord_scheduleAssignmentId_idx" ON "AttendanceRecord"("scheduleAssignmentId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_policyId_idx" ON "AttendanceRecord"("policyId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_tenantId_status_idx" ON "AttendanceRecord"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AttendancePunch_tenantId_occurredAt_idx" ON "AttendancePunch"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "AttendancePunch_employeeId_occurredAt_idx" ON "AttendancePunch"("employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "AttendancePunch_attendanceRecordId_idx" ON "AttendancePunch"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "AttendancePunch_scheduleAssignmentId_idx" ON "AttendancePunch"("scheduleAssignmentId");

-- CreateIndex
CREATE INDEX "AttendanceBreak_tenantId_startedAt_idx" ON "AttendanceBreak"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "AttendanceBreak_employeeId_startedAt_idx" ON "AttendanceBreak"("employeeId", "startedAt");

-- CreateIndex
CREATE INDEX "AttendanceBreak_attendanceRecordId_idx" ON "AttendanceBreak"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "AttendanceException_tenantId_status_idx" ON "AttendanceException"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AttendanceException_tenantId_type_idx" ON "AttendanceException"("tenantId", "type");

-- CreateIndex
CREATE INDEX "AttendanceException_employeeId_occurredAt_idx" ON "AttendanceException"("employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "AttendanceException_attendanceRecordId_idx" ON "AttendanceException"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "AttendanceException_scheduleAssignmentId_idx" ON "AttendanceException"("scheduleAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceTimesheet_tenantId_employeeId_periodStart_periodEnd_key" ON "AttendanceTimesheet"("tenantId", "employeeId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "AttendanceTimesheet_tenantId_status_idx" ON "AttendanceTimesheet"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AttendanceTimesheet_employeeId_periodStart_idx" ON "AttendanceTimesheet"("employeeId", "periodStart");

-- CreateIndex
CREATE INDEX "AttendanceTimesheet_policyId_idx" ON "AttendanceTimesheet"("policyId");

-- CreateIndex
CREATE INDEX "AttendanceTimesheetEntry_tenantId_workDate_idx" ON "AttendanceTimesheetEntry"("tenantId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceTimesheetEntry_timesheetId_idx" ON "AttendanceTimesheetEntry"("timesheetId");

-- CreateIndex
CREATE INDEX "AttendanceTimesheetEntry_employeeId_workDate_idx" ON "AttendanceTimesheetEntry"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceTimesheetEntry_attendanceRecordId_idx" ON "AttendanceTimesheetEntry"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "AttendanceTimesheetEntry_scheduleAssignmentId_idx" ON "AttendanceTimesheetEntry"("scheduleAssignmentId");

-- CreateIndex
CREATE INDEX "AttendanceTimesheetEntry_tenantId_status_idx" ON "AttendanceTimesheetEntry"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "AttendancePolicy" ADD CONSTRAINT "AttendancePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_scheduleAssignmentId_fkey" FOREIGN KEY ("scheduleAssignmentId") REFERENCES "ScheduleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AttendancePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_scheduleAssignmentId_fkey" FOREIGN KEY ("scheduleAssignmentId") REFERENCES "ScheduleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_scheduleAssignmentId_fkey" FOREIGN KEY ("scheduleAssignmentId") REFERENCES "ScheduleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceTimesheet" ADD CONSTRAINT "AttendanceTimesheet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceTimesheet" ADD CONSTRAINT "AttendanceTimesheet_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceTimesheet" ADD CONSTRAINT "AttendanceTimesheet_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AttendancePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceTimesheetEntry" ADD CONSTRAINT "AttendanceTimesheetEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceTimesheetEntry" ADD CONSTRAINT "AttendanceTimesheetEntry_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "AttendanceTimesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceTimesheetEntry" ADD CONSTRAINT "AttendanceTimesheetEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceTimesheetEntry" ADD CONSTRAINT "AttendanceTimesheetEntry_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceTimesheetEntry" ADD CONSTRAINT "AttendanceTimesheetEntry_scheduleAssignmentId_fkey" FOREIGN KEY ("scheduleAssignmentId") REFERENCES "ScheduleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
