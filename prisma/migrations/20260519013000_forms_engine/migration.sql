-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FormQuestionType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'YES_NO', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'DROPDOWN', 'RATING');

-- CreateEnum
CREATE TYPE "FormAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'CANCELLED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'FORM_ASSIGNED';
ALTER TYPE "TimelineEventType" ADD VALUE IF NOT EXISTS 'FORM_SUBMITTED';

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "allowMultipleResponses" BOOLEAN NOT NULL DEFAULT false,
    "closesAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormQuestion" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "FormQuestionType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "validation" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "employeeId" TEXT,
    "userId" TEXT,
    "assignedById" TEXT,
    "status" "FormAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "dueAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "employeeId" TEXT,
    "userId" TEXT,
    "respondentEmail" TEXT,
    "answers" JSONB NOT NULL,
    "metadata" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Form_tenantId_code_key" ON "Form"("tenantId", "code");
CREATE INDEX "Form_tenantId_status_idx" ON "Form"("tenantId", "status");
CREATE INDEX "Form_createdById_idx" ON "Form"("createdById");
CREATE INDEX "Form_updatedById_idx" ON "Form"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "FormQuestion_formId_order_key" ON "FormQuestion"("formId", "order");
CREATE INDEX "FormQuestion_formId_idx" ON "FormQuestion"("formId");
CREATE INDEX "FormQuestion_type_idx" ON "FormQuestion"("type");

-- CreateIndex
CREATE INDEX "FormAssignment_tenantId_status_idx" ON "FormAssignment"("tenantId", "status");
CREATE INDEX "FormAssignment_formId_status_idx" ON "FormAssignment"("formId", "status");
CREATE INDEX "FormAssignment_employeeId_idx" ON "FormAssignment"("employeeId");
CREATE INDEX "FormAssignment_userId_idx" ON "FormAssignment"("userId");
CREATE INDEX "FormAssignment_assignedById_idx" ON "FormAssignment"("assignedById");

-- CreateIndex
CREATE INDEX "FormResponse_tenantId_submittedAt_idx" ON "FormResponse"("tenantId", "submittedAt");
CREATE INDEX "FormResponse_formId_submittedAt_idx" ON "FormResponse"("formId", "submittedAt");
CREATE INDEX "FormResponse_assignmentId_idx" ON "FormResponse"("assignmentId");
CREATE INDEX "FormResponse_employeeId_idx" ON "FormResponse"("employeeId");
CREATE INDEX "FormResponse_userId_idx" ON "FormResponse"("userId");

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Form" ADD CONSTRAINT "Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Form" ADD CONSTRAINT "Form_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormQuestion" ADD CONSTRAINT "FormQuestion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormAssignment" ADD CONSTRAINT "FormAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormAssignment" ADD CONSTRAINT "FormAssignment_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormAssignment" ADD CONSTRAINT "FormAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormAssignment" ADD CONSTRAINT "FormAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormAssignment" ADD CONSTRAINT "FormAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "FormAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
