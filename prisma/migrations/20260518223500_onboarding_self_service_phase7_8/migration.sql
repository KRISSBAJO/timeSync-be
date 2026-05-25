-- CreateEnum
CREATE TYPE "EmployeeLifecycleTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "EmployeeLifecycleTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "EmployeeLifecyclePlanType" NOT NULL,
    "status" "EmployeeLifecycleTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "targetDays" INTEGER,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeLifecycleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLifecycleTemplateTask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "ownerType" "EmployeeLifecycleTaskOwnerType" NOT NULL DEFAULT 'HR',
    "priority" "EmployeeLifecycleTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dueOffsetDays" INTEGER,
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "documentTypeId" TEXT,
    "instructions" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeLifecycleTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeLifecycleTemplate_tenantId_code_key" ON "EmployeeLifecycleTemplate"("tenantId", "code");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTemplate_tenantId_status_idx" ON "EmployeeLifecycleTemplate"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTemplate_type_idx" ON "EmployeeLifecycleTemplate"("type");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTemplate_createdById_idx" ON "EmployeeLifecycleTemplate"("createdById");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTemplate_updatedById_idx" ON "EmployeeLifecycleTemplate"("updatedById");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTemplateTask_templateId_sortOrder_idx" ON "EmployeeLifecycleTemplateTask"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTemplateTask_ownerType_idx" ON "EmployeeLifecycleTemplateTask"("ownerType");

-- CreateIndex
CREATE INDEX "EmployeeLifecycleTemplateTask_documentTypeId_idx" ON "EmployeeLifecycleTemplateTask"("documentTypeId");

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTemplate" ADD CONSTRAINT "EmployeeLifecycleTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTemplate" ADD CONSTRAINT "EmployeeLifecycleTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTemplate" ADD CONSTRAINT "EmployeeLifecycleTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTemplateTask" ADD CONSTRAINT "EmployeeLifecycleTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmployeeLifecycleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLifecycleTemplateTask" ADD CONSTRAINT "EmployeeLifecycleTemplateTask_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
