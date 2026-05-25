CREATE TYPE "DemoRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DISMISSED');

CREATE TABLE "DemoRequest" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "workEmail" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "phone" TEXT,
    "companySize" TEXT,
    "industry" TEXT,
    "country" TEXT,
    "message" TEXT,
    "source" TEXT,
    "status" "DemoRequestStatus" NOT NULL DEFAULT 'NEW',
    "metadata" JSONB,
    "contactedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemoRequest_status_createdAt_idx" ON "DemoRequest"("status", "createdAt");
CREATE INDEX "DemoRequest_workEmail_idx" ON "DemoRequest"("workEmail");
CREATE INDEX "DemoRequest_companyName_idx" ON "DemoRequest"("companyName");
