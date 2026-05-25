import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  PositionStatus,
  type Position,
  type PositionGrade,
  type PositionLevel,
  type Prisma,
  type Skill,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { CreatePositionDto } from './dto/create-position.dto';
import { CreatePositionGradeDto } from './dto/create-position-grade.dto';
import { CreatePositionLevelDto } from './dto/create-position-level.dto';
import { CreatePositionSkillDto } from './dto/create-position-skill.dto';
import { CreateSkillDto } from './dto/create-skill.dto';
import { ListPositionGradesQueryDto } from './dto/list-position-grades-query.dto';
import { ListPositionLevelsQueryDto } from './dto/list-position-levels-query.dto';
import { ListPositionsQueryDto } from './dto/list-positions-query.dto';
import { ListSkillsQueryDto } from './dto/list-skills-query.dto';
import { PositionOccupantsQueryDto } from './dto/position-occupants-query.dto';
import { PositionStatusTransitionDto } from './dto/position-status-transition.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { UpdatePositionGradeDto } from './dto/update-position-grade.dto';
import { UpdatePositionLevelDto } from './dto/update-position-level.dto';
import { UpdatePositionSkillDto } from './dto/update-position-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import type { PositionCapacity, PositionTreeNode } from './types/position-tree-node';

const FAR_FUTURE = new Date('9999-12-31T23:59:59.999Z');

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createGrade(actor: AuthenticatedPrincipal, dto: CreatePositionGradeDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const grade = await tx.positionGrade.create({
        data: {
          tenantId,
          code: this.normalizeCode(dto.code),
          name: dto.name.trim(),
          rank: dto.rank,
          description: dto.description,
          metadata: this.toJson(dto.metadata),
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'PositionGrade', grade.id, null, {
        code: grade.code,
        name: grade.name,
        rank: grade.rank,
      });

      await this.enqueueOutbox(tx, tenantId, 'position.grade.created', 'PositionGrade', grade.id, {
        gradeId: grade.id,
        code: grade.code,
      });

      return grade;
    });
  }

  async listGrades(actor: AuthenticatedPrincipal, query: ListPositionGradesQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;

    const grades = await this.prisma.positionGrade.findMany({
      where: {
        tenantId,
        deletedAt: query.includeDeleted ? undefined : null,
        OR: query.search
          ? [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ rank: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      include: {
        _count: {
          select: {
            positions: true,
            assignments: true,
          },
        },
      },
    });

    return this.paginate(grades, limit);
  }

  async getGrade(actor: AuthenticatedPrincipal, gradeId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findGradeOrThrow(this.prisma, tenantId, gradeId);
  }

  async updateGrade(
    actor: AuthenticatedPrincipal,
    gradeId: string,
    dto: UpdatePositionGradeDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findGradeOrThrow(tx, tenantId, gradeId);
      const updated = await tx.positionGrade.update({
        where: { id: existing.id },
        data: {
          code: dto.code ? this.normalizeCode(dto.code) : undefined,
          name: dto.name?.trim(),
          rank: dto.rank,
          description: dto.description,
          metadata: this.toJson(dto.metadata),
        },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'PositionGrade',
        updated.id,
        this.gradeState(existing),
        this.gradeState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'position.grade.updated', 'PositionGrade', updated.id, {
        gradeId: updated.id,
        code: updated.code,
      });

      return updated;
    });
  }

  async deleteGrade(actor: AuthenticatedPrincipal, gradeId: string) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const grade = await this.findGradeOrThrow(tx, tenantId, gradeId);
      const [positions, openAssignments] = await Promise.all([
        tx.position.count({ where: { tenantId, gradeId: grade.id, deletedAt: null } }),
        tx.employeeAssignment.count({
          where: {
            tenantId,
            gradeId: grade.id,
            ...this.openAssignmentWhere(),
          },
        }),
      ]);

      if (positions > 0 || openAssignments > 0) {
        throw new BadRequestException('Cannot delete a position grade that is still in use.');
      }

      const deleted = await tx.positionGrade.update({
        where: { id: grade.id },
        data: { deletedAt: new Date() },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.DELETE,
        'PositionGrade',
        grade.id,
        this.gradeState(grade),
        { deletedAt: deleted.deletedAt?.toISOString() ?? null },
      );

      await this.enqueueOutbox(tx, tenantId, 'position.grade.deleted', 'PositionGrade', grade.id, {
        gradeId: grade.id,
        deleted: true,
      });

      return { deleted: true };
    });
  }

  async createLevel(actor: AuthenticatedPrincipal, dto: CreatePositionLevelDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const level = await tx.positionLevel.create({
        data: {
          tenantId,
          code: this.normalizeCode(dto.code),
          name: dto.name.trim(),
          rank: dto.rank,
          description: dto.description,
          metadata: this.toJson(dto.metadata),
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'PositionLevel', level.id, null, {
        code: level.code,
        name: level.name,
        rank: level.rank,
      });

      await this.enqueueOutbox(tx, tenantId, 'position.level.created', 'PositionLevel', level.id, {
        levelId: level.id,
        code: level.code,
      });

      return level;
    });
  }

  async listLevels(actor: AuthenticatedPrincipal, query: ListPositionLevelsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;

    const levels = await this.prisma.positionLevel.findMany({
      where: {
        tenantId,
        deletedAt: query.includeDeleted ? undefined : null,
        OR: query.search
          ? [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ rank: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      include: {
        _count: {
          select: {
            positions: true,
            assignments: true,
          },
        },
      },
    });

    return this.paginate(levels, limit);
  }

  async getLevel(actor: AuthenticatedPrincipal, levelId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findLevelOrThrow(this.prisma, tenantId, levelId);
  }

  async updateLevel(
    actor: AuthenticatedPrincipal,
    levelId: string,
    dto: UpdatePositionLevelDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findLevelOrThrow(tx, tenantId, levelId);
      const updated = await tx.positionLevel.update({
        where: { id: existing.id },
        data: {
          code: dto.code ? this.normalizeCode(dto.code) : undefined,
          name: dto.name?.trim(),
          rank: dto.rank,
          description: dto.description,
          metadata: this.toJson(dto.metadata),
        },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'PositionLevel',
        updated.id,
        this.levelState(existing),
        this.levelState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'position.level.updated', 'PositionLevel', updated.id, {
        levelId: updated.id,
        code: updated.code,
      });

      return updated;
    });
  }

  async deleteLevel(actor: AuthenticatedPrincipal, levelId: string) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const level = await this.findLevelOrThrow(tx, tenantId, levelId);
      const [positions, openAssignments] = await Promise.all([
        tx.position.count({ where: { tenantId, levelId: level.id, deletedAt: null } }),
        tx.employeeAssignment.count({
          where: {
            tenantId,
            levelId: level.id,
            ...this.openAssignmentWhere(),
          },
        }),
      ]);

      if (positions > 0 || openAssignments > 0) {
        throw new BadRequestException('Cannot delete a position level that is still in use.');
      }

      const deleted = await tx.positionLevel.update({
        where: { id: level.id },
        data: { deletedAt: new Date() },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.DELETE,
        'PositionLevel',
        level.id,
        this.levelState(level),
        { deletedAt: deleted.deletedAt?.toISOString() ?? null },
      );

      await this.enqueueOutbox(tx, tenantId, 'position.level.deleted', 'PositionLevel', level.id, {
        levelId: level.id,
        deleted: true,
      });

      return { deleted: true };
    });
  }

  async createSkill(actor: AuthenticatedPrincipal, dto: CreateSkillDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const skill = await tx.skill.upsert({
        where: {
          tenantId_name: {
            tenantId,
            name: dto.name.trim(),
          },
        },
        create: {
          tenantId,
          name: dto.name.trim(),
          category: dto.category,
        },
        update: {
          category: dto.category,
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'Skill', skill.id, null, {
        name: skill.name,
        category: skill.category,
      });

      await this.enqueueOutbox(tx, tenantId, 'skill.catalog.upserted', 'Skill', skill.id, {
        skillId: skill.id,
        name: skill.name,
      });

      return skill;
    });
  }

  async listSkills(actor: AuthenticatedPrincipal, query: ListSkillsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 100;

    const skills = await this.prisma.skill.findMany({
      where: {
        OR: query.includeGlobal === false ? [{ tenantId }] : [{ tenantId: null }, { tenantId }],
        category: query.category,
        name: query.search ? { contains: query.search, mode: 'insensitive' } : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      include: {
        _count: {
          select: {
            personSkills: true,
            positionSkills: true,
          },
        },
      },
    });

    return this.paginate(skills, limit);
  }

  async getSkill(actor: AuthenticatedPrincipal, skillId: string) {
    const tenantId = this.requireTenant(actor);
    return this.findSkillForReadOrThrow(this.prisma, tenantId, skillId);
  }

  async updateSkill(actor: AuthenticatedPrincipal, skillId: string, dto: UpdateSkillDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findTenantSkillOrThrow(tx, tenantId, skillId);
      const updated = await tx.skill.update({
        where: { id: existing.id },
        data: {
          name: dto.name?.trim(),
          category: dto.category,
        },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'Skill',
        updated.id,
        this.skillState(existing),
        this.skillState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'skill.catalog.updated', 'Skill', updated.id, {
        skillId: updated.id,
        name: updated.name,
      });

      return updated;
    });
  }

  async deleteSkill(actor: AuthenticatedPrincipal, skillId: string) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const skill = await this.findTenantSkillOrThrow(tx, tenantId, skillId);
      const [personSkills, positionSkills] = await Promise.all([
        tx.personSkill.count({
          where: {
            skillId: skill.id,
            person: {
              tenantId,
            },
          },
        }),
        tx.positionSkill.count({
          where: {
            skillId: skill.id,
            position: {
              tenantId,
            },
          },
        }),
      ]);

      if (personSkills > 0 || positionSkills > 0) {
        throw new BadRequestException('Cannot delete a skill that is still assigned.');
      }

      await tx.skill.delete({ where: { id: skill.id } });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.DELETE,
        'Skill',
        skill.id,
        this.skillState(skill),
        { deleted: true },
      );

      await this.enqueueOutbox(tx, tenantId, 'skill.catalog.deleted', 'Skill', skill.id, {
        skillId: skill.id,
        deleted: true,
      });

      return { deleted: true };
    });
  }

  async createPosition(actor: AuthenticatedPrincipal, dto: CreatePositionDto) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const references = await this.resolvePositionReferences(tx, tenantId, dto);
      const position = await tx.position.create({
        data: {
          tenantId,
          code: this.normalizeCode(dto.code),
          title: dto.title.trim(),
          description: dto.description,
          status: dto.status ?? PositionStatus.DRAFT,
          organizationNodeId: references.organizationNodeId,
          costCenterId: references.costCenterId,
          gradeId: references.gradeId,
          levelId: references.levelId,
          reportsToPositionId: references.reportsToPositionId,
          budgetedHeadcount: dto.budgetedHeadcount ?? 1,
          isCritical: dto.isCritical ?? false,
          isExecutive: dto.isExecutive ?? false,
          metadata: this.toJson(dto.metadata),
        },
        include: this.positionInclude,
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.CREATE, 'Position', position.id, null, {
        code: position.code,
        title: position.title,
        status: position.status,
        organizationNodeId: position.organizationNodeId,
        reportsToPositionId: position.reportsToPositionId,
      });

      await this.enqueueOutbox(tx, tenantId, 'position.created', 'Position', position.id, {
        positionId: position.id,
        code: position.code,
        status: position.status,
      });

      return this.withCapacity(position, 0);
    });
  }

  async listPositions(actor: AuthenticatedPrincipal, query: ListPositionsQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 50;

    const positions = await this.prisma.position.findMany({
      where: {
        tenantId,
        status: query.status,
        organizationNodeId: query.organizationNodeId,
        costCenterId: query.costCenterId,
        gradeId: query.gradeId,
        levelId: query.levelId,
        reportsToPositionId: query.reportsToPositionId,
        isCritical: query.isCritical,
        isExecutive: query.isExecutive,
        deletedAt: query.includeDeleted ? undefined : null,
        OR: query.search
          ? [
              { code: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { organizationNode: { name: { contains: query.search, mode: 'insensitive' } } },
              { costCenter: { name: { contains: query.search, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      include: this.positionInclude,
    });

    const hasNextPage = positions.length > limit;
    const pageData = hasNextPage ? positions.slice(0, limit) : positions;
    const usage = await this.currentPrimaryUsage(tenantId, pageData.map((position) => position.id));
    const data = pageData
      .map((position) => this.withCapacity(position, usage.get(position.id) ?? 0))
      .filter((position) => {
        if (query.vacantOnly && position.capacity.vacant <= 0) {
          return false;
        }

        if (query.overBudgetOnly && position.capacity.overBudget <= 0) {
          return false;
        }

        return true;
      });

    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? pageData.at(-1)?.id : null,
      },
    };
  }

  async getPosition(actor: AuthenticatedPrincipal, positionId: string) {
    const tenantId = this.requireTenant(actor);
    const position = await this.findPositionOrThrow(this.prisma, tenantId, positionId);
    const usage = await this.currentPrimaryUsage(tenantId, [position.id]);

    return this.withCapacity(position, usage.get(position.id) ?? 0);
  }

  async updatePosition(
    actor: AuthenticatedPrincipal,
    positionId: string,
    dto: UpdatePositionDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findPositionOrThrow(tx, tenantId, positionId);
      const references = await this.resolvePositionReferences(tx, tenantId, dto, existing);
      const budgetedHeadcount = dto.budgetedHeadcount ?? existing.budgetedHeadcount;

      if (dto.budgetedHeadcount !== undefined && !dto.allowUnderBudget) {
        await this.assertBudgetSupportsOccupancy(tx, tenantId, existing.id, budgetedHeadcount);
      }

      if (dto.status === PositionStatus.CLOSED || dto.status === PositionStatus.ARCHIVED) {
        await this.assertPositionCanClose(tx, tenantId, existing.id);
      }

      const updated = await tx.position.update({
        where: { id: existing.id },
        data: {
          code: dto.code ? this.normalizeCode(dto.code) : undefined,
          title: dto.title?.trim(),
          description: dto.description,
          status: dto.status,
          organizationNodeId: references.organizationNodeId,
          costCenterId: references.costCenterId,
          gradeId: references.gradeId,
          levelId: references.levelId,
          reportsToPositionId: references.reportsToPositionId,
          budgetedHeadcount: dto.budgetedHeadcount,
          isCritical: dto.isCritical,
          isExecutive: dto.isExecutive,
          metadata: this.toJson(dto.metadata ?? undefined),
          deletedAt: dto.status === PositionStatus.ARCHIVED ? new Date() : undefined,
        },
        include: this.positionInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'Position',
        updated.id,
        this.positionState(existing),
        this.positionState(updated),
      );

      await this.enqueueOutbox(tx, tenantId, 'position.updated', 'Position', updated.id, {
        positionId: updated.id,
        code: updated.code,
        status: updated.status,
      });

      const usage = await this.currentPrimaryUsage(tenantId, [updated.id], new Date(), tx);
      return this.withCapacity(updated, usage.get(updated.id) ?? 0);
    });
  }

  async deletePosition(actor: AuthenticatedPrincipal, positionId: string) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const position = await this.findPositionOrThrow(tx, tenantId, positionId);
      await this.assertPositionCanClose(tx, tenantId, position.id);

      const deleted = await tx.position.update({
        where: { id: position.id },
        data: {
          status: PositionStatus.ARCHIVED,
          deletedAt: new Date(),
        },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.DELETE,
        'Position',
        position.id,
        this.positionState(position),
        { status: deleted.status, deletedAt: deleted.deletedAt?.toISOString() ?? null },
      );

      await this.enqueueOutbox(tx, tenantId, 'position.deleted', 'Position', position.id, {
        positionId: position.id,
        deleted: true,
      });

      return { deleted: true };
    });
  }

  async activatePosition(
    actor: AuthenticatedPrincipal,
    positionId: string,
    dto: PositionStatusTransitionDto,
  ) {
    return this.transitionPosition(actor, positionId, PositionStatus.ACTIVE, dto, AuditAction.ACTIVATE);
  }

  async freezePosition(
    actor: AuthenticatedPrincipal,
    positionId: string,
    dto: PositionStatusTransitionDto,
  ) {
    return this.transitionPosition(actor, positionId, PositionStatus.FROZEN, dto, AuditAction.DISABLE);
  }

  async closePosition(
    actor: AuthenticatedPrincipal,
    positionId: string,
    dto: PositionStatusTransitionDto,
  ) {
    return this.transitionPosition(actor, positionId, PositionStatus.CLOSED, dto, AuditAction.DISABLE);
  }

  async archivePosition(
    actor: AuthenticatedPrincipal,
    positionId: string,
    dto: PositionStatusTransitionDto,
  ) {
    return this.transitionPosition(actor, positionId, PositionStatus.ARCHIVED, dto, AuditAction.ARCHIVE);
  }

  async reopenPosition(
    actor: AuthenticatedPrincipal,
    positionId: string,
    dto: PositionStatusTransitionDto,
  ) {
    return this.transitionPosition(actor, positionId, PositionStatus.DRAFT, dto, AuditAction.RESTORE, true);
  }

  async getPositionHierarchy(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const positions = await this.prisma.position.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
    const usage = await this.currentPrimaryUsage(tenantId, positions.map((position) => position.id));

    return this.buildPositionTree(positions, usage);
  }

  async getPositionOccupants(
    actor: AuthenticatedPrincipal,
    positionId: string,
    query: PositionOccupantsQueryDto,
  ) {
    const tenantId = this.requireTenant(actor);
    await this.findPositionOrThrow(this.prisma, tenantId, positionId);

    const limit = query.limit ?? 50;
    const activeOn = this.toDate(query.activeOn) ?? new Date();
    const assignments = await this.prisma.employeeAssignment.findMany({
      where: {
        tenantId,
        positionId,
        isPrimary: query.includeSecondary ? undefined : true,
        ...this.activeAssignmentWhere(activeOn),
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      include: this.occupantInclude,
    });

    return this.paginate(assignments, limit);
  }

  async addPositionSkill(
    actor: AuthenticatedPrincipal,
    positionId: string,
    dto: CreatePositionSkillDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      await this.findPositionOrThrow(tx, tenantId, positionId);
      const skillId = await this.resolveSkillForRequirement(tx, tenantId, dto);
      const positionSkill = await tx.positionSkill.upsert({
        where: {
          positionId_skillId: {
            positionId,
            skillId,
          },
        },
        create: {
          positionId,
          skillId,
          required: dto.required ?? true,
          minimumProficiency: dto.minimumProficiency,
        },
        update: {
          required: dto.required ?? true,
          minimumProficiency: dto.minimumProficiency,
        },
        include: {
          skill: true,
        },
      });

      await this.writeAudit(tx, actor, tenantId, AuditAction.UPDATE, 'PositionSkill', positionSkill.id, null, {
        positionId,
        skillId,
        required: positionSkill.required,
      });

      await this.enqueueOutbox(tx, tenantId, 'position.skill.upserted', 'Position', positionId, {
        positionId,
        skillId,
        positionSkillId: positionSkill.id,
      });

      return positionSkill;
    });
  }

  async updatePositionSkill(
    actor: AuthenticatedPrincipal,
    positionId: string,
    positionSkillId: string,
    dto: UpdatePositionSkillDto,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findPositionSkillOrThrow(tx, tenantId, positionId, positionSkillId);
      const updated = await tx.positionSkill.update({
        where: { id: existing.id },
        data: {
          required: dto.required,
          minimumProficiency: dto.minimumProficiency,
        },
        include: {
          skill: true,
        },
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'PositionSkill',
        updated.id,
        {
          positionId: existing.positionId,
          skillId: existing.skillId,
          required: existing.required,
          minimumProficiency: existing.minimumProficiency,
        },
        {
          positionId: updated.positionId,
          skillId: updated.skillId,
          required: updated.required,
          minimumProficiency: updated.minimumProficiency,
        },
      );

      await this.enqueueOutbox(tx, tenantId, 'position.skill.updated', 'Position', positionId, {
        positionId,
        skillId: updated.skillId,
        positionSkillId: updated.id,
      });

      return updated;
    });
  }

  async deletePositionSkill(
    actor: AuthenticatedPrincipal,
    positionId: string,
    positionSkillId: string,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findPositionSkillOrThrow(tx, tenantId, positionId, positionSkillId);
      await tx.positionSkill.delete({ where: { id: existing.id } });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        AuditAction.UPDATE,
        'PositionSkill',
        existing.id,
        {
          positionId: existing.positionId,
          skillId: existing.skillId,
          required: existing.required,
        },
        { deleted: true },
      );

      await this.enqueueOutbox(tx, tenantId, 'position.skill.deleted', 'Position', positionId, {
        positionId,
        skillId: existing.skillId,
        positionSkillId: existing.id,
      });

      return { deleted: true };
    });
  }

  async getSummary(actor: AuthenticatedPrincipal) {
    const tenantId = this.requireTenant(actor);
    const positions = await this.prisma.position.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        organizationNodeId: true,
        budgetedHeadcount: true,
        isCritical: true,
        isExecutive: true,
      },
    });
    const usage = await this.currentPrimaryUsage(tenantId, positions.map((position) => position.id));

    const byStatus: Partial<Record<PositionStatus, number>> = {};
    const byOrganizationNode = new Map<
      string,
      {
        organizationNodeId: string | null;
        positions: number;
        budgetedHeadcount: number;
        occupied: number;
        vacant: number;
        overBudget: number;
      }
    >();
    const positionsAtRisk: Array<{
      positionId: string;
      code: string;
      title: string;
      reason: string;
      capacity: PositionCapacity;
    }> = [];

    let totalBudgetedHeadcount = 0;
    let totalOccupied = 0;
    let criticalPositions = 0;
    let executivePositions = 0;

    for (const position of positions) {
      byStatus[position.status] = (byStatus[position.status] ?? 0) + 1;
      totalBudgetedHeadcount += position.budgetedHeadcount;
      const occupied = usage.get(position.id) ?? 0;
      totalOccupied += occupied;

      if (position.isCritical) {
        criticalPositions += 1;
      }

      if (position.isExecutive) {
        executivePositions += 1;
      }

      const capacity = this.capacityFor(position.budgetedHeadcount, occupied);
      const orgKey = position.organizationNodeId ?? 'unassigned';
      const currentOrg = byOrganizationNode.get(orgKey) ?? {
        organizationNodeId: position.organizationNodeId,
        positions: 0,
        budgetedHeadcount: 0,
        occupied: 0,
        vacant: 0,
        overBudget: 0,
      };

      currentOrg.positions += 1;
      currentOrg.budgetedHeadcount += position.budgetedHeadcount;
      currentOrg.occupied += occupied;
      currentOrg.vacant += capacity.vacant;
      currentOrg.overBudget += capacity.overBudget;
      byOrganizationNode.set(orgKey, currentOrg);

      if (capacity.overBudget > 0) {
        positionsAtRisk.push({
          positionId: position.id,
          code: position.code,
          title: position.title,
          reason: 'OVER_BUDGET',
          capacity,
        });
      } else if (position.isCritical && capacity.vacant > 0 && position.status === PositionStatus.ACTIVE) {
        positionsAtRisk.push({
          positionId: position.id,
          code: position.code,
          title: position.title,
          reason: 'CRITICAL_VACANCY',
          capacity,
        });
      }
    }

    return {
      totalPositions: positions.length,
      totalBudgetedHeadcount,
      totalOccupied,
      totalVacant: Math.max(totalBudgetedHeadcount - totalOccupied, 0),
      totalOverBudget: Math.max(totalOccupied - totalBudgetedHeadcount, 0),
      utilizationRate: this.utilizationRate(totalBudgetedHeadcount, totalOccupied),
      criticalPositions,
      executivePositions,
      byStatus,
      byOrganizationNode: Array.from(byOrganizationNode.values()),
      positionsAtRisk: positionsAtRisk.slice(0, 25),
    };
  }

  private async transitionPosition(
    actor: AuthenticatedPrincipal,
    positionId: string,
    targetStatus: PositionStatus,
    dto: PositionStatusTransitionDto,
    auditAction: AuditAction,
    restoreDeleted = false,
  ) {
    const tenantId = this.requireTenant(actor);

    return this.prisma.$transaction(async (tx) => {
      const position = await this.findPositionOrThrow(tx, tenantId, positionId, restoreDeleted);

      if (position.status === PositionStatus.ARCHIVED && !restoreDeleted) {
        throw new BadRequestException('Archived positions must be reopened before status changes.');
      }

      if (targetStatus === PositionStatus.ACTIVE && position.budgetedHeadcount < 1) {
        throw new BadRequestException('Active positions must have positive budgeted headcount.');
      }

      if (targetStatus === PositionStatus.CLOSED || targetStatus === PositionStatus.ARCHIVED) {
        await this.assertPositionCanClose(tx, tenantId, position.id);
      }

      const updated = await tx.position.update({
        where: { id: position.id },
        data: {
          status: targetStatus,
          deletedAt: targetStatus === PositionStatus.ARCHIVED ? new Date() : restoreDeleted ? null : undefined,
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
        include: this.positionInclude,
      });

      await this.writeAudit(
        tx,
        actor,
        tenantId,
        auditAction,
        'Position',
        position.id,
        this.positionState(position),
        {
          ...this.positionState(updated),
          reason: dto.reason,
          effectiveAt: this.toDate(dto.effectiveAt)?.toISOString() ?? new Date().toISOString(),
        },
      );

      await this.enqueueOutbox(
        tx,
        tenantId,
        `position.${targetStatus.toLowerCase()}`,
        'Position',
        updated.id,
        {
          positionId: updated.id,
          previousStatus: position.status,
          status: updated.status,
          reason: dto.reason,
        },
      );

      const usage = await this.currentPrimaryUsage(tenantId, [updated.id], new Date(), tx);
      return this.withCapacity(updated, usage.get(updated.id) ?? 0);
    });
  }

  private async resolvePositionReferences(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: PositionReferenceInput,
    existing?: Position,
  ) {
    const costCenterId =
      dto.costCenterId !== undefined ? dto.costCenterId : existing?.costCenterId ?? null;
    const costCenter = costCenterId ? await this.validateCostCenter(tx, tenantId, costCenterId) : null;
    let organizationNodeId =
      dto.organizationNodeId !== undefined
        ? dto.organizationNodeId
        : existing?.organizationNodeId ?? null;

    if (!organizationNodeId && costCenter?.organizationNodeId) {
      organizationNodeId = costCenter.organizationNodeId;
    }

    if (organizationNodeId && costCenter?.organizationNodeId && costCenter.organizationNodeId !== organizationNodeId) {
      throw new BadRequestException('Cost center belongs to a different organization node.');
    }

    const gradeId = dto.gradeId !== undefined ? dto.gradeId : existing?.gradeId ?? null;
    const levelId = dto.levelId !== undefined ? dto.levelId : existing?.levelId ?? null;
    const reportsToPositionId =
      dto.reportsToPositionId !== undefined
        ? dto.reportsToPositionId
        : existing?.reportsToPositionId ?? null;

    await Promise.all([
      this.validateOrganizationNode(tx, tenantId, organizationNodeId),
      this.validateGrade(tx, tenantId, gradeId),
      this.validateLevel(tx, tenantId, levelId),
      this.validateReportsToPosition(tx, tenantId, reportsToPositionId, existing?.id),
    ]);

    if (existing?.id && reportsToPositionId) {
      await this.assertReportsToChangeIsSafe(tx, tenantId, existing.id, reportsToPositionId);
    }

    return {
      organizationNodeId,
      costCenterId,
      gradeId,
      levelId,
      reportsToPositionId,
    };
  }

  private async validateOrganizationNode(
    tx: Prisma.TransactionClient,
    tenantId: string,
    organizationNodeId: string | null,
  ) {
    if (!organizationNodeId) {
      return;
    }

    const node = await tx.organizationNode.findFirst({
      where: {
        id: organizationNodeId,
        tenantId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });

    if (!node) {
      throw new BadRequestException('Organization node reference is invalid.');
    }
  }

  private async validateCostCenter(
    tx: Prisma.TransactionClient,
    tenantId: string,
    costCenterId: string,
  ) {
    const costCenter = await tx.costCenter.findFirst({
      where: {
        id: costCenterId,
        tenantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        organizationNodeId: true,
      },
    });

    if (!costCenter) {
      throw new BadRequestException('Cost center reference is invalid.');
    }

    return costCenter;
  }

  private async validateGrade(
    tx: Prisma.TransactionClient,
    tenantId: string,
    gradeId: string | null,
  ) {
    if (!gradeId) {
      return;
    }

    const grade = await tx.positionGrade.findFirst({
      where: {
        id: gradeId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!grade) {
      throw new BadRequestException('Position grade reference is invalid.');
    }
  }

  private async validateLevel(
    tx: Prisma.TransactionClient,
    tenantId: string,
    levelId: string | null,
  ) {
    if (!levelId) {
      return;
    }

    const level = await tx.positionLevel.findFirst({
      where: {
        id: levelId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!level) {
      throw new BadRequestException('Position level reference is invalid.');
    }
  }

  private async validateReportsToPosition(
    tx: Prisma.TransactionClient,
    tenantId: string,
    reportsToPositionId: string | null,
    currentPositionId?: string,
  ) {
    if (!reportsToPositionId) {
      return;
    }

    if (reportsToPositionId === currentPositionId) {
      throw new BadRequestException('A position cannot report to itself.');
    }

    const reportsToPosition = await tx.position.findFirst({
      where: {
        id: reportsToPositionId,
        tenantId,
        deletedAt: null,
        status: {
          not: PositionStatus.ARCHIVED,
        },
      },
      select: { id: true },
    });

    if (!reportsToPosition) {
      throw new BadRequestException('Reports-to position reference is invalid.');
    }
  }

  private async assertReportsToChangeIsSafe(
    tx: Prisma.TransactionClient,
    tenantId: string,
    positionId: string,
    reportsToPositionId: string,
  ) {
    let cursor: string | null = reportsToPositionId;
    const seen = new Set<string>();
    let depth = 0;

    while (cursor) {
      if (cursor === positionId) {
        throw new BadRequestException('Position hierarchy would create a cycle.');
      }

      if (seen.has(cursor)) {
        throw new BadRequestException('Existing position hierarchy contains a cycle.');
      }

      seen.add(cursor);
      depth += 1;

      if (depth > 100) {
        throw new BadRequestException('Position hierarchy is too deep to validate safely.');
      }

      const parent: { reportsToPositionId: string | null } | null = await tx.position.findFirst({
        where: {
          id: cursor,
          tenantId,
          deletedAt: null,
        },
        select: {
          reportsToPositionId: true,
        },
      });

      cursor = parent?.reportsToPositionId ?? null;
    }
  }

  private async assertBudgetSupportsOccupancy(
    tx: Prisma.TransactionClient,
    tenantId: string,
    positionId: string,
    budgetedHeadcount: number,
  ) {
    const occupied = await tx.employeeAssignment.count({
      where: {
        tenantId,
        positionId,
        isPrimary: true,
        ...this.activeAssignmentWhere(new Date()),
      },
    });

    if (occupied > budgetedHeadcount) {
      throw new BadRequestException('Budgeted headcount cannot be lower than current occupancy.');
    }
  }

  private async assertPositionCanClose(
    tx: Prisma.TransactionClient,
    tenantId: string,
    positionId: string,
  ) {
    const [openAssignments, activeChildren] = await Promise.all([
      tx.employeeAssignment.count({
        where: {
          tenantId,
          positionId,
          ...this.openAssignmentWhere(),
        },
      }),
      tx.position.count({
        where: {
          tenantId,
          reportsToPositionId: positionId,
          deletedAt: null,
          status: {
            not: PositionStatus.ARCHIVED,
          },
        },
      }),
    ]);

    if (openAssignments > 0) {
      throw new BadRequestException('Cannot close or archive a position with open assignments.');
    }

    if (activeChildren > 0) {
      throw new BadRequestException('Cannot close or archive a position with active child positions.');
    }
  }

  private async resolveSkillForRequirement(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreatePositionSkillDto,
  ) {
    if (dto.skillId) {
      const skill = await this.findSkillForReadOrThrow(tx, tenantId, dto.skillId);
      return skill.id;
    }

    if (!dto.skillName) {
      throw new BadRequestException('Either skillId or skillName is required.');
    }

    const skill = await tx.skill.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: dto.skillName.trim(),
        },
      },
      create: {
        tenantId,
        name: dto.skillName.trim(),
        category: dto.category,
      },
      update: {
        category: dto.category,
      },
    });

    return skill.id;
  }

  private async findPositionSkillOrThrow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    positionId: string,
    positionSkillId: string,
  ) {
    const positionSkill = await tx.positionSkill.findFirst({
      where: {
        id: positionSkillId,
        positionId,
        position: {
          tenantId,
          deletedAt: null,
        },
      },
    });

    if (!positionSkill) {
      throw new NotFoundException('Position skill not found.');
    }

    return positionSkill;
  }

  private async findPositionOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    positionId: string,
    includeDeleted = false,
  ) {
    const position = await client.position.findFirst({
      where: {
        id: positionId,
        tenantId,
        deletedAt: includeDeleted ? undefined : null,
      },
      include: this.positionInclude,
    });

    if (!position) {
      throw new NotFoundException('Position not found.');
    }

    return position;
  }

  private async findGradeOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    gradeId: string,
  ) {
    const grade = await client.positionGrade.findFirst({
      where: {
        id: gradeId,
        tenantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            positions: true,
            assignments: true,
          },
        },
      },
    });

    if (!grade) {
      throw new NotFoundException('Position grade not found.');
    }

    return grade;
  }

  private async findLevelOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    levelId: string,
  ) {
    const level = await client.positionLevel.findFirst({
      where: {
        id: levelId,
        tenantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            positions: true,
            assignments: true,
          },
        },
      },
    });

    if (!level) {
      throw new NotFoundException('Position level not found.');
    }

    return level;
  }

  private async findSkillForReadOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    skillId: string,
  ) {
    const skill = await client.skill.findFirst({
      where: {
        id: skillId,
        OR: [{ tenantId: null }, { tenantId }],
      },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found.');
    }

    return skill;
  }

  private async findTenantSkillOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    skillId: string,
  ) {
    const skill = await client.skill.findFirst({
      where: {
        id: skillId,
        tenantId,
      },
    });

    if (!skill) {
      throw new NotFoundException('Tenant-owned skill not found.');
    }

    return skill;
  }

  private async currentPrimaryUsage(
    tenantId: string,
    positionIds: string[],
    asOf = new Date(),
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (positionIds.length === 0) {
      return new Map<string, number>();
    }

    const usage = await client.employeeAssignment.groupBy({
      by: ['positionId'],
      where: {
        tenantId,
        positionId: {
          in: positionIds,
        },
        isPrimary: true,
        ...this.activeAssignmentWhere(asOf),
      },
      _count: {
        _all: true,
      },
    });

    return new Map(
      usage
        .filter((item) => item.positionId)
        .map((item) => [item.positionId as string, item._count._all]),
    );
  }

  private buildPositionTree(positions: Position[], usage: Map<string, number>) {
    const byId = new Map<string, PositionTreeNode>();
    const roots: PositionTreeNode[] = [];

    for (const position of positions) {
      byId.set(position.id, {
        id: position.id,
        code: position.code,
        title: position.title,
        status: position.status,
        organizationNodeId: position.organizationNodeId,
        costCenterId: position.costCenterId,
        gradeId: position.gradeId,
        levelId: position.levelId,
        reportsToPositionId: position.reportsToPositionId,
        isCritical: position.isCritical,
        isExecutive: position.isExecutive,
        capacity: this.capacityFor(position.budgetedHeadcount, usage.get(position.id) ?? 0),
        children: [],
      });
    }

    for (const position of byId.values()) {
      if (position.reportsToPositionId && byId.has(position.reportsToPositionId)) {
        byId.get(position.reportsToPositionId)?.children.push(position);
      } else {
        roots.push(position);
      }
    }

    return roots;
  }

  private withCapacity<TPosition extends { budgetedHeadcount: number }>(
    position: TPosition,
    occupied: number,
  ) {
    return {
      ...position,
      capacity: this.capacityFor(position.budgetedHeadcount, occupied),
    };
  }

  private capacityFor(budgetedHeadcount: number, occupied: number): PositionCapacity {
    return {
      budgetedHeadcount,
      occupied,
      vacant: Math.max(budgetedHeadcount - occupied, 0),
      overBudget: Math.max(occupied - budgetedHeadcount, 0),
      utilizationRate: this.utilizationRate(budgetedHeadcount, occupied),
    };
  }

  private utilizationRate(budgetedHeadcount: number, occupied: number) {
    if (budgetedHeadcount <= 0) {
      return 0;
    }

    return Number((occupied / budgetedHeadcount).toFixed(4));
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedPrincipal,
    tenantId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: actor.id,
        action,
        module: 'positions',
        entityType,
        entityId,
        before: before ?? undefined,
        after,
      },
    });
  }

  private async enqueueOutbox(
    tx: Prisma.TransactionClient,
    tenantId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Prisma.InputJsonValue,
  ) {
    await tx.outboxMessage.create({
      data: {
        tenantId,
        eventType,
        aggregateType,
        aggregateId,
        payload,
      },
    });
  }

  private positionState(position: PositionStateSource): Prisma.InputJsonObject {
    return {
      id: position.id,
      code: position.code,
      title: position.title,
      status: position.status,
      organizationNodeId: position.organizationNodeId,
      costCenterId: position.costCenterId,
      gradeId: position.gradeId,
      levelId: position.levelId,
      reportsToPositionId: position.reportsToPositionId,
      budgetedHeadcount: position.budgetedHeadcount,
      isCritical: position.isCritical,
      isExecutive: position.isExecutive,
      deletedAt: position.deletedAt?.toISOString() ?? null,
    };
  }

  private gradeState(grade: PositionGrade): Prisma.InputJsonObject {
    return {
      id: grade.id,
      code: grade.code,
      name: grade.name,
      rank: grade.rank,
      description: grade.description,
      deletedAt: grade.deletedAt?.toISOString() ?? null,
    };
  }

  private levelState(level: PositionLevel): Prisma.InputJsonObject {
    return {
      id: level.id,
      code: level.code,
      name: level.name,
      rank: level.rank,
      description: level.description,
      deletedAt: level.deletedAt?.toISOString() ?? null,
    };
  }

  private skillState(skill: Skill): Prisma.InputJsonObject {
    return {
      id: skill.id,
      tenantId: skill.tenantId,
      name: skill.name,
      category: skill.category,
    };
  }

  private paginate<TItem>(items: TItem[], limit: number) {
    const hasNextPage = items.length > limit;
    const data = hasNextPage ? items.slice(0, limit) : items;

    return {
      data,
      page: {
        limit,
        nextCursor: hasNextPage ? (data.at(-1) as { id?: string } | undefined)?.id : null,
      },
    };
  }

  private activeAssignmentWhere(asOf: Date): Prisma.EmployeeAssignmentWhereInput {
    return {
      effectiveFrom: {
        lte: asOf,
      },
      OR: [
        { effectiveTo: null },
        {
          effectiveTo: {
            gt: asOf,
          },
        },
      ],
    };
  }

  private openAssignmentWhere(): Prisma.EmployeeAssignmentWhereInput {
    return {
      effectiveFrom: {
        lt: FAR_FUTURE,
      },
      OR: [
        { effectiveTo: null },
        {
          effectiveTo: {
            gt: new Date(),
          },
        },
      ],
    };
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private requireTenant(actor: AuthenticatedPrincipal): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant context is required.');
    }

    return actor.tenantId;
  }

  private toDate(value?: string): Date | undefined {
    return value ? new Date(value) : undefined;
  }

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private get positionInclude() {
    return {
      organizationNode: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
      },
      costCenter: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      grade: true,
      level: true,
      reportsToPosition: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
        },
      },
      skills: {
        include: {
          skill: true,
        },
        orderBy: [{ required: 'desc' }, { createdAt: 'asc' }],
      },
      _count: {
        select: {
          childPositions: true,
          assignments: true,
          skills: true,
        },
      },
    } satisfies Prisma.PositionInclude;
  }

  private get occupantInclude() {
    return {
      employee: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              middleName: true,
              lastName: true,
              preferredName: true,
              photoUrl: true,
            },
          },
        },
      },
      organizationNode: true,
      costCenter: true,
      grade: true,
      level: true,
      managerEmployee: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      },
    } satisfies Prisma.EmployeeAssignmentInclude;
  }
}

type PositionReferenceInput = {
  organizationNodeId?: string | null;
  costCenterId?: string | null;
  gradeId?: string | null;
  levelId?: string | null;
  reportsToPositionId?: string | null;
};

type PositionStateSource = {
  id: string;
  code: string;
  title: string;
  status: PositionStatus;
  organizationNodeId: string | null;
  costCenterId: string | null;
  gradeId: string | null;
  levelId: string | null;
  reportsToPositionId: string | null;
  budgetedHeadcount: number;
  isCritical: boolean;
  isExecutive: boolean;
  deletedAt: Date | null;
};
