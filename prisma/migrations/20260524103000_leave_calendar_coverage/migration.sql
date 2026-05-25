-- CreateEnum
CREATE TYPE "LeaveCalendarDayType" AS ENUM ('HOLIDAY', 'NON_WORKING_DAY', 'SPECIAL_WORKDAY');

-- CreateEnum
CREATE TYPE "LeaveBlackoutSeverity" AS ENUM ('WARN', 'BLOCK');

-- Timeline parity
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'LEAVE_CALENDAR_UPDATED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'LEAVE_COVERAGE_RISK_FLAGGED';

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN "calendarId" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "businessMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaveRequest" ADD COLUMN "calendarSnapshot" JSONB;
ALTER TABLE "LeaveRequest" ADD COLUMN "coverageSnapshot" JSONB;

-- CreateTable
CREATE TABLE "LeaveCalendar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT,
    "status" "LeavePolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "workWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::INTEGER[],
    "defaultWorkdayMinutes" INTEGER NOT NULL DEFAULT 480,
    "organizationNodeId" TEXT,
    "costCenterId" TEXT,
    "positionId" TEXT,
    "countryCode" TEXT,
    "regionCode" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveCalendarDay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LeaveCalendarDayType" NOT NULL DEFAULT 'HOLIDAY',
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "workdayMinutes" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveCalendarDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBlackoutWindow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "calendarId" TEXT,
    "leaveTypeId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "severity" "LeaveBlackoutSeverity" NOT NULL DEFAULT 'BLOCK',
    "organizationNodeId" TEXT,
    "costCenterId" TEXT,
    "positionId" TEXT,
    "status" "LeavePolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveBlackoutWindow_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "LeaveCalendar_tenantId_code_key" ON "LeaveCalendar"("tenantId", "code");
CREATE INDEX "LeaveCalendar_tenantId_status_idx" ON "LeaveCalendar"("tenantId", "status");
CREATE INDEX "LeaveCalendar_tenantId_isDefault_idx" ON "LeaveCalendar"("tenantId", "isDefault");
CREATE INDEX "LeaveCalendar_organizationNodeId_idx" ON "LeaveCalendar"("organizationNodeId");
CREATE INDEX "LeaveCalendar_costCenterId_idx" ON "LeaveCalendar"("costCenterId");
CREATE INDEX "LeaveCalendar_positionId_idx" ON "LeaveCalendar"("positionId");

CREATE UNIQUE INDEX "LeaveCalendarDay_calendarId_date_key" ON "LeaveCalendarDay"("calendarId", "date");
CREATE INDEX "LeaveCalendarDay_tenantId_date_idx" ON "LeaveCalendarDay"("tenantId", "date");
CREATE INDEX "LeaveCalendarDay_calendarId_type_idx" ON "LeaveCalendarDay"("calendarId", "type");

CREATE UNIQUE INDEX "LeaveBlackoutWindow_tenantId_code_key" ON "LeaveBlackoutWindow"("tenantId", "code");
CREATE INDEX "LeaveBlackoutWindow_tenantId_status_idx" ON "LeaveBlackoutWindow"("tenantId", "status");
CREATE INDEX "LeaveBlackoutWindow_tenantId_startsAt_endsAt_idx" ON "LeaveBlackoutWindow"("tenantId", "startsAt", "endsAt");
CREATE INDEX "LeaveBlackoutWindow_calendarId_idx" ON "LeaveBlackoutWindow"("calendarId");
CREATE INDEX "LeaveBlackoutWindow_leaveTypeId_idx" ON "LeaveBlackoutWindow"("leaveTypeId");
CREATE INDEX "LeaveBlackoutWindow_organizationNodeId_idx" ON "LeaveBlackoutWindow"("organizationNodeId");
CREATE INDEX "LeaveBlackoutWindow_costCenterId_idx" ON "LeaveBlackoutWindow"("costCenterId");
CREATE INDEX "LeaveBlackoutWindow_positionId_idx" ON "LeaveBlackoutWindow"("positionId");

CREATE INDEX "LeaveRequest_calendarId_idx" ON "LeaveRequest"("calendarId");

-- Foreign keys
ALTER TABLE "LeaveCalendar" ADD CONSTRAINT "LeaveCalendar_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveCalendarDay" ADD CONSTRAINT "LeaveCalendarDay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveCalendarDay" ADD CONSTRAINT "LeaveCalendarDay_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "LeaveCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveBlackoutWindow" ADD CONSTRAINT "LeaveBlackoutWindow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveBlackoutWindow" ADD CONSTRAINT "LeaveBlackoutWindow_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "LeaveCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveBlackoutWindow" ADD CONSTRAINT "LeaveBlackoutWindow_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "LeaveCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
