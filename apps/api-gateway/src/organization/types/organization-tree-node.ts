import type { OrganizationNode } from '@prisma/client';

export type OrganizationTreeNode = OrganizationNode & {
  children: OrganizationTreeNode[];
};

