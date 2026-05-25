-- CreateEnum
CREATE TYPE "RecruitmentPostingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "RecruitmentJobPosting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "requirements" TEXT,
    "departmentName" TEXT,
    "locationName" TEXT,
    "employmentType" "RecruitmentEmploymentType",
    "workMode" "RecruitmentWorkMode",
    "salaryMinCents" INTEGER,
    "salaryMaxCents" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "status" "RecruitmentPostingStatus" NOT NULL DEFAULT 'DRAFT',
    "internalOnly" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "applyBy" TIMESTAMP(3),
    "questionSet" JSONB,
    "consentText" TEXT,
    "sourceLabel" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RecruitmentJobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentJobPosting_requisitionId_key" ON "RecruitmentJobPosting"("requisitionId");

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentJobPosting_tenantId_slug_key" ON "RecruitmentJobPosting"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "RecruitmentJobPosting_tenantId_status_idx" ON "RecruitmentJobPosting"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RecruitmentJobPosting_publishedAt_idx" ON "RecruitmentJobPosting"("publishedAt");

-- CreateIndex
CREATE INDEX "RecruitmentJobPosting_expiresAt_idx" ON "RecruitmentJobPosting"("expiresAt");

-- AddForeignKey
ALTER TABLE "RecruitmentJobPosting" ADD CONSTRAINT "RecruitmentJobPosting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentJobPosting" ADD CONSTRAINT "RecruitmentJobPosting_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "RecruitmentRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
