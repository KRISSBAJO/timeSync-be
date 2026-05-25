type TenantWhere = {
  tenantId?: string;
  [key: string]: unknown;
};

type TenantScopedArgs<TWhere extends TenantWhere = TenantWhere> = {
  where?: TWhere;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export function assertTenantId(tenantId: string): string {
  if (!tenantId || tenantId.trim().length === 0) {
    throw new Error('A valid tenantId is required for tenant-scoped database operations.');
  }

  return tenantId;
}

export function withTenantWhere<TArgs extends TenantScopedArgs>(
  tenantId: string,
  args?: TArgs,
): TArgs & { where: TenantWhere } {
  const safeTenantId = assertTenantId(tenantId);

  return {
    ...(args ?? {}),
    where: {
      ...(args?.where ?? {}),
      tenantId: safeTenantId,
    },
  } as TArgs & { where: TenantWhere };
}

export function withTenantData<TArgs extends TenantScopedArgs>(
  tenantId: string,
  args?: TArgs,
): TArgs & { data: Record<string, unknown> } {
  const safeTenantId = assertTenantId(tenantId);

  return {
    ...(args ?? {}),
    data: {
      ...(args?.data ?? {}),
      tenantId: safeTenantId,
    },
  } as unknown as TArgs & { data: Record<string, unknown> };
}
