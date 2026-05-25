-- Global identity and tenant membership layer.
-- Existing tenant-scoped User rows remain the authorization/profile boundary.

-- CreateTable
CREATE TABLE "Identity" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "type" "UserType" NOT NULL DEFAULT 'TENANT_USER',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastAccessedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "identityId" TEXT;
ALTER TABLE "Session" ADD COLUMN "identityId" TEXT;
ALTER TABLE "Session" ADD COLUMN "tenantMembershipId" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "identityId" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "tenantMembershipId" TEXT;
ALTER TABLE "Device" ADD COLUMN "identityId" TEXT;
ALTER TABLE "LoginHistory" ADD COLUMN "identityId" TEXT;

-- Backfill one global identity per normalized email.
WITH chosen_users AS (
    SELECT DISTINCT ON (LOWER("email"))
        LOWER("email") AS "email",
        "passwordHash",
        "status",
        "authProvider",
        "emailVerifiedAt",
        "lastLoginAt",
        "lockedUntil",
        "mfaEnabled",
        "mfaSecret",
        "metadata",
        "createdAt",
        "deletedAt"
    FROM "User"
    ORDER BY
        LOWER("email"),
        CASE WHEN "tenantId" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN "status" = 'ACTIVE' THEN 0 ELSE 1 END,
        COALESCE("lastLoginAt", "createdAt") DESC,
        "createdAt" ASC
)
INSERT INTO "Identity" (
    "id",
    "email",
    "passwordHash",
    "status",
    "authProvider",
    "emailVerifiedAt",
    "lastLoginAt",
    "lockedUntil",
    "mfaEnabled",
    "mfaSecret",
    "metadata",
    "createdAt",
    "updatedAt",
    "deletedAt"
)
SELECT
    gen_random_uuid()::text,
    "email",
    "passwordHash",
    "status",
    "authProvider",
    "emailVerifiedAt",
    "lastLoginAt",
    "lockedUntil",
    "mfaEnabled",
    "mfaSecret",
    COALESCE("metadata", '{}'::jsonb) || jsonb_build_object('identityMigratedAt', CURRENT_TIMESTAMP),
    "createdAt",
    CURRENT_TIMESTAMP,
    "deletedAt"
FROM chosen_users;

UPDATE "User" AS user_record
SET "identityId" = identity_record."id"
FROM "Identity" AS identity_record
WHERE LOWER(user_record."email") = identity_record."email";

WITH ranked_users AS (
    SELECT
        user_record.*,
        ROW_NUMBER() OVER (
            PARTITION BY user_record."identityId"
            ORDER BY
                CASE WHEN user_record."tenantId" IS NULL THEN 0 ELSE 1 END,
                CASE WHEN user_record."status" = 'ACTIVE' THEN 0 ELSE 1 END,
                COALESCE(user_record."lastLoginAt", user_record."createdAt") DESC,
                user_record."createdAt" ASC
        ) AS membership_rank
    FROM "User" AS user_record
    WHERE user_record."identityId" IS NOT NULL
)
INSERT INTO "TenantMembership" (
    "id",
    "identityId",
    "tenantId",
    "userId",
    "type",
    "status",
    "isDefault",
    "lastAccessedAt",
    "metadata",
    "createdAt",
    "updatedAt",
    "deletedAt"
)
SELECT
    gen_random_uuid()::text,
    "identityId",
    "tenantId",
    "id",
    "type",
    "status",
    membership_rank = 1,
    "lastLoginAt",
    COALESCE("metadata", '{}'::jsonb) || jsonb_build_object('membershipMigratedAt', CURRENT_TIMESTAMP),
    "createdAt",
    CURRENT_TIMESTAMP,
    "deletedAt"
FROM ranked_users;

UPDATE "Session" AS session_record
SET
    "identityId" = user_record."identityId",
    "tenantMembershipId" = membership_record."id"
FROM "User" AS user_record
JOIN "TenantMembership" AS membership_record ON membership_record."userId" = user_record."id"
WHERE session_record."userId" = user_record."id";

UPDATE "RefreshToken" AS token_record
SET
    "identityId" = user_record."identityId",
    "tenantMembershipId" = membership_record."id"
FROM "User" AS user_record
JOIN "TenantMembership" AS membership_record ON membership_record."userId" = user_record."id"
WHERE token_record."userId" = user_record."id";

UPDATE "Device" AS device_record
SET "identityId" = user_record."identityId"
FROM "User" AS user_record
WHERE device_record."userId" = user_record."id";

UPDATE "LoginHistory" AS login_record
SET "identityId" = user_record."identityId"
FROM "User" AS user_record
WHERE login_record."userId" = user_record."id";

-- CreateIndex
CREATE UNIQUE INDEX "Identity_email_key" ON "Identity"("email");
CREATE INDEX "Identity_email_idx" ON "Identity"("email");
CREATE INDEX "Identity_status_idx" ON "Identity"("status");

CREATE UNIQUE INDEX "TenantMembership_userId_key" ON "TenantMembership"("userId");
CREATE UNIQUE INDEX "TenantMembership_identityId_tenantId_key" ON "TenantMembership"("identityId", "tenantId");
CREATE INDEX "TenantMembership_identityId_idx" ON "TenantMembership"("identityId");
CREATE INDEX "TenantMembership_tenantId_idx" ON "TenantMembership"("tenantId");
CREATE INDEX "TenantMembership_identityId_status_idx" ON "TenantMembership"("identityId", "status");

CREATE INDEX "User_identityId_idx" ON "User"("identityId");
CREATE INDEX "Session_identityId_idx" ON "Session"("identityId");
CREATE INDEX "Session_tenantMembershipId_idx" ON "Session"("tenantMembershipId");
CREATE INDEX "RefreshToken_identityId_idx" ON "RefreshToken"("identityId");
CREATE INDEX "RefreshToken_tenantMembershipId_idx" ON "RefreshToken"("tenantMembershipId");
CREATE INDEX "Device_identityId_idx" ON "Device"("identityId");
CREATE INDEX "LoginHistory_identityId_createdAt_idx" ON "LoginHistory"("identityId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantMembershipId_fkey" FOREIGN KEY ("tenantMembershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_tenantMembershipId_fkey" FOREIGN KEY ("tenantMembershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
