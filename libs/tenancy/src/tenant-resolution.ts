export interface TenantResolutionInput {
  hostname?: string;
  tenantSlug?: string;
  trustedTenantIdHeader?: string;
}

export interface TenantResolutionCandidate {
  strategy: 'custom-domain' | 'subdomain' | 'route-slug' | 'trusted-header';
  value: string;
}

export function buildTenantResolutionCandidates(
  input: TenantResolutionInput,
): TenantResolutionCandidate[] {
  const candidates: TenantResolutionCandidate[] = [];

  if (input.hostname) {
    candidates.push({ strategy: 'custom-domain', value: input.hostname.toLowerCase() });

    const [subdomain] = input.hostname.split('.');
    if (subdomain && subdomain !== 'www') {
      candidates.push({ strategy: 'subdomain', value: subdomain.toLowerCase() });
    }
  }

  if (input.tenantSlug) {
    candidates.push({ strategy: 'route-slug', value: input.tenantSlug });
  }

  if (input.trustedTenantIdHeader) {
    candidates.push({ strategy: 'trusted-header', value: input.trustedTenantIdHeader });
  }

  return candidates;
}

