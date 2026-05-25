CREATE TYPE "WorkforceLeadershipRole" AS ENUM (
  'MANAGER',
  'SUPERVISOR',
  'UNIT_HEAD',
  'DEPARTMENT_HEAD',
  'PROJECT_LEAD',
  'HR_BUSINESS_PARTNER',
  'APPROVER'
);

CREATE TABLE "EmployeeLeadershipDesignation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "role" "WorkforceLeadershipRole" NOT NULL,
  "organizationNodeId" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeLeadershipDesignation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmployeeAssignment" ADD COLUMN "supervisorEmployeeId" TEXT;
ALTER TABLE "EmployeeAssignment" ADD COLUMN "unitHeadEmployeeId" TEXT;

CREATE INDEX "EmployeeLeadershipDesignation_tenantId_role_isActive_idx" ON "EmployeeLeadershipDesignation"("tenantId", "role", "isActive");
CREATE INDEX "EmployeeLeadershipDesignation_employeeId_role_idx" ON "EmployeeLeadershipDesignation"("employeeId", "role");
CREATE INDEX "EmployeeLeadershipDesignation_organizationNodeId_idx" ON "EmployeeLeadershipDesignation"("organizationNodeId");
CREATE INDEX "EmployeeAssignment_supervisorEmployeeId_idx" ON "EmployeeAssignment"("supervisorEmployeeId");
CREATE INDEX "EmployeeAssignment_unitHeadEmployeeId_idx" ON "EmployeeAssignment"("unitHeadEmployeeId");

ALTER TABLE "EmployeeLeadershipDesignation" ADD CONSTRAINT "EmployeeLeadershipDesignation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeLeadershipDesignation" ADD CONSTRAINT "EmployeeLeadershipDesignation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeLeadershipDesignation" ADD CONSTRAINT "EmployeeLeadershipDesignation_organizationNodeId_fkey" FOREIGN KEY ("organizationNodeId") REFERENCES "OrganizationNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_supervisorEmployeeId_fkey" FOREIGN KEY ("supervisorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_unitHeadEmployeeId_fkey" FOREIGN KEY ("unitHeadEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
