-- CreateEnum
CREATE TYPE "EmployeeReferenceStatus" AS ENUM ('PENDING', 'CONTACTED', 'VERIFIED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PayoutAccountStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkEligibilityStatus" AS ENUM ('NOT_REVIEWED', 'PENDING_REVIEW', 'AUTHORIZED', 'EXPIRING_SOON', 'EXPIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "EmployeeDependent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "phone" TEXT,
    "email" TEXT,
    "address" JSONB,
    "taxDependent" BOOLEAN NOT NULL DEFAULT false,
    "benefitEligible" BOOLEAN NOT NULL DEFAULT false,
    "isStudent" BOOLEAN NOT NULL DEFAULT false,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeDependent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeReference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "yearsKnown" DOUBLE PRECISION,
    "status" "EmployeeReferenceStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePayoutAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountType" TEXT,
    "countryId" TEXT,
    "currencyCode" TEXT,
    "accountNumberLast4" TEXT,
    "routingNumberLast4" TEXT,
    "ibanLast4" TEXT,
    "swiftCode" TEXT,
    "accountFingerprint" TEXT,
    "routingFingerprint" TEXT,
    "allocationPercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "status" "PayoutAccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeePayoutAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWorkEligibility" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "WorkEligibilityStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "workCountryId" TEXT,
    "taxCountryId" TEXT,
    "workPermitRequired" BOOLEAN NOT NULL DEFAULT false,
    "permitType" TEXT,
    "permitNumber" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeWorkEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeDependent_tenantId_employeeId_idx" ON "EmployeeDependent"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDependent_employeeId_deletedAt_idx" ON "EmployeeDependent"("employeeId", "deletedAt");

-- CreateIndex
CREATE INDEX "EmployeeReference_tenantId_employeeId_idx" ON "EmployeeReference"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeReference_employeeId_status_idx" ON "EmployeeReference"("employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeReference_verifiedById_idx" ON "EmployeeReference"("verifiedById");

-- CreateIndex
CREATE INDEX "EmployeePayoutAccount_tenantId_employeeId_idx" ON "EmployeePayoutAccount"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeePayoutAccount_employeeId_status_idx" ON "EmployeePayoutAccount"("employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeePayoutAccount_countryId_idx" ON "EmployeePayoutAccount"("countryId");

-- CreateIndex
CREATE INDEX "EmployeePayoutAccount_verifiedById_idx" ON "EmployeePayoutAccount"("verifiedById");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeWorkEligibility_employeeId_key" ON "EmployeeWorkEligibility"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeWorkEligibility_tenantId_idx" ON "EmployeeWorkEligibility"("tenantId");

-- CreateIndex
CREATE INDEX "EmployeeWorkEligibility_workCountryId_idx" ON "EmployeeWorkEligibility"("workCountryId");

-- CreateIndex
CREATE INDEX "EmployeeWorkEligibility_taxCountryId_idx" ON "EmployeeWorkEligibility"("taxCountryId");

-- CreateIndex
CREATE INDEX "EmployeeWorkEligibility_verifiedById_idx" ON "EmployeeWorkEligibility"("verifiedById");

-- AddForeignKey
ALTER TABLE "EmployeeDependent" ADD CONSTRAINT "EmployeeDependent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDependent" ADD CONSTRAINT "EmployeeDependent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReference" ADD CONSTRAINT "EmployeeReference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReference" ADD CONSTRAINT "EmployeeReference_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReference" ADD CONSTRAINT "EmployeeReference_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayoutAccount" ADD CONSTRAINT "EmployeePayoutAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayoutAccount" ADD CONSTRAINT "EmployeePayoutAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayoutAccount" ADD CONSTRAINT "EmployeePayoutAccount_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayoutAccount" ADD CONSTRAINT "EmployeePayoutAccount_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkEligibility" ADD CONSTRAINT "EmployeeWorkEligibility_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkEligibility" ADD CONSTRAINT "EmployeeWorkEligibility_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkEligibility" ADD CONSTRAINT "EmployeeWorkEligibility_workCountryId_fkey" FOREIGN KEY ("workCountryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkEligibility" ADD CONSTRAINT "EmployeeWorkEligibility_taxCountryId_fkey" FOREIGN KEY ("taxCountryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkEligibility" ADD CONSTRAINT "EmployeeWorkEligibility_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
