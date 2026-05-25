import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, type OrganizationNode, type Prisma } from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { CreateOrganizationNodeDto } from './dto/create-organization-node.dto';
import { ListCostCentersQueryDto } from './dto/list-cost-centers-query.dto';
import { ListOrganizationNodesQueryDto } from './dto/list-organization-nodes-query.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';
import { UpdateOrganizationNodeDto } from './dto/update-organization-node.dto';
import type { OrganizationTreeNode } from './types/organization-tree-node';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async createNode(actor: AuthenticatedPrincipal, dto: CreateOrganizationNodeDto) {
    const tenantId = this.requireTenant(actor);
    await this.validateNodeReferences(tenantId, dto);

    const node = await this.prisma.organizationNode.create({
      data: {
        tenantId,
        parentId: dto.parentId,
        type: dto.type,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description,
        countryId: dto.countryId,
        stateId: dto.stateId,
        cityId: dto.cityId,
        address: this.toJson(dto.address),
        isActive: dto.isActive ?? true,
        metadata: this.toJson(dto.metadata),
      },
      include: this.nodeInclude,
    });

    await this.writeAudit(actor, tenantId, AuditAction.CREATE, 'OrganizationNode', node.id, null, {
      code: node.code,
      name: node.name,
      type: node.type,
      parentId: node.parentId,
    });

    return node;
  }

  async listNodes(actor: AuthenticatedPrincipal, query: ListOrganizationNodesQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;

    const nodes = await this.prisma.organizationNode.findMany({
      where: {
        tenantId,
        type: query.type,
        parentId: query.parentId,
        isActive: query.isActive,
        deletedAt: query.includeDeleted ? undefined : null,
        OR: query.search
          ? [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: this.nodeInclude,
    });

    const hasNextPage = nodes.length > limit;
    const data = hasNextPage ? nodes.slice(0, limit) : nodes;

    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? data.at(-1)?.id : null,
      },
    };
  }

  async getNode(actor: AuthenticatedPrincipal, nodeId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findNodeOrThrow(tenantId, nodeId);
  }

  async getTree(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const nodes = await this.prisma.organizationNode.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return this.buildTree(nodes);
  }

  async updateNode(
    actor: AuthenticatedPrincipal,
    nodeId: string,
    dto: UpdateOrganizationNodeDto,
  ) {
    const tenantId = this.requireTenant(actor);
    const existing = await this.findNodeOrThrow(tenantId, nodeId);
    await this.validateNodeReferences(tenantId, dto, existing.id);

    if (dto.parentId !== undefined) {
      await this.assertParentChangeIsSafe(tenantId, existing.id, dto.parentId);
    }

    const updated = await this.prisma.organizationNode.update({
      where: { id: existing.id },
      data: {
        parentId: dto.parentId,
        type: dto.type,
        code: dto.code?.trim().toUpperCase(),
        name: dto.name?.trim(),
        description: dto.description,
        countryId: dto.countryId,
        stateId: dto.stateId,
        cityId: dto.cityId,
        address: this.toJson(dto.address),
        isActive: dto.isActive,
        metadata: this.toJson(dto.metadata),
      },
      include: this.nodeInclude,
    });

    await this.writeAudit(actor, tenantId, AuditAction.UPDATE, 'OrganizationNode', updated.id, {
      code: existing.code,
      name: existing.name,
      type: existing.type,
      parentId: existing.parentId,
    }, {
      code: updated.code,
      name: updated.name,
      type: updated.type,
      parentId: updated.parentId,
    });

    return updated;
  }

  async deleteNode(actor: AuthenticatedPrincipal, nodeId: string) {
    const tenantId = this.requireTenant(actor);
    const node = await this.findNodeOrThrow(tenantId, nodeId);

    const [activeChildren, positions, assignments, costCenters] = await Promise.all([
      this.prisma.organizationNode.count({
        where: { tenantId, parentId: node.id, deletedAt: null },
      }),
      this.prisma.position.count({
        where: { tenantId, organizationNodeId: node.id, deletedAt: null },
      }),
      this.prisma.employeeAssignment.count({
        where: { tenantId, organizationNodeId: node.id, effectiveTo: null },
      }),
      this.prisma.costCenter.count({
        where: { tenantId, organizationNodeId: node.id, deletedAt: null },
      }),
    ]);

    if (activeChildren > 0) {
      throw new BadRequestException('Cannot delete an organization node with active children.');
    }

    if (positions > 0 || assignments > 0 || costCenters > 0) {
      throw new BadRequestException('Cannot delete an organization node that is still in use.');
    }

    const deleted = await this.prisma.organizationNode.update({
      where: { id: node.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    await this.writeAudit(actor, tenantId, AuditAction.DELETE, 'OrganizationNode', node.id, {
      code: node.code,
      name: node.name,
      type: node.type,
    }, {
      deletedAt: deleted.deletedAt,
    });

    return { deleted: true };
  }

  async createCostCenter(actor: AuthenticatedPrincipal, dto: CreateCostCenterDto) {
    const tenantId = this.requireTenant(actor);
    await this.validateOrganizationNodeReference(tenantId, dto.organizationNodeId);

    const costCenter = await this.prisma.costCenter.create({
      data: {
        tenantId,
        organizationNodeId: dto.organizationNodeId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description,
        isActive: dto.isActive ?? true,
        metadata: this.toJson(dto.metadata),
      },
      include: {
        organizationNode: true,
      },
    });

    await this.writeAudit(actor, tenantId, AuditAction.CREATE, 'CostCenter', costCenter.id, null, {
      code: costCenter.code,
      name: costCenter.name,
      organizationNodeId: costCenter.organizationNodeId,
    });

    return costCenter;
  }

  async listCostCenters(actor: AuthenticatedPrincipal, query: ListCostCentersQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;

    const costCenters = await this.prisma.costCenter.findMany({
      where: {
        tenantId,
        organizationNodeId: query.organizationNodeId,
        isActive: query.isActive,
        deletedAt: query.includeDeleted ? undefined : null,
        OR: query.search
          ? [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: {
        organizationNode: true,
      },
    });

    const hasNextPage = costCenters.length > limit;
    const data = hasNextPage ? costCenters.slice(0, limit) : costCenters;

    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? data.at(-1)?.id : null,
      },
    };
  }

  async getCostCenter(actor: AuthenticatedPrincipal, costCenterId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findCostCenterOrThrow(tenantId, costCenterId);
  }

  async updateCostCenter(
    actor: AuthenticatedPrincipal,
    costCenterId: string,
    dto: UpdateCostCenterDto,
  ) {
    const tenantId = this.requireTenant(actor);
    const existing = await this.findCostCenterOrThrow(tenantId, costCenterId);
    await this.validateOrganizationNodeReference(tenantId, dto.organizationNodeId);

    const updated = await this.prisma.costCenter.update({
      where: { id: existing.id },
      data: {
        organizationNodeId: dto.organizationNodeId,
        code: dto.code?.trim().toUpperCase(),
        name: dto.name?.trim(),
        description: dto.description,
        isActive: dto.isActive,
        metadata: this.toJson(dto.metadata),
      },
      include: {
        organizationNode: true,
      },
    });

    await this.writeAudit(actor, tenantId, AuditAction.UPDATE, 'CostCenter', updated.id, {
      code: existing.code,
      name: existing.name,
      organizationNodeId: existing.organizationNodeId,
    }, {
      code: updated.code,
      name: updated.name,
      organizationNodeId: updated.organizationNodeId,
    });

    return updated;
  }

  async deleteCostCenter(actor: AuthenticatedPrincipal, costCenterId: string) {
    const tenantId = this.requireTenant(actor);
    const costCenter = await this.findCostCenterOrThrow(tenantId, costCenterId);

    const [positions, assignments] = await Promise.all([
      this.prisma.position.count({
        where: { tenantId, costCenterId: costCenter.id, deletedAt: null },
      }),
      this.prisma.employeeAssignment.count({
        where: { tenantId, costCenterId: costCenter.id, effectiveTo: null },
      }),
    ]);

    if (positions > 0 || assignments > 0) {
      throw new BadRequestException('Cannot delete a cost center that is still in use.');
    }

    const deleted = await this.prisma.costCenter.update({
      where: { id: costCenter.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    await this.writeAudit(actor, tenantId, AuditAction.DELETE, 'CostCenter', costCenter.id, {
      code: costCenter.code,
      name: costCenter.name,
    }, {
      deletedAt: deleted.deletedAt,
    });

    return { deleted: true };
  }

  private async validateNodeReferences(
    tenantId: string,
    dto: Partial<CreateOrganizationNodeDto>,
    currentNodeId?: string,
  ) {
    if (dto.parentId) {
      await this.validateOrganizationNodeReference(tenantId, dto.parentId);

      if (dto.parentId === currentNodeId) {
        throw new BadRequestException('An organization node cannot be its own parent.');
      }
    }

    await this.validateGeoReferences(dto.countryId, dto.stateId, dto.cityId);
  }

  private async validateOrganizationNodeReference(tenantId: string, nodeId?: string) {
    if (!nodeId) {
      return;
    }

    const node = await this.prisma.organizationNode.findFirst({
      where: {
        id: nodeId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!node) {
      throw new BadRequestException('Organization node reference is invalid.');
    }
  }

  private async validateGeoReferences(countryId?: string, stateId?: string, cityId?: string) {
    if (stateId) {
      const state = await this.prisma.state.findUnique({ where: { id: stateId } });
      if (!state) {
        throw new BadRequestException('State reference is invalid.');
      }

      if (countryId && state.countryId !== countryId) {
        throw new BadRequestException('State does not belong to the selected country.');
      }
    }

    if (cityId) {
      const city = await this.prisma.city.findUnique({ where: { id: cityId } });
      if (!city) {
        throw new BadRequestException('City reference is invalid.');
      }

      if (countryId && city.countryId !== countryId) {
        throw new BadRequestException('City does not belong to the selected country.');
      }

      if (stateId && city.stateId !== stateId) {
        throw new BadRequestException('City does not belong to the selected state.');
      }
    }

    if (countryId) {
      const country = await this.prisma.country.findUnique({ where: { id: countryId } });
      if (!country) {
        throw new BadRequestException('Country reference is invalid.');
      }
    }
  }

  private async assertParentChangeIsSafe(
    tenantId: string,
    nodeId: string,
    parentId?: string | null,
  ) {
    if (!parentId) {
      return;
    }

    let cursor = await this.prisma.organizationNode.findFirst({
      where: {
        id: parentId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true, parentId: true },
    });

    while (cursor) {
      if (cursor.id === nodeId) {
        throw new BadRequestException('Cannot move a node under one of its descendants.');
      }

      if (!cursor.parentId) {
        return;
      }

      cursor = await this.prisma.organizationNode.findFirst({
        where: {
          id: cursor.parentId,
          tenantId,
          deletedAt: null,
        },
        select: { id: true, parentId: true },
      });
    }
  }

  private async findNodeOrThrow(tenantId: string, nodeId: string) {
    const node = await this.prisma.organizationNode.findFirst({
      where: {
        id: nodeId,
        tenantId,
        deletedAt: null,
      },
      include: this.nodeInclude,
    });

    if (!node) {
      throw new NotFoundException('Organization node not found.');
    }

    return node;
  }

  private async findCostCenterOrThrow(tenantId: string, costCenterId: string) {
    const costCenter = await this.prisma.costCenter.findFirst({
      where: {
        id: costCenterId,
        tenantId,
        deletedAt: null,
      },
      include: {
        organizationNode: true,
      },
    });

    if (!costCenter) {
      throw new NotFoundException('Cost center not found.');
    }

    return costCenter;
  }

  private buildTree(nodes: OrganizationNode[]): OrganizationTreeNode[] {
    const byId = new Map<string, OrganizationTreeNode>();
    const roots: OrganizationTreeNode[] = [];

    for (const node of nodes) {
      byId.set(node.id, { ...node, children: [] });
    }

    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private async writeAudit(
    actor: AuthenticatedPrincipal,
    tenantId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.id,
        action,
        module: 'organization',
        entityType,
        entityId,
        before: before ?? undefined,
        after,
      },
    });
  }

  private requireTenant(actor: AuthenticatedPrincipal): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant context is required.');
    }

    return actor.tenantId;
  }

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private get nodeInclude() {
    return {
      parent: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
      country: true,
      state: true,
      city: true,
      _count: {
        select: {
          children: true,
          costCenters: true,
          positions: true,
          assignments: true,
        },
      },
    } satisfies Prisma.OrganizationNodeInclude;
  }
}

