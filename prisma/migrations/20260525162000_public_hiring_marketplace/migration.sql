-- CreateEnum
CREATE TYPE "RecruitmentTalentProfileStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'ARCHIVED');

-- CreateTable
CREATE TABLE "RecruitmentTalentProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "desiredTitle" TEXT,
    "currentTitle" TEXT,
    "currentEmployer" TEXT,
    "locationName" TEXT,
    "workModes" "RecruitmentWorkMode"[] DEFAULT ARRAY[]::"RecruitmentWorkMode"[],
    "employmentTypes" "RecruitmentEmploymentType"[] DEFAULT ARRAY[]::"RecruitmentEmploymentType"[],
    "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "resumeUrl" TEXT,
    "portfolioUrl" TEXT,
    "availabilityNote" TEXT,
    "source" TEXT,
    "status" "RecruitmentTalentProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RecruitmentTalentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentTalentProfile_email_key" ON "RecruitmentTalentProfile"("email");

-- CreateIndex
CREATE INDEX "RecruitmentTalentProfile_tenantId_status_idx" ON "RecruitmentTalentProfile"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RecruitmentTalentProfile_status_idx" ON "RecruitmentTalentProfile"("status");

-- CreateIndex
CREATE INDEX "RecruitmentTalentProfile_locationName_idx" ON "RecruitmentTalentProfile"("locationName");

-- CreateIndex
CREATE INDEX "RecruitmentTalentProfile_createdAt_idx" ON "RecruitmentTalentProfile"("createdAt");

-- AddForeignKey
ALTER TABLE "RecruitmentTalentProfile" ADD CONSTRAINT "RecruitmentTalentProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
