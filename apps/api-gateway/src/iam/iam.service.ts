import { createHash } from 'crypto';

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  RoleScope,
  type Permission,
  type Prisma,
  type Role,
  type User,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { AssignRolePermissionsDto } from './dto/assign-role-permissions.dto';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import {
  platformPermissionCatalog,
  platformPermissionCodes,
  platformSupportPermissionCodes,
  tenantAdminTemplatePermissionCodes,
} from './permission-catalog';
import { permissionTemplates } from './permission-templates';

@Injectable()
export class IamService {
  constructor(private readonly prisma: PrismaService) {}

  async listPermissions(actor: AuthenticatedPrincipal) {
    return this.prisma.permission.findMany({
      where: this.tenantOrGlobalWhere(actor),
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
  }

  async listRoles(actor: AuthenticatedPrincipal) {
    return this.prisma.role.findMany({
      where: this.roleListWhere(actor),
      include: {
        permissions: {
          include: { permission: true },
        },
      },
      orderBy: [{ tenantId: 'asc' }, { code: 'asc' }],
    });
  }

  listPermissionTemplates(actor: AuthenticatedPrincipal) {
    const allowedScopes = this.isPlatformActor(actor) ? new Set(['platform', 'tenant']) : new Set(['tenant']);

    return permissionTemplates
      .filter((template) => allowedScopes.has(template.scope))
      .map((template) => ({
        ...template,
        permissionCount: template.permissionCodes.length,
      }));
  }

  async getPermissionBootstrapStatus(actor: AuthenticatedPrincipal) {
    this.assertPlatformActor(actor);

    const existingPermissions = await this.prisma.permission.findMany({
      where: { tenantId: null },
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
    const existingByCode = new Map(existingPermissions.map((permission) => [permission.code, permission]));
    const catalogCodes = new Set(platformPermissionCodes);
    const missing = platformPermissionCatalog
      .filter((permission) => !existingByCode.has(permission.code))
      .map((permission) => permission.code);
    const changed = platformPermissionCatalog
      .filter((permission) => {
        const existing = existingByCode.get(permission.code);

        return Boolean(
          existing &&
            (existing.name !== permission.name ||
              existing.module !== permission.module ||
              existing.description !== (permission.description ?? null) ||
              !existing.isSystem),
        );
      })
      .map((permission) => permission.code);
    const unmanaged = existingPermissions
      .filter((permission) => !catalogCodes.has(permission.code))
      .map((permission) => permission.code);

    return {
      catalogVersion: this.catalogVersion(),
      catalogCount: platformPermissionCatalog.length,
      existingGlobalCount: existingPermissions.length,
      missingCount: missing.length,
      changedCount: changed.length,
      unmanagedCount: unmanaged.length,
      missing,
      changed,
      unmanaged,
    };
  }

  async bootstrapPermissionCatalog(actor: AuthenticatedPrincipal) {
    this.assertPlatformActor(actor);

    const result = {
      catalogVersion: this.catalogVersion(),
      permissions: {
        catalogCount: platformPermissionCatalog.length,
        created: [] as string[],
        updated: [] as string[],
        unchanged: [] as string[],
      },
      platformRoles: [] as Array<{
        roleCode: string;
        roleFound: boolean;
        attached: string[];
      }>,
    };

    await this.prisma.$transaction(async (tx) => {
      for (const permission of platformPermissionCatalog) {
        const existing = await tx.permission.findFirst({
          where: {
            tenantId: null,
            code: permission.code,
          },
        });

        if (!existing) {
          await tx.permission.create({
            data: {
              tenantId: null,
              code: permission.code,
              name: permission.name,
              module: permission.module,
              description: permission.description,
              isSystem: true,
            },
          });
          result.permissions.created.push(permission.code);
          continue;
        }

        const description = permission.description ?? null;
        const needsUpdate =
          existing.name !== permission.name ||
          existing.module !== permission.module ||
          existing.description !== description ||
          !existing.isSystem;

        if (needsUpdate) {
          await tx.permission.update({
            where: { id: existing.id },
            data: {
              name: permission.name,
              module: permission.module,
              description,
              isSystem: true,
            },
          });
          result.permissions.updated.push(permission.code);
        } else {
          result.permissions.unchanged.push(permission.code);
        }
      }

      result.platformRoles.push(
        await this.attachMissingSystemRolePermissions(tx, 'SUPER_ADMIN', platformPermissionCodes),
      );
      result.platformRoles.push(
        await this.attachMissingSystemRolePermissions(tx, 'PLATFORM_SUPPORT', platformSupportPermissionCodes),
      );
      result.platformRoles.push(
        await this.attachMissingSystemRolePermissions(tx, 'TENANT_ADMIN', tenantAdminTemplatePermissionCodes),
      );

      await tx.auditLog.create({
        data: {
          tenantId: null,
          actorUserId: actor.id,
          action: AuditAction.UPDATE,
          module: 'iam',
          entityType: 'PermissionCatalog',
          entityId: 'platform-permission-catalog',
          after: result,
          metadata: {
            source: 'platform_permission_bootstrap',
          },
        },
      });
    });

    return {
      ...result,
      appliedAt: new Date().toISOString(),
    };
  }

  async getRole(actor: AuthenticatedPrincipal, roleId: string) {
    const role = await this.findRoleForActor(actor, roleId);

    return this.prisma.role.findUnique({
      where: { id: role.id },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
  }

  async createRole(actor: AuthenticatedPrincipal, dto: CreateRoleDto) {
    this.assertScopeAllowed(actor, dto.scope ?? RoleScope.TENANT);

    return this.prisma.role.create({
      data: {
        tenantId: actor.tenantId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description,
        scope: dto.scope ?? (actor.tenantId ? RoleScope.TENANT : RoleScope.PLATFORM),
        isSystem: false,
        isActive: true,
      },
    });
  }

  async updateRole(actor: AuthenticatedPrincipal, roleId: string, dto: UpdateRoleDto) {
    const role = await this.findRoleForActor(actor, roleId);
    this.assertMutableRole(role);

    if (dto.scope) {
      this.assertScopeAllowed(actor, dto.scope);
    }

    return this.prisma.role.update({
      where: { id: role.id },
      data: {
        code: dto.code?.trim().toUpperCase(),
        name: dto.name?.trim(),
        description: dto.description,
        scope: dto.scope,
      },
    });
  }

  async syncRolePermissions(
    actor: AuthenticatedPrincipal,
    roleId: string,
    dto: AssignRolePermissionsDto,
  ) {
    const role = await this.findRoleForActor(actor, roleId);
    this.assertMutableRole(role);

    const permissions = await this.resolvePermissions(actor, dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: {
          roleId: role.id,
          permissionId: {
            notIn: permissions.map((permission) => permission.id),
          },
        },
      });

      for (const permission of permissions) {
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          create: {
            roleId: role.id,
            permissionId: permission.id,
          },
          update: {},
        });
      }
    });

    return this.getRole(actor, role.id);
  }

  async applyPermissionTemplate(
    actor: AuthenticatedPrincipal,
    roleId: string,
    templateCode: string,
  ) {
    const template = permissionTemplates.find(
      (candidate) => candidate.code === templateCode.trim().toUpperCase(),
    );

    if (!template) {
      throw new NotFoundException('Permission template not found.');
    }

    if (template.scope === 'platform' && !this.isPlatformActor(actor)) {
      throw new ForbiddenException('Only platform administrators can apply platform permission templates.');
    }

    return this.syncRolePermissions(actor, roleId, {
      permissionCodes: template.permissionCodes,
    });
  }

  async assignUserRole(actor: AuthenticatedPrincipal, userId: string, dto: AssignUserRoleDto) {
    const user = await this.findUserForActor(actor, userId);
    const role = await this.findRoleForActor(actor, dto.roleId);
    const scope = dto.scope ?? role.scope;

    this.assertScopeAllowed(actor, scope);

    if (role.tenantId && role.tenantId !== user.tenantId) {
      throw new ForbiddenException('Role and user must belong to the same tenant.');
    }

    return this.prisma.userRole.upsert({
      where: {
        userId_roleId_scope_scopeId: {
          userId: user.id,
          roleId: role.id,
          scope,
          scopeId: dto.scopeId ?? '',
        },
      },
      create: {
        userId: user.id,
        roleId: role.id,
        scope,
        scopeId: dto.scopeId ?? '',
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
      update: {
        scopeId: dto.scopeId ?? '',
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
      include: {
        role: true,
      },
    });
  }

  async removeUserRole(actor: AuthenticatedPrincipal, userId: string, roleId: string) {
    const user = await this.findUserForActor(actor, userId);
    const role = await this.findRoleForActor(actor, roleId);

    await this.prisma.userRole.deleteMany({
      where: {
        userId: user.id,
        roleId: role.id,
      },
    });

    return { removed: true };
  }

  private async resolvePermissions(
    actor: AuthenticatedPrincipal,
    dto: AssignRolePermissionsDto,
  ): Promise<Permission[]> {
    const permissionCodes = dto.permissionCodes ?? [];
    const permissionIds = dto.permissionIds ?? [];

    if (permissionCodes.length === 0 && permissionIds.length === 0) {
      throw new BadRequestException('At least one permission code or permission ID is required.');
    }

    const permissions = await this.prisma.permission.findMany({
      where: {
        AND: [
          this.tenantOrGlobalWhere(actor),
          {
            OR: [
              permissionCodes.length > 0 ? { code: { in: permissionCodes } } : undefined,
              permissionIds.length > 0 ? { id: { in: permissionIds } } : undefined,
            ].filter(Boolean) as Prisma.PermissionWhereInput[],
          },
        ],
      },
    });

    const expectedCount = new Set([...permissionCodes, ...permissionIds]).size;
    if (permissions.length !== expectedCount) {
      throw new BadRequestException('One or more permissions could not be resolved.');
    }

    return permissions;
  }

  private async findRoleForActor(actor: AuthenticatedPrincipal, roleId: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });

    if (!role || role.deletedAt) {
      throw new NotFoundException('Role not found.');
    }

    if (this.isPlatformActor(actor)) {
      return role;
    }

    if (role.tenantId !== actor.tenantId) {
      throw new NotFoundException('Role not found.');
    }

    return role;
  }

  private async findUserForActor(actor: AuthenticatedPrincipal, userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found.');
    }

    if (this.isPlatformActor(actor)) {
      return user;
    }

    if (user.tenantId !== actor.tenantId) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  private tenantOrGlobalWhere(actor: AuthenticatedPrincipal): Prisma.PermissionWhereInput {
    if (this.isPlatformActor(actor)) {
      return {};
    }

    return {
      OR: [{ tenantId: null }, { tenantId: actor.tenantId }],
    };
  }

  private roleListWhere(actor: AuthenticatedPrincipal): Prisma.RoleWhereInput {
    if (this.isPlatformActor(actor)) {
      return {};
    }

    return {
      tenantId: actor.tenantId,
      deletedAt: null,
    };
  }

  private assertMutableRole(role: Role) {
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be modified through this endpoint.');
    }
  }

  private async attachMissingSystemRolePermissions(
    tx: Prisma.TransactionClient,
    roleCode: string,
    permissionCodes: string[],
  ) {
    const role = await tx.role.findFirst({
      where: {
        tenantId: null,
        code: roleCode,
        deletedAt: null,
      },
    });

    if (!role) {
      return {
        roleCode,
        roleFound: false,
        attached: [],
      };
    }

    const permissions = await tx.permission.findMany({
      where: {
        tenantId: null,
        code: { in: permissionCodes },
      },
    });
    const existing = await tx.rolePermission.findMany({
      where: {
        roleId: role.id,
        permissionId: { in: permissions.map((permission) => permission.id) },
      },
      select: { permissionId: true },
    });
    const existingIds = new Set(existing.map((rolePermission) => rolePermission.permissionId));
    const missingPermissions = permissions.filter((permission) => !existingIds.has(permission.id));

    for (const permission of missingPermissions) {
      await tx.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
        update: {},
      });
    }

    return {
      roleCode,
      roleFound: true,
      attached: missingPermissions.map((permission) => permission.code).sort(),
    };
  }

  private assertPlatformActor(actor: AuthenticatedPrincipal) {
    if (!this.isPlatformActor(actor)) {
      throw new ForbiddenException('Only platform administrators can bootstrap the permission catalog.');
    }
  }

  private catalogVersion() {
    const digest = createHash('sha256')
      .update(JSON.stringify(platformPermissionCatalog))
      .digest('hex')
      .slice(0, 12);

    return `permissions:${platformPermissionCatalog.length}:${digest}`;
  }

  private assertScopeAllowed(actor: AuthenticatedPrincipal, scope: RoleScope) {
    if (scope === RoleScope.PLATFORM && !this.isPlatformActor(actor)) {
      throw new ForbiddenException('Only platform administrators can manage platform-scoped roles.');
    }
  }

  private isPlatformActor(actor: AuthenticatedPrincipal): boolean {
    return actor.tenantId === null && actor.type === 'PLATFORM_ADMIN';
  }
}
