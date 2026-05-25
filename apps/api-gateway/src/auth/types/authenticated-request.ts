import type { Request } from 'express';

export interface AuthenticatedPrincipal {
  id: string;
  identityId?: string | null;
  membershipId?: string | null;
  tenantId: string | null;
  email: string;
  username: string | null;
  type: string;
  status: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
  enabledFeatures?: string[];
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedPrincipal;
}
