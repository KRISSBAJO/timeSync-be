-- CreateTable
CREATE TABLE "PersonDemographicProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "pronouns" TEXT,
    "preferredLanguageCode" TEXT,
    "ethnicity" TEXT,
    "religion" TEXT,
    "demographicCountryId" TEXT,
    "disabilityAccommodation" TEXT,
    "veteranCategory" TEXT,
    "consentGivenAt" TIMESTAMP(3),
    "consentWithdrawnAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonDemographicProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonDemographicProfile_personId_key" ON "PersonDemographicProfile"("personId");

-- CreateIndex
CREATE INDEX "PersonDemographicProfile_tenantId_idx" ON "PersonDemographicProfile"("tenantId");

-- CreateIndex
CREATE INDEX "PersonDemographicProfile_demographicCountryId_idx" ON "PersonDemographicProfile"("demographicCountryId");

-- CreateIndex
CREATE INDEX "PersonDemographicProfile_verifiedById_idx" ON "PersonDemographicProfile"("verifiedById");

-- AddForeignKey
ALTER TABLE "PersonDemographicProfile" ADD CONSTRAINT "PersonDemographicProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDemographicProfile" ADD CONSTRAINT "PersonDemographicProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDemographicProfile" ADD CONSTRAINT "PersonDemographicProfile_demographicCountryId_fkey" FOREIGN KEY ("demographicCountryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDemographicProfile" ADD CONSTRAINT "PersonDemographicProfile_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
