import { ForbiddenException, Injectable } from '@nestjs/common';
import { ApprovalRequestStatus, OutboxStatus } from '@prisma/client';
import { catchError, concat, from, interval, map, of, switchMap } from 'rxjs';

import { PrismaService } from '@timesync/database';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import { RealtimeFeedQueryDto } from './dto/realtime-feed-query.dto';

@Injectable()
export class RealtimeService {
  constructor(private readonly prisma: PrismaService) {}

  streamFeed(actor: AuthenticatedPrincipal, query: RealtimeFeedQueryDto) {
    return concat(of(0), interval(15000)).pipe(
      switchMap(() => from(this.getFeed(actor, query))),
      map((feed) => ({
        type: 'feed',
        data: feed,
      })),
      catchError((error: unknown) =>
        of({
          type: 'error',
          data: {
            serverTime: new Date(),
            message: error instanceof Error ? error.message : 'Realtime feed failed.',
          },
        }),
      ),
    );
  }

  async getFeed(actor: AuthenticatedPrincipal, query: RealtimeFeedQueryDto) {
    const tenantId = this.requireTenant(actor);
    const limit = query.limit ?? 8;
    const since = query.since ? new Date(query.since) : undefined;

    const [
      unreadNotifications,
      pendingApprovals,
      failedOutbox,
      notifications,
      timelineEvents,
      activityLogs,
    ] = await Promise.all([
      this.prisma.notificationRecipient.count({
        where: {
          userId: actor.id,
          readAt: null,
          notification: { tenantId },
        },
      }),
      this.prisma.approvalRequest.count({
        where: {
          tenantId,
          status: ApprovalRequestStatus.PENDING,
        },
      }),
      this.prisma.outboxMessage.count({
        where: {
          tenantId,
          status: OutboxStatus.FAILED,
        },
      }),
      this.prisma.notificationRecipient.findMany({
        where: {
          userId: actor.id,
          createdAt: since ? { gte: since } : undefined,
          notification: { tenantId },
        },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        include: {
          notification: true,
        },
      }),
      this.prisma.timelineEvent.findMany({
        where: {
          tenantId,
          createdAt: since ? { gte: since } : undefined,
        },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        include: {
          employee: {
            include: {
              person: {
                select: {
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.activityLog.findMany({
        where: {
          tenantId,
          createdAt: since ? { gte: since } : undefined,
        },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
      }),
    ]);

    const items = [
      ...notifications.map((item) => ({
        id: `notification:${item.id}`,
        sourceId: item.notification.id,
        type: 'NOTIFICATION',
        severity: item.readAt ? 'INFO' : 'ACTION',
        title: item.notification.title,
        description: item.notification.body,
        createdAt: item.createdAt,
        href: '/notifications',
        meta: {
          channel: item.notification.channel,
          status: item.status,
          readAt: item.readAt,
        },
      })),
      ...timelineEvents.map((item) => ({
        id: `timeline:${item.id}`,
        sourceId: item.id,
        type: 'TIMELINE',
        severity: 'INFO',
        title: item.title,
        description:
          item.description ??
          [
            item.employee?.employeeNumber,
            this.personName(item.employee?.person),
          ].filter(Boolean).join(' · '),
        createdAt: item.createdAt,
        href: item.employeeId ? `/workforce?employee=${item.employeeId}` : '/audit',
        meta: {
          eventType: item.type,
          entityType: item.entityType,
          entityId: item.entityId,
        },
      })),
      ...activityLogs.map((item) => ({
        id: `activity:${item.id}`,
        sourceId: item.id,
        type: 'ACTIVITY',
        severity: 'INFO',
        title: item.module,
        description: item.message,
        createdAt: item.createdAt,
        href: '/audit',
        meta: {
          userId: item.userId,
        },
      })),
    ]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);

    return {
      serverTime: new Date(),
      tenantId,
      summary: {
        unreadNotifications,
        pendingApprovals,
        failedOutbox,
        liveItems: items.length,
      },
      items,
    };
  }

  private personName(
    person?: { firstName: string; lastName: string; preferredName?: string | null } | null,
  ) {
    if (!person) {
      return null;
    }

    return person.preferredName ?? `${person.firstName} ${person.lastName}`;
  }

  private requireTenant(actor: AuthenticatedPrincipal) {
    if (!actor.tenantId) {
      throw new ForbiddenException('A tenant context is required.');
    }

    return actor.tenantId;
  }
}
