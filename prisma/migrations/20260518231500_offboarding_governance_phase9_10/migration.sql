-- CreateEnum
CREATE TYPE "EmployeeExitRecordStatus" AS ENUM ('DRAFT', 'ACTIVE', 'READY_FOR_SEPARATION', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmployeeClearanceType" AS ENUM ('ASSET', 'ACCESS', 'DOCUMENT', 'KNOWLEDGE_TRANSFER', 'FINANCE', 'BENEFITS', 'FACILITIES', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeClearanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLEARED', 'BLOCKED', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmployeeRehirePolicy" AS ENUM ('SAME_EMPLOYEE_RECORD', 'NEW_EMPLOYMENT_RECORD');

-- CreateEnum
CREATE TYPE "EmployeeRehireRecordStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "EmployeeExitRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "lifecyclePlanId" TEXT,
    "status" "EmployeeExitRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "separationType" TEXT,
    "separationReason" TEXT,
    "noticeDate" TIMESTAMP(3),
    "lastWorkingDate" TIMESTAMP(3),
    "separationDate" TIMESTAMP(3),
    "eligibleForRehire" BOOLEAN,
    "rehireRecommendation" TEXT,
    "exitInterviewCompleted" BOOLEAN NOT NULL DEFAULT false,
    "finalDocumentCollectionStatus" "EmployeeClearanceStatus" NOT NULL DEFAULT 'OPEN',
    "assetClearanceStatus" "EmployeeClearanceStatus" NOT NULL DEFAULT 'OPEN',
    "accessClearanceStatus" "EmployeeClearanceStatus" NOT NULL DEFAULT 'OPEN',
    "accessCutoffAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeExitRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeClearanceItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exitRecordId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EmployeeClearanceType" NOT NULL,
    "status" "EmployeeClearanceStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerUserId" TEXT,
    "ownerEmployeeId" TEXT,
    "assetTag" TEXT,
    "systemName" TEXT,
    "dueAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "clearedById" TEXT,
    "blockedReason" TEXT,
    "evidence" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeClearanceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeRehireRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "exitRecordId" TEXT,
    "newEmployeeId" TEXT,
    "policy" "EmployeeRehirePolicy" NOT NULL DEFAULT 'SAME_EMPLOYEE_RECORD',
    "status" "EmployeeRehireRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveDate" TIMESTAMP(3),
    "reason" TEXT,
    "decisionNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeRehireRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeExitRecord_tenantId_employeeId_idx" ON "EmployeeExitRecord"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeExitRecord_tenantId_status_idx" ON "EmployeeExitRecord"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EmployeeExitRecord_lifecyclePlanId_idx" ON "EmployeeExitRecord"("lifecyclePlanId");

-- CreateIndex
CREATE INDEX "EmployeeExitRecord_completedById_idx" ON "EmployeeExitRecord"("completedById");

-- CreateIndex
CREATE INDEX "EmployeeExitRecord_createdById_idx" ON "EmployeeExitRecord"("createdById");

-- CreateIndex
CREATE INDEX "EmployeeExitRecord_updatedById_idx" ON "EmployeeExitRecord"("updatedById");

-- CreateIndex
CREATE INDEX "EmployeeClearanceItem_tenantId_employeeId_idx" ON "EmployeeClearanceItem"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeClearanceItem_exitRecordId_status_idx" ON "EmployeeClearanceItem"("exitRecordId", "status");

-- CreateIndex
CREATE INDEX "EmployeeClearanceItem_type_status_idx" ON "EmployeeClearanceItem"("type", "status");

-- CreateIndex
CREATE INDEX "EmployeeClearanceItem_ownerUserId_idx" ON "EmployeeClearanceItem"("ownerUserId");

-- CreateIndex
CREATE INDEX "EmployeeClearanceItem_ownerEmployeeId_idx" ON "EmployeeClearanceItem"("ownerEmployeeId");

-- CreateIndex
CREATE INDEX "EmployeeClearanceItem_clearedById_idx" ON "EmployeeClearanceItem"("clearedById");

-- CreateIndex
CREATE INDEX "EmployeeRehireRecord_tenantId_employeeId_idx" ON "EmployeeRehireRecord"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeRehireRecord_tenantId_status_idx" ON "EmployeeRehireRecord"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EmployeeRehireRecord_exitRecordId_idx" ON "EmployeeRehireRecord"("exitRecordId");

-- CreateIndex
CREATE INDEX "EmployeeRehireRecord_newEmployeeId_idx" ON "EmployeeRehireRecord"("newEmployeeId");

-- CreateIndex
CREATE INDEX "EmployeeRehireRecord_approvedById_idx" ON "EmployeeRehireRecord"("approvedById");

-- CreateIndex
CREATE INDEX "EmployeeRehireRecord_createdById_idx" ON "EmployeeRehireRecord"("createdById");

-- AddForeignKey
ALTER TABLE "EmployeeExitRecord" ADD CONSTRAINT "EmployeeExitRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExitRecord" ADD CONSTRAINT "EmployeeExitRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExitRecord" ADD CONSTRAINT "EmployeeExitRecord_lifecyclePlanId_fkey" FOREIGN KEY ("lifecyclePlanId") REFERENCES "EmployeeLifecyclePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExitRecord" ADD CONSTRAINT "EmployeeExitRecord_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExitRecord" ADD CONSTRAINT "EmployeeExitRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExitRecord" ADD CONSTRAINT "EmployeeExitRecord_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeClearanceItem" ADD CONSTRAINT "EmployeeClearanceItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeClearanceItem" ADD CONSTRAINT "EmployeeClearanceItem_exitRecordId_fkey" FOREIGN KEY ("exitRecordId") REFERENCES "EmployeeExitRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeClearanceItem" ADD CONSTRAINT "EmployeeClearanceItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeClearanceItem" ADD CONSTRAINT "EmployeeClearanceItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeClearanceItem" ADD CONSTRAINT "EmployeeClearanceItem_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeClearanceItem" ADD CONSTRAINT "EmployeeClearanceItem_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRehireRecord" ADD CONSTRAINT "EmployeeRehireRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRehireRecord" ADD CONSTRAINT "EmployeeRehireRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRehireRecord" ADD CONSTRAINT "EmployeeRehireRecord_exitRecordId_fkey" FOREIGN KEY ("exitRecordId") REFERENCES "EmployeeExitRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRehireRecord" ADD CONSTRAINT "EmployeeRehireRecord_newEmployeeId_fkey" FOREIGN KEY ("newEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRehireRecord" ADD CONSTRAINT "EmployeeRehireRecord_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRehireRecord" ADD CONSTRAINT "EmployeeRehireRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
