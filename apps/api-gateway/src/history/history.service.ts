import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  NotificationChannel,
  NotificationStatus,
  OutboxStatus,
  UserStatus,
  type OutboxMessage,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { ListActivityLogsQueryDto } from './dto/list-activity-logs-query.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { ListOutboxMessagesQueryDto } from './dto/list-outbox-messages-query.dto';
import { ListTimelineEventsQueryDto } from './dto/list-timeline-events-query.dto';
import { ProcessOutboxMessagesDto, RetryOutboxMessageDto } from './dto/outbox-actions.dto';
import { HistoryWriterService } from './history-writer.service';

@Injectable()
export class HistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: HistoryWriterService,
  ) {}

  async listAuditLogs(actor: AuthenticatedPrincipal, query: ListAuditLogsQueryDto) {
    const limit = query.limit ?? 50;
    const tenantId = this.resolveNullableTenantScope(actor, query.tenantId);

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        actorUserId: query.actorUserId,
        action: query.action,
        module: query.module,
        entityType: query.entityType,
        entityId: query.entityId,
        createdAt: this.dateRange(query.createdFrom, query.createdTo),
        OR: query.search
          ? [
              { module: { contains: query.search, mode: 'insensitive' } },
              { entityType: { contains: query.search, mode: 'insensitive' } },
              { entityId: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.auditInclude,
    });

    return this.paginate(auditLogs, limit);
  }

  async listActivityLogs(actor: AuthenticatedPrincipal, query: ListActivityLogsQueryDto) {
    const limit = query.limit ?? 50;
    const tenantId = this.resolveNullableTenantScope(actor, query.tenantId);

    const activityLogs = await this.prisma.activityLog.findMany({
      where: {
        tenantId,
        userId: query.userId,
        module: query.module,
        createdAt: this.dateRange(query.createdFrom, query.createdTo),
        OR: query.search
          ? [
              { module: { contains: query.search, mode: 'insensitive' } },
              { message: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.activityInclude,
    });

    return this.paginate(activityLogs, limit);
  }

  async listTimelineEvents(actor: AuthenticatedPrincipal, query: ListTimelineEventsQueryDto) {
    const limit = query.limit ?? 50;
    const tenantId = this.resolveRequiredTenantScope(actor, query.tenantId);

    const timelineEvents = await this.prisma.timelineEvent.findMany({
      where: {
        tenantId,
        employeeId: query.employeeId,
        actorUserId: query.actorUserId,
        type: query.type,
        entityType: query.entityType,
        entityId: query.entityId,
        createdAt: this.dateRange(query.createdFrom, query.createdTo),
        OR: query.search
          ? [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { entityType: { contains: query.search, mode: 'insensitive' } },
              { entityId: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.timelineInclude,
    });

    return this.paginate(timelineEvents, limit);
  }

  async listOutboxMessages(actor: AuthenticatedPrincipal, query: ListOutboxMessagesQueryDto) {
    const limit = query.limit ?? 50;
    const tenantId = this.resolveNullableTenantScope(actor, query.tenantId);

    const outboxMessages = await this.prisma.outboxMessage.findMany({
      where: {
        tenantId,
        status: query.status,
        eventType: query.eventType,
        aggregateType: query.aggregateType,
        aggregateId: query.aggregateId,
        availableAt: query.availableBefore ? { lte: new Date(query.availableBefore) } : undefined,
        OR: query.search
          ? [
              { eventType: { contains: query.search, mode: 'insensitive' } },
              { aggregateType: { contains: query.search, mode: 'insensitive' } },
              { aggregateId: { contains: query.search, mode: 'insensitive' } },
              { lastError: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: this.outboxInclude,
    });

    return this.paginate(outboxMessages, limit);
  }

  async getOutboxMessage(actor: AuthenticatedPrincipal, messageId: string) {
    const message = await this.findScopedOutboxMessageOrThrow(actor, messageId);
    return message;
  }

  async broadcastOutboxMessage(actor: AuthenticatedPrincipal, messageId: string) {
    const message = await this.findScopedOutboxMessageOrThrow(actor, messageId);

    if (!message.tenantId) {
      throw new BadRequestException('Only tenant-scoped outbox messages can be broadcast to stewards.');
    }

    const recipients = await this.prisma.user.findMany({
      where: {
        tenantId: message.tenantId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
        OR: [
          { id: actor.id },
          {
            userRoles: {
              some: {
                role: {
                  code: { in: ['TENANT_ADMIN', 'HR_ADMIN', 'HR_MANAGER'] },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        email: true,
      },
      take: 25,
      orderBy: [{ createdAt: 'asc' }],
    });

    if (recipients.length === 0) {
      throw new BadRequestException('No active tenant stewards are available to receive this broadcast.');
    }

    return this.prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          tenantId: message.tenantId!,
          channel: NotificationChannel.IN_APP,
          title: `Outbox event needs attention: ${message.eventType}`,
          body: this.outboxBroadcastBody(message),
          status: NotificationStatus.SENT,
          templateCode: 'OUTBOX_STEWARD_ALERT',
          data: this.toJson({
            module: 'outbox',
            outboxMessageId: message.id,
            eventType: message.eventType,
            aggregateType: message.aggregateType,
            aggregateId: message.aggregateId,
            status: message.status,
            lastError: message.lastError,
          }),
          sentAt: new Date(),
          recipients: {
            create: recipients.map((recipient) => ({
              userId: recipient.id,
              destination: recipient.email,
              status: NotificationStatus.SENT,
              deliveredAt: new Date(),
            })),
          },
        },
        include: {
          recipients: true,
        },
      });
      const updatedMessage = await tx.outboxMessage.update({
        where: { id: message.id },
        data: {
          headers: this.mergeJsonObject(message.headers, {
            stewardBroadcastAt: new Date().toISOString(),
            stewardBroadcastById: actor.id,
            stewardNotificationId: notification.id,
            stewardRecipientCount: notification.recipients.length,
          }),
        },
        include: this.outboxInclude,
      });

      await this.writer.writeAudit(tx, {
        tenantId: message.tenantId,
        actorUserId: actor.id,
        action: AuditAction.CREATE,
        module: 'outbox',
        entityType: 'Notification',
        entityId: notification.id,
        after: {
          outboxMessageId: message.id,
          recipientCount: notification.recipients.length,
        },
      });

      await this.writer.writeActivity(tx, {
        tenantId: message.tenantId,
        userId: actor.id,
        module: 'outbox',
        message: `Broadcasted outbox steward alert for ${message.eventType}.`,
        metadata: {
          outboxMessageId: message.id,
          notificationId: notification.id,
          recipientCount: notification.recipients.length,
        },
      });

      return {
        message: updatedMessage,
        notification,
        recipientCount: notification.recipients.length,
      };
    });
  }

  async retryOutboxMessage(
    actor: AuthenticatedPrincipal,
    messageId: string,
    dto: RetryOutboxMessageDto,
  ) {
    const existing = await this.findScopedOutboxMessageOrThrow(actor, messageId);
    const availableAt = dto.availableAt ? new Date(dto.availableAt) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.outboxMessage.update({
        where: { id: existing.id },
        data: {
          status: OutboxStatus.PENDING,
          attempts: dto.resetAttempts ? 0 : existing.attempts,
          availableAt,
          failedAt: null,
          processedAt: null,
          lastError: null,
          headers: this.mergeJsonObject(existing.headers, {
            retryRequestedAt: new Date().toISOString(),
            retryRequestedById: actor.id,
            retryNote: dto.note,
          }),
        },
        include: this.outboxInclude,
      });

      await this.writer.writeAudit(tx, {
        tenantId: updated.tenantId,
        actorUserId: actor.id,
        action: AuditAction.UPDATE,
        module: 'outbox',
        entityType: 'OutboxMessage',
        entityId: updated.id,
        before: this.outboxState(existing),
        after: this.outboxState(updated),
      });

      await this.writer.writeActivity(tx, {
        tenantId: updated.tenantId,
        userId: actor.id,
        module: 'outbox',
        message: `Outbox message retry scheduled for ${updated.eventType}.`,
        metadata: {
          outboxMessageId: updated.id,
          availableAt: availableAt.toISOString(),
          resetAttempts: dto.resetAttempts ?? false,
        },
      });

      return updated;
    });
  }

  async processOutboxMessages(actor: AuthenticatedPrincipal, dto: ProcessOutboxMessagesDto) {
    const limit = dto.limit ?? 25;
    const maxAttempts = dto.maxAttempts ?? 8;
    const tenantId = this.resolveNullableTenantScope(actor, undefined);
    const now = new Date();

    const messages = await this.prisma.outboxMessage.findMany({
      where: {
        tenantId,
        status: OutboxStatus.PENDING,
        availableAt: { lte: now },
        attempts: { lt: maxAttempts },
      },
      take: limit,
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    const results = [];

    for (const message of messages) {
      results.push(await this.processSingleOutboxMessage(actor, message, maxAttempts, dto.headers));
    }

    return {
      requested: limit,
      processed: results.length,
      published: results.filter((result) => result.status === OutboxStatus.PUBLISHED).length,
      failed: results.filter((result) => result.status === OutboxStatus.FAILED).length,
      results,
    };
  }

  async getOutboxSummary(actor: AuthenticatedPrincipal, tenantIdQuery?: string) {
    const tenantId = this.resolveNullableTenantScope(actor, tenantIdQuery);
    const groups = await this.prisma.outboxMessage.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { _all: true },
    });
    const overdue = await this.prisma.outboxMessage.count({
      where: {
        tenantId,
        status: OutboxStatus.PENDING,
        availableAt: { lte: new Date() },
      },
    });

    return {
      overdue,
      byStatus: Object.fromEntries(groups.map((item) => [item.status, item._count._all])),
    };
  }

  private async processSingleOutboxMessage(
    actor: AuthenticatedPrincipal,
    message: OutboxMessage,
    maxAttempts: number,
    headers?: Record<string, unknown>,
  ) {
    const claimed = await this.prisma.outboxMessage.updateMany({
      where: {
        id: message.id,
        status: OutboxStatus.PENDING,
      },
      data: {
        status: OutboxStatus.PROCESSING,
        attempts: { increment: 1 },
        headers: this.mergeJsonObject(message.headers, {
          ...headers,
          processingStartedAt: new Date().toISOString(),
          processingActorUserId: actor.id,
        }),
      },
    });

    if (claimed.count === 0) {
      return {
        id: message.id,
        eventType: message.eventType,
        status: message.status,
        skipped: true,
      };
    }

    try {
      const publishResult = this.publishOutboxMessage(message);
      const updated = await this.prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: OutboxStatus.PUBLISHED,
          processedAt: new Date(),
          failedAt: null,
          lastError: null,
          headers: this.mergeJsonObject(message.headers, publishResult),
        },
      });

      return {
        id: updated.id,
        eventType: updated.eventType,
        status: updated.status,
        attempts: updated.attempts,
      };
    } catch (error) {
      const nextAttempts = message.attempts + 1;
      const failedTerminally = nextAttempts >= maxAttempts;
      const availableAt = failedTerminally
        ? this.addDays(new Date(), 3650)
        : this.nextRetryAt(nextAttempts);
      const messageText = error instanceof Error ? error.message : 'Unknown outbox publish failure.';
      const updated = await this.prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: OutboxStatus.FAILED,
          failedAt: new Date(),
          availableAt,
          lastError: messageText,
          headers: this.mergeJsonObject(message.headers, {
            failedTerminally,
            lastPublishFailureAt: new Date().toISOString(),
            maxAttempts,
          }),
        },
      });

      return {
        id: updated.id,
        eventType: updated.eventType,
        status: updated.status,
        attempts: updated.attempts,
        nextAvailableAt: updated.availableAt.toISOString(),
        error: updated.lastError,
      };
    }
  }

  private publishOutboxMessage(message: OutboxMessage): Prisma.InputJsonObject {
    if (!message.eventType.trim()) {
      throw new Error('Outbox eventType is empty.');
    }

    if (!message.aggregateType.trim() || !message.aggregateId.trim()) {
      throw new Error('Outbox aggregate reference is incomplete.');
    }

    return {
      transport: 'database-outbox',
      publishedAt: new Date().toISOString(),
      eventType: message.eventType,
      aggregateType: message.aggregateType,
      aggregateId: message.aggregateId,
    };
  }

  private outboxBroadcastBody(message: OutboxMessage) {
    const base = `${message.aggregateType} ${message.aggregateId} emitted ${message.eventType} and is currently ${message.status.toLowerCase()}.`;

    if (message.lastError) {
      return `${base} Last error: ${message.lastError}`;
    }

    return `${base} Review, process, or retry it from the governance operations center.`;
  }

  private async findScopedOutboxMessageOrThrow(actor: AuthenticatedPrincipal, messageId: string) {
    const tenantId = this.resolveNullableTenantScope(actor, undefined);
    const message = await this.prisma.outboxMessage.findFirst({
      where: {
        id: messageId,
        tenantId,
      },
      include: this.outboxInclude,
    });

    if (!message) {
      throw new NotFoundException('Outbox message not found.');
    }

    return message;
  }

  private resolveNullableTenantScope(actor: AuthenticatedPrincipal, requestedTenantId?: string) {
    if (actor.tenantId) {
      if (requestedTenantId && requestedTenantId !== actor.tenantId) {
        throw new ForbiddenException('Cannot read history outside the active tenant.');
      }

      return actor.tenantId;
    }

    this.assertPlatformHistoryAccess(actor);
    return requestedTenantId;
  }

  private resolveRequiredTenantScope(actor: AuthenticatedPrincipal, requestedTenantId?: string) {
    const tenantId = this.resolveNullableTenantScope(actor, requestedTenantId);

    if (!tenantId && !this.canReadPlatformHistory(actor)) {
      throw new ForbiddenException('A tenant context is required.');
    }

    return tenantId;
  }

  private assertPlatformHistoryAccess(actor: AuthenticatedPrincipal) {
    if (!this.canReadPlatformHistory(actor)) {
      throw new ForbiddenException('Platform history access is required.');
    }
  }

  private canReadPlatformHistory(actor: AuthenticatedPrincipal) {
    return actor.type === 'PLATFORM_ADMIN' || actor.permissions.includes('platform.audit.read');
  }

  private dateRange(createdFrom?: string, createdTo?: string) {
    if (!createdFrom && !createdTo) {
      return undefined;
    }

    return {
      gte: createdFrom ? new Date(createdFrom) : undefined,
      lte: createdTo ? new Date(createdTo) : undefined,
    };
  }

  private nextRetryAt(attempts: number) {
    const delaySeconds = Math.min(60 * 60, 2 ** Math.max(attempts, 1) * 30);
    return new Date(Date.now() + delaySeconds * 1000);
  }

  private addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  private outboxState(message: Pick<OutboxMessage, 'id' | 'status' | 'attempts' | 'availableAt' | 'processedAt' | 'failedAt' | 'lastError'>): Prisma.InputJsonObject {
    return {
      id: message.id,
      status: message.status,
      attempts: message.attempts,
      availableAt: message.availableAt.toISOString(),
      processedAt: message.processedAt?.toISOString() ?? null,
      failedAt: message.failedAt?.toISOString() ?? null,
      lastError: message.lastError,
    };
  }

  private mergeJsonObject(value: Prisma.JsonValue | null, patch: Record<string, unknown>) {
    const base =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return this.toJson({
      ...base,
      ...patch,
    });
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

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private get auditInclude() {
    return {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      actor: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    } satisfies Prisma.AuditLogInclude;
  }

  private get activityInclude() {
    return {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    } satisfies Prisma.ActivityLogInclude;
  }

  private get timelineInclude() {
    return {
      employee: {
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
      actor: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    } satisfies Prisma.TimelineEventInclude;
  }

  private get outboxInclude() {
    return {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    } satisfies Prisma.OutboxMessageInclude;
  }
}
