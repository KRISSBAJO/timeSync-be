-- CreateEnum
CREATE TYPE "EmployeeImportJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmployeeImportRowStatus" AS ENUM ('PENDING', 'PROCESSING', 'CREATED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "EmployeeImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "status" "EmployeeImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "csv" TEXT NOT NULL,
    "metadata" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeImportJobRow" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "status" "EmployeeImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "normalized" JSONB NOT NULL,
    "errors" JSONB,
    "employeeId" TEXT,
    "personId" TEXT,
    "employeeNumber" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeImportJobRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeImportJob_tenantId_status_createdAt_idx" ON "EmployeeImportJob"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeImportJob_status_lockedAt_idx" ON "EmployeeImportJob"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "EmployeeImportJob_actorUserId_idx" ON "EmployeeImportJob"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeImportJobRow_jobId_line_key" ON "EmployeeImportJobRow"("jobId", "line");

-- CreateIndex
CREATE INDEX "EmployeeImportJobRow_jobId_status_idx" ON "EmployeeImportJobRow"("jobId", "status");

-- CreateIndex
CREATE INDEX "EmployeeImportJobRow_tenantId_status_idx" ON "EmployeeImportJobRow"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "EmployeeImportJob" ADD CONSTRAINT "EmployeeImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeImportJobRow" ADD CONSTRAINT "EmployeeImportJobRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "EmployeeImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
