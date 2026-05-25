export interface TenantContext {
  tenantId: string;
  tenantSlug?: string;
  tenantSubdomain?: string;
  customDomain?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  permissions: string[];
  roles: string[];
}

