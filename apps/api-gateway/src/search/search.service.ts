import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { GlobalSearchQueryDto } from './dto/global-search-query.dto';

type SearchType = 'employees' | 'positions' | 'documents' | 'organization' | 'workflows';

const SEARCH_TYPES: SearchType[] = [
  'employees',
  'positions',
  'documents',
  'organization',
  'workflows',
];

const SEARCH_PERMISSIONS: Record<SearchType, string[]> = {
  employees: ['employees.read', 'persons.read'],
  positions: ['positions.read'],
  documents: ['documents.read'],
  organization: ['organization.read', 'cost-centers.read'],
  workflows: ['workflows.read', 'approvals.read'],
};

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(actor: AuthenticatedPrincipal, query: GlobalSearchQueryDto) {
    const tenantId = this.requireTenant(actor);
    const q = query.q?.trim() ?? '';
    const limit = query.limit ?? 6;
    const requestedTypes = this.resolveTypes(query.types);
    const groups = await Promise.all(
      requestedTypes
        .filter((type) => this.canSearch(actor, type))
        .map((type) => this.searchType(type, tenantId, q, limit)),
    );

    return {
      query: q,
      generatedAt: new Date(),
      groups: groups.filter((group) => group.results.length > 0 || q.length === 0),
    };
  }

  private async searchType(type: SearchType, tenantId: string, q: string, limit: number) {
    switch (type) {
      case 'employees':
        return this.searchEmployees(tenantId, q, limit);
      case 'positions':
        return this.searchPositions(tenantId, q, limit);
      case 'documents':
        return this.searchDocuments(tenantId, q, limit);
      case 'organization':
        return this.searchOrganization(tenantId, q, limit);
      case 'workflows':
        return this.searchWorkflows(tenantId, q, limit);
    }
  }

  private async searchEmployees(tenantId: string, q: string, limit: number) {
    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: this.employeeSearch(q),
      },
      take: limit,
      orderBy: [{ updatedAt: 'desc' }, { employeeNumber: 'asc' }],
      include: {
        person: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            preferredName: true,
          },
        },
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    return {
      type: 'employees',
      label: 'Employees',
      total: employees.length,
      results: employees.map((employee) => ({
        id: employee.id,
        title: this.personName(employee.person),
        subtitle: `${employee.employeeNumber} · ${employee.status} · ${employee.employmentType}`,
        href: `/workforce?employee=${employee.id}`,
        meta: {
          email: employee.user?.email ?? null,
          status: employee.status,
        },
      })),
    };
  }

  private async searchPositions(tenantId: string, q: string, limit: number) {
    const positions = await this.prisma.position.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: q
          ? [
              { code: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit,
      orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
      include: {
        organizationNode: {
          select: {
            name: true,
          },
        },
      },
    });

    return {
      type: 'positions',
      label: 'Positions',
      total: positions.length,
      results: positions.map((position) => ({
        id: position.id,
        title: position.title,
        subtitle: `${position.code} · ${position.status}${position.organizationNode?.name ? ` · ${position.organizationNode.name}` : ''}`,
        href: `/positions?position=${position.id}`,
        meta: {
          status: position.status,
          budgetedHeadcount: position.budgetedHeadcount,
        },
      })),
    };
  }

  private async searchDocuments(tenantId: string, q: string, limit: number) {
    const documents = await this.prisma.document.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: q
          ? [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { documentType: { code: { contains: q, mode: 'insensitive' } } },
              { documentType: { name: { contains: q, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      take: limit,
      orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
      include: {
        documentType: {
          select: {
            code: true,
            name: true,
          },
        },
        employee: {
          select: {
            employeeNumber: true,
          },
        },
      },
    });

    return {
      type: 'documents',
      label: 'Documents',
      total: documents.length,
      results: documents.map((document) => ({
        id: document.id,
        title: document.title,
        subtitle: [
          document.documentType?.name ?? document.documentType?.code,
          document.verificationStatus,
          document.employee?.employeeNumber,
        ].filter(Boolean).join(' · '),
        href: `/documents?document=${document.id}`,
        meta: {
          visibility: document.visibility,
          expiresAt: document.expiresAt,
        },
      })),
    };
  }

  private async searchOrganization(tenantId: string, q: string, limit: number) {
    const nodes = await this.prisma.organizationNode.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: q
          ? [
              { code: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit,
      orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
    });

    return {
      type: 'organization',
      label: 'Organization',
      total: nodes.length,
      results: nodes.map((node) => ({
        id: node.id,
        title: node.name,
        subtitle: `${node.code} · ${node.type}`,
        href: `/organization?node=${node.id}`,
        meta: {
          isActive: node.isActive,
        },
      })),
    };
  }

  private async searchWorkflows(tenantId: string, q: string, limit: number) {
    const workflows = await this.prisma.workflow.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: q
          ? [
              { code: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { module: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit,
      orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
    });

    return {
      type: 'workflows',
      label: 'Workflows',
      total: workflows.length,
      results: workflows.map((workflow) => ({
        id: workflow.id,
        title: workflow.name,
        subtitle: `${workflow.code} · ${workflow.module} · ${workflow.status}`,
        href: `/workflows?workflow=${workflow.id}`,
        meta: {
          status: workflow.status,
        },
      })),
    };
  }

  private employeeSearch(q: string): Prisma.EmployeeWhereInput[] | undefined {
    if (!q) {
      return undefined;
    }

    return [
      { employeeNumber: { contains: q, mode: 'insensitive' } },
      { source: { contains: q, mode: 'insensitive' } },
      { person: { firstName: { contains: q, mode: 'insensitive' } } },
      { person: { middleName: { contains: q, mode: 'insensitive' } } },
      { person: { lastName: { contains: q, mode: 'insensitive' } } },
      { person: { preferredName: { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
    ];
  }

  private resolveTypes(types?: string): SearchType[] {
    if (!types) {
      return SEARCH_TYPES;
    }

    const requested = new Set(
      types
        .split(',')
        .map((type) => type.trim())
        .filter((type): type is SearchType => SEARCH_TYPES.includes(type as SearchType)),
    );

    return SEARCH_TYPES.filter((type) => requested.has(type));
  }

  private canSearch(actor: AuthenticatedPrincipal, type: SearchType) {
    const granted = new Set(actor.permissions);
    return SEARCH_PERMISSIONS[type].some((permission) => granted.has(permission));
  }

  private personName(person: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    preferredName?: string | null;
  }) {
    return (
      person.preferredName ??
      [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ')
    );
  }

  private requireTenant(actor: AuthenticatedPrincipal) {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant context is required.');
    }

    return actor.tenantId;
  }
}
