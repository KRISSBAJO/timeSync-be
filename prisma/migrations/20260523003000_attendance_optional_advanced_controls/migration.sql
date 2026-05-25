-- Optional advanced attendance controls: attestation, kiosk credentials, offline sync, premiums, and reconciliation support.
CREATE TYPE "AttendanceKioskCredentialStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');
CREATE TYPE "AttendanceOfflinePunchStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'DUPLICATE');
CREATE TYPE "AttendancePremiumRuleType" AS ENUM ('HOLIDAY', 'WEEKEND', 'NIGHT', 'SHIFT_DIFFERENTIAL', 'CUSTOM');

ALTER TABLE "AttendancePolicy"
  ADD COLUMN "requirePhotoAttestation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireAttestationNote" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowOfflinePunchSync" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "offlinePunchGraceMinutes" INTEGER NOT NULL DEFAULT 1440;

CREATE TABLE "AttendanceKioskCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "badgeNumber" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "status" "AttendanceKioskCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceKioskCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceOfflinePunch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "appliedPunchId" TEXT,
    "clientMutationId" TEXT NOT NULL,
    "type" "AttendancePunchType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" "AttendanceSource" NOT NULL DEFAULT 'WEB',
    "status" "AttendanceOfflinePunchStatus" NOT NULL DEFAULT 'PENDING',
    "deviceId" TEXT,
    "payload" JSONB NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceOfflinePunch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceHoliday" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceControlStatus" NOT NULL DEFAULT 'ACTIVE',
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceHoliday_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendancePremiumRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AttendancePremiumRuleType" NOT NULL,
    "status" "AttendanceControlStatus" NOT NULL DEFAULT 'ACTIVE',
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "startsAtMinute" INTEGER,
    "endsAtMinute" INTEGER,
    "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "organizationNodeId" TEXT,
    "costCenterId" TEXT,
    "positionId" TEXT,
    "locationName" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AttendancePremiumRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceKioskCredential_tenantId_badgeNumber_key" ON "AttendanceKioskCredential"("tenantId", "badgeNumber");
CREATE INDEX "AttendanceKioskCredential_tenantId_status_idx" ON "AttendanceKioskCredential"("tenantId", "status");
CREATE INDEX "AttendanceKioskCredential_employeeId_idx" ON "AttendanceKioskCredential"("employeeId");
CREATE INDEX "AttendanceKioskCredential_expiresAt_idx" ON "AttendanceKioskCredential"("expiresAt");

CREATE UNIQUE INDEX "AttendanceOfflinePunch_tenantId_clientMutationId_key" ON "AttendanceOfflinePunch"("tenantId", "clientMutationId");
CREATE INDEX "AttendanceOfflinePunch_tenantId_status_idx" ON "AttendanceOfflinePunch"("tenantId", "status");
CREATE INDEX "AttendanceOfflinePunch_employeeId_occurredAt_idx" ON "AttendanceOfflinePunch"("employeeId", "occurredAt");
CREATE INDEX "AttendanceOfflinePunch_appliedPunchId_idx" ON "AttendanceOfflinePunch"("appliedPunchId");

CREATE UNIQUE INDEX "AttendanceHoliday_tenantId_code_key" ON "AttendanceHoliday"("tenantId", "code");
CREATE INDEX "AttendanceHoliday_tenantId_date_idx" ON "AttendanceHoliday"("tenantId", "date");
CREATE INDEX "AttendanceHoliday_tenantId_status_idx" ON "AttendanceHoliday"("tenantId", "status");

CREATE UNIQUE INDEX "AttendancePremiumRule_tenantId_code_key" ON "AttendancePremiumRule"("tenantId", "code");
CREATE INDEX "AttendancePremiumRule_tenantId_status_idx" ON "AttendancePremiumRule"("tenantId", "status");
CREATE INDEX "AttendancePremiumRule_tenantId_type_idx" ON "AttendancePremiumRule"("tenantId", "type");
CREATE INDEX "AttendancePremiumRule_organizationNodeId_idx" ON "AttendancePremiumRule"("organizationNodeId");
CREATE INDEX "AttendancePremiumRule_costCenterId_idx" ON "AttendancePremiumRule"("costCenterId");
CREATE INDEX "AttendancePremiumRule_positionId_idx" ON "AttendancePremiumRule"("positionId");

ALTER TABLE "AttendanceKioskCredential" ADD CONSTRAINT "AttendanceKioskCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceKioskCredential" ADD CONSTRAINT "AttendanceKioskCredential_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceOfflinePunch" ADD CONSTRAINT "AttendanceOfflinePunch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceOfflinePunch" ADD CONSTRAINT "AttendanceOfflinePunch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceHoliday" ADD CONSTRAINT "AttendanceHoliday_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendancePremiumRule" ADD CONSTRAINT "AttendancePremiumRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
