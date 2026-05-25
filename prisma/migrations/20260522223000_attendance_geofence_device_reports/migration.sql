-- Geofence, kiosk/device controls, and attendance insight switches.
CREATE TYPE "AttendanceControlStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "AttendanceClockDeviceType" AS ENUM ('KIOSK', 'TRUSTED_DEVICE', 'MOBILE_DEVICE', 'WEB_TERMINAL');

ALTER TABLE "AttendancePolicy"
  ADD COLUMN "requireKnownDevice" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireGeofenceForClockIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "blockOutsideGeofence" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "geofenceGraceMeters" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AttendanceGeofence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AttendanceControlStatus" NOT NULL DEFAULT 'ACTIVE',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 150,
    "locationName" TEXT,
    "organizationNodeId" TEXT,
    "costCenterId" TEXT,
    "positionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceGeofence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceClockDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "geofenceId" TEXT,
    "employeeId" TEXT,
    "type" "AttendanceClockDeviceType" NOT NULL DEFAULT 'KIOSK',
    "status" "AttendanceControlStatus" NOT NULL DEFAULT 'ACTIVE',
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "locationName" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceClockDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceGeofence_tenantId_code_key" ON "AttendanceGeofence"("tenantId", "code");
CREATE INDEX "AttendanceGeofence_tenantId_status_idx" ON "AttendanceGeofence"("tenantId", "status");
CREATE INDEX "AttendanceGeofence_organizationNodeId_idx" ON "AttendanceGeofence"("organizationNodeId");
CREATE INDEX "AttendanceGeofence_costCenterId_idx" ON "AttendanceGeofence"("costCenterId");
CREATE INDEX "AttendanceGeofence_positionId_idx" ON "AttendanceGeofence"("positionId");

CREATE UNIQUE INDEX "AttendanceClockDevice_tenantId_deviceId_key" ON "AttendanceClockDevice"("tenantId", "deviceId");
CREATE INDEX "AttendanceClockDevice_tenantId_status_idx" ON "AttendanceClockDevice"("tenantId", "status");
CREATE INDEX "AttendanceClockDevice_tenantId_type_idx" ON "AttendanceClockDevice"("tenantId", "type");
CREATE INDEX "AttendanceClockDevice_geofenceId_idx" ON "AttendanceClockDevice"("geofenceId");
CREATE INDEX "AttendanceClockDevice_employeeId_idx" ON "AttendanceClockDevice"("employeeId");

ALTER TABLE "AttendanceGeofence" ADD CONSTRAINT "AttendanceGeofence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceClockDevice" ADD CONSTRAINT "AttendanceClockDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceClockDevice" ADD CONSTRAINT "AttendanceClockDevice_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "AttendanceGeofence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceClockDevice" ADD CONSTRAINT "AttendanceClockDevice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
