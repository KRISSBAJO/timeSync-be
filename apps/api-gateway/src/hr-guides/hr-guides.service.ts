import { createHash } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  HrArticleAuthorType,
  HrArticleCommentStatus,
  HrArticleReactionType,
  HrArticleStatus,
  HrArticleVisibility,
  Prisma,
  UserType,
} from '@prisma/client';
import type { Request } from 'express';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { CreateHrArticleDto } from './dto/create-hr-article.dto';
import { CreateHrArticleCommentDto } from './dto/create-hr-article-comment.dto';
import { HrArticleReactionDto } from './dto/hr-article-reaction.dto';
import { ListHrArticlesQueryDto } from './dto/list-hr-articles-query.dto';
import { UpdateHrArticleDto } from './dto/update-hr-article.dto';
import { UpdateHrArticleStatusDto } from './dto/update-hr-article-status.dto';

const publicArticleInclude = {
  category: true,
} satisfies Prisma.HrArticleInclude;

@Injectable()
export class HrGuidesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories() {
    return this.prisma.hrArticleCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listPublishedArticles(query: ListHrArticlesQueryDto) {
    const limit = query.limit ?? 12;
    const offset = query.offset ?? 0;
    const where = this.buildPublishedWhere(query);

    const [data, total, categories] = await this.prisma.$transaction([
      this.prisma.hrArticle.findMany({
        where,
        include: publicArticleInclude,
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.hrArticle.count({ where }),
      this.prisma.hrArticleCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      data,
      categories,
      page: {
        limit,
        offset,
        total,
      },
    };
  }

  async getPublishedArticle(slug: string, request: Request) {
    const article = await this.prisma.hrArticle.findFirst({
      where: this.publishedArticleBySlugWhere(slug),
      include: publicArticleInclude,
    });

    if (!article) {
      throw new NotFoundException('HR guide article not found.');
    }

    const visitorHash = this.buildVisitorHash(request);
    const referrer = request.header('referer') ?? request.header('referrer');

    await this.prisma.$transaction([
      this.prisma.hrArticle.update({
        where: { id: article.id },
        data: { readCount: { increment: 1 } },
      }),
      this.prisma.hrArticleRead.create({
        data: {
          articleId: article.id,
          visitorHash,
          ipAddress: request.ip,
          userAgent: request.header('user-agent'),
          referrer,
        },
      }),
    ]);

    const [comments, related] = await this.prisma.$transaction([
      this.prisma.hrArticleComment.findMany({
        where: {
          articleId: article.id,
          status: HrArticleCommentStatus.APPROVED,
          deletedAt: null,
          parentId: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.hrArticle.findMany({
        where: {
          id: { not: article.id },
          status: HrArticleStatus.PUBLISHED,
          visibility: HrArticleVisibility.PUBLIC,
          deletedAt: null,
          OR: [
            { categoryId: article.categoryId },
            article.tags.length ? { tags: { hasSome: article.tags } } : {},
          ],
        },
        include: publicArticleInclude,
        orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }],
        take: 3,
      }),
    ]);

    return {
      ...article,
      readCount: article.readCount + 1,
      comments,
      related,
    };
  }

  async createPublicComment(slug: string, dto: CreateHrArticleCommentDto, request: Request) {
    const article = await this.findPublishedBySlug(slug);

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.hrArticleComment.create({
        data: {
          articleId: article.id,
          displayName: dto.displayName.trim(),
          email: dto.email?.trim().toLowerCase(),
          body: dto.body.trim(),
          status: HrArticleCommentStatus.APPROVED,
          approvedAt: new Date(),
          metadata: {
            ipAddress: request.ip,
            userAgent: request.header('user-agent'),
            source: 'public-article',
          },
        },
      });

      await tx.hrArticle.update({
        where: { id: article.id },
        data: { commentCount: { increment: 1 } },
      });

      return comment;
    });
  }

  async togglePublicReaction(slug: string, dto: HrArticleReactionDto, request: Request) {
    const article = await this.findPublishedBySlug(slug);
    const type = dto.type ?? HrArticleReactionType.LIKE;
    const visitorHash = this.buildVisitorHash(request);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.hrArticleReaction.findFirst({
        where: {
          articleId: article.id,
          visitorHash,
          type,
        },
      });

      const counterField = this.counterFieldForReaction(type);
      if (existing) {
        await tx.hrArticleReaction.delete({ where: { id: existing.id } });
        const updated = await tx.hrArticle.update({
          where: { id: article.id },
          data: {
            [counterField]: { decrement: 1 },
          },
        });

        return {
          active: false,
          type,
          likeCount: updated.likeCount,
          helpfulCount: updated.helpfulCount,
        };
      }

      await tx.hrArticleReaction.create({
        data: {
          articleId: article.id,
          visitorHash,
          type,
        },
      });
      const updated = await tx.hrArticle.update({
        where: { id: article.id },
        data: {
          [counterField]: { increment: 1 },
        },
      });

      return {
        active: true,
        type,
        likeCount: updated.likeCount,
        helpfulCount: updated.helpfulCount,
      };
    });
  }

  async listPlatformArticles(query: ListHrArticlesQueryDto) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    const where: Prisma.HrArticleWhereInput = {
      deletedAt: null,
      status: query.status,
    };

    if (query.category) {
      where.category = { slug: query.category };
    }

    if (query.tag) {
      where.tags = { has: query.tag };
    }

    if (typeof query.featured === 'boolean') {
      where.featured = query.featured;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { subtitle: { contains: search, mode: 'insensitive' } },
        { excerpt: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total, categories] = await this.prisma.$transaction([
      this.prisma.hrArticle.findMany({
        where,
        include: publicArticleInclude,
        orderBy: [{ updatedAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.hrArticle.count({ where }),
      this.prisma.hrArticleCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      data,
      categories,
      page: {
        limit,
        offset,
        total,
      },
    };
  }

  async getPlatformArticle(id: string) {
    const article = await this.prisma.hrArticle.findUnique({
      where: { id },
      include: {
        category: true,
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!article || article.deletedAt) {
      throw new NotFoundException('HR guide article not found.');
    }

    return article;
  }

  async createPlatformArticle(actor: AuthenticatedPrincipal, dto: CreateHrArticleDto) {
    const data = (await this.normalizeArticleData(
      actor,
      dto,
    )) as Prisma.HrArticleUncheckedCreateInput;

    return this.prisma.hrArticle.create({
      data: {
        ...data,
        createdById: actor.id,
        updatedById: actor.id,
      },
      include: publicArticleInclude,
    });
  }

  async updatePlatformArticle(actor: AuthenticatedPrincipal, id: string, dto: UpdateHrArticleDto) {
    await this.getPlatformArticle(id);
    const data = await this.normalizeArticleData(actor, dto, true);

    return this.prisma.hrArticle.update({
      where: { id },
      data: {
        ...data,
        updatedById: actor.id,
      },
      include: publicArticleInclude,
    });
  }

  async updatePlatformArticleStatus(
    actor: AuthenticatedPrincipal,
    id: string,
    dto: UpdateHrArticleStatusDto,
  ) {
    await this.getPlatformArticle(id);
    const now = new Date();

    return this.prisma.hrArticle.update({
      where: { id },
      data: {
        status: dto.status,
        publishedAt: dto.status === HrArticleStatus.PUBLISHED ? now : undefined,
        archivedAt: dto.status === HrArticleStatus.ARCHIVED ? now : null,
        updatedById: actor.id,
        metadata: dto.note ? { moderationNote: dto.note } : undefined,
      },
      include: publicArticleInclude,
    });
  }

  async deletePlatformArticle(actor: AuthenticatedPrincipal, id: string) {
    await this.getPlatformArticle(id);

    return this.prisma.hrArticle.update({
      where: { id },
      data: {
        status: HrArticleStatus.ARCHIVED,
        archivedAt: new Date(),
        deletedAt: new Date(),
        updatedById: actor.id,
      },
    });
  }

  private buildPublishedWhere(query: ListHrArticlesQueryDto): Prisma.HrArticleWhereInput {
    const where: Prisma.HrArticleWhereInput = {
      status: HrArticleStatus.PUBLISHED,
      visibility: HrArticleVisibility.PUBLIC,
      deletedAt: null,
    };

    if (query.category) {
      where.category = { slug: query.category, isActive: true };
    }

    if (query.tag) {
      where.tags = { has: query.tag };
    }

    if (typeof query.featured === 'boolean') {
      where.featured = query.featured;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { subtitle: { contains: search, mode: 'insensitive' } },
        { excerpt: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ];
    }

    return where;
  }

  private publishedArticleBySlugWhere(slug: string): Prisma.HrArticleWhereInput {
    return {
      slug,
      status: HrArticleStatus.PUBLISHED,
      visibility: HrArticleVisibility.PUBLIC,
      deletedAt: null,
    };
  }

  private async findPublishedBySlug(slug: string) {
    const article = await this.prisma.hrArticle.findFirst({
      where: this.publishedArticleBySlugWhere(slug),
    });

    if (!article) {
      throw new NotFoundException('HR guide article not found.');
    }

    return article;
  }

  private async normalizeArticleData(
    actor: AuthenticatedPrincipal,
    dto: Partial<CreateHrArticleDto>,
    partial = false,
  ): Promise<Prisma.HrArticleUncheckedCreateInput | Prisma.HrArticleUncheckedUpdateInput> {
    const categoryId = dto.categorySlug
      ? (await this.resolveCategoryId(dto.categorySlug)).id
      : undefined;
    const author = await this.resolveAuthor(actor, dto);
    const status = dto.status;
    const now = new Date();
    const title = dto.title?.trim();
    const slug = dto.slug?.trim() || (title ? this.slugify(title) : undefined);

    return {
      categoryId,
      slug,
      title,
      subtitle: this.optionalTrim(dto.subtitle),
      excerpt: dto.excerpt?.trim(),
      body: dto.body?.trim(),
      heroImageUrl: this.optionalTrim(dto.heroImageUrl),
      readingMinutes: dto.readingMinutes,
      status,
      visibility: dto.visibility ?? (partial ? undefined : HrArticleVisibility.PUBLIC),
      featured: dto.featured,
      pinned: dto.pinned,
      tags: dto.tags?.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      seoTitle: this.optionalTrim(dto.seoTitle) ?? title,
      seoDescription: this.optionalTrim(dto.seoDescription) ?? dto.excerpt?.trim(),
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      ...author,
      publishedAt: status === HrArticleStatus.PUBLISHED ? now : undefined,
      archivedAt: status === HrArticleStatus.ARCHIVED ? now : undefined,
    };
  }

  private async resolveCategoryId(slug: string) {
    const normalizedSlug = this.slugify(slug);
    return this.prisma.hrArticleCategory.upsert({
      where: { slug: normalizedSlug },
      create: {
        slug: normalizedSlug,
        name: this.titleCase(slug),
      },
      update: {
        isActive: true,
      },
    });
  }

  private async resolveAuthor(actor: AuthenticatedPrincipal, dto: Partial<CreateHrArticleDto>) {
    if (dto.authorType === HrArticleAuthorType.APP) {
      return {
        authorType: HrArticleAuthorType.APP,
        authoredByApp: true,
        authorUserId: null,
        authorPersonId: null,
        authorName: dto.authorName?.trim() || 'TimeSync Editorial',
        authorTitle: dto.authorTitle?.trim() || 'WorkforceOS Research',
        authorAvatarUrl: dto.authorAvatarUrl?.trim() || '/images/logo.png',
      };
    }

    if (dto.authorPersonId) {
      const person = await this.prisma.person.findUnique({
        where: { id: dto.authorPersonId },
      });

      if (!person) {
        throw new NotFoundException('Author person not found.');
      }

      const name = [person.preferredName ?? person.firstName, person.lastName].filter(Boolean).join(' ');
      return {
        authorType: HrArticleAuthorType.PERSON,
        authoredByApp: false,
        authorUserId: person.userId,
        authorPersonId: person.id,
        authorName: dto.authorName?.trim() || name,
        authorTitle: dto.authorTitle?.trim() || 'People Operations',
        authorAvatarUrl: dto.authorAvatarUrl?.trim() || person.photoUrl,
      };
    }

    const authorUserId = dto.authorUserId ?? actor.id;
    const authorUser = await this.prisma.user.findUnique({
      where: { id: authorUserId },
      include: { person: true },
    });

    if (!authorUser) {
      throw new NotFoundException('Author user not found.');
    }

    const personName = authorUser.person
      ? [authorUser.person.preferredName ?? authorUser.person.firstName, authorUser.person.lastName]
          .filter(Boolean)
          .join(' ')
      : undefined;
    const authorType =
      authorUser.type === UserType.PLATFORM_ADMIN
        ? HrArticleAuthorType.PLATFORM_USER
        : HrArticleAuthorType.TENANT_USER;

    return {
      authorType,
      authoredByApp: false,
      authorUserId: authorUser.id,
      authorPersonId: authorUser.person?.id,
      authorName: dto.authorName?.trim() || personName || authorUser.username || authorUser.email,
      authorTitle:
        dto.authorTitle?.trim() ||
        (authorUser.type === UserType.PLATFORM_ADMIN ? 'Platform Administrator' : 'HR Contributor'),
      authorAvatarUrl: dto.authorAvatarUrl?.trim() || authorUser.person?.photoUrl || '/images/logo.png',
    };
  }

  private counterFieldForReaction(type: HrArticleReactionType) {
    return type === HrArticleReactionType.HELPFUL ? 'helpfulCount' : 'likeCount';
  }

  private buildVisitorHash(request: Request) {
    const raw = [
      request.ip,
      request.header('user-agent'),
      request.header('accept-language'),
    ].join('|');

    return createHash('sha256').update(raw).digest('hex');
  }

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 220);
  }

  private titleCase(value: string) {
    return value
      .replace(/[-_]+/g, ' ')
      .replace(/\w\S*/g, (word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase());
  }

  private optionalTrim(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }
}
