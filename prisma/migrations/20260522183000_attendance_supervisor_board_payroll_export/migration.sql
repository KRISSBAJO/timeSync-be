-- Supervisor attendance board support plus auditable payroll lock/export ledger.
CREATE TYPE "AttendancePayrollExportStatus" AS ENUM ('GENERATED', 'LOCKED', 'SUPERSEDED');

ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'PAYROLL_PERIOD_LOCKED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'PAYROLL_EXPORT_GENERATED';

CREATE TABLE "AttendancePayrollExport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT,
    "status" "AttendancePayrollExportStatus" NOT NULL DEFAULT 'GENERATED',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'CSV',
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "regularMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "grossPayableMinutes" INTEGER NOT NULL DEFAULT 0,
    "lockedTimesheetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "exportedById" TEXT,
    "lockedById" TEXT,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePayrollExport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendancePayrollExport_tenantId_periodStart_periodEnd_idx" ON "AttendancePayrollExport"("tenantId", "periodStart", "periodEnd");
CREATE INDEX "AttendancePayrollExport_tenantId_status_idx" ON "AttendancePayrollExport"("tenantId", "status");
CREATE INDEX "AttendancePayrollExport_employeeId_idx" ON "AttendancePayrollExport"("employeeId");
CREATE INDEX "AttendancePayrollExport_exportedById_idx" ON "AttendancePayrollExport"("exportedById");
CREATE INDEX "AttendancePayrollExport_lockedById_idx" ON "AttendancePayrollExport"("lockedById");

ALTER TABLE "AttendancePayrollExport" ADD CONSTRAINT "AttendancePayrollExport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendancePayrollExport" ADD CONSTRAINT "AttendancePayrollExport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendancePayrollExport" ADD CONSTRAINT "AttendancePayrollExport_exportedById_fkey" FOREIGN KEY ("exportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendancePayrollExport" ADD CONSTRAINT "AttendancePayrollExport_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
