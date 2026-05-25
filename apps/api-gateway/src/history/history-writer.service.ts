import { Injectable } from '@nestjs/common';
import { AuditAction, TimelineEventType, type Prisma } from '@prisma/client';

@Injectable()
export class HistoryWriterService {
  async writeAudit(
    tx: Prisma.TransactionClient,
    input: {
      tenantId?: string | null;
      actorUserId?: string | null;
      action: AuditAction;
      module: string;
      entityType: string;
      entityId?: string | null;
      before?: Prisma.InputJsonValue | null;
      after?: Prisma.InputJsonValue | null;
      ipAddress?: string | null;
      userAgent?: string | null;
      metadata?: Prisma.InputJsonValue | null;
    },
  ) {
    return tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: input.action,
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before ?? undefined,
        after: input.after ?? undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async writeActivity(
    tx: Prisma.TransactionClient,
    input: {
      tenantId?: string | null;
      userId?: string | null;
      module: string;
      message: string;
      metadata?: Prisma.InputJsonValue | null;
    },
  ) {
    return tx.activityLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        module: input.module,
        message: input.message,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async writeTimeline(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      employeeId?: string | null;
      actorUserId?: string | null;
      type?: TimelineEventType;
      title: string;
      description?: string | null;
      entityType?: string | null;
      entityId?: string | null;
      data?: Prisma.InputJsonValue | null;
    },
  ) {
    return tx.timelineEvent.create({
      data: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        actorUserId: input.actorUserId,
        type: input.type ?? TimelineEventType.SYSTEM,
        title: input.title,
        description: input.description,
        entityType: input.entityType,
        entityId: input.entityId,
        data: input.data ?? undefined,
      },
    });
  }

  async writeOutbox(
    tx: Prisma.TransactionClient,
    input: {
      tenantId?: string | null;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      payload: Prisma.InputJsonValue;
      headers?: Prisma.InputJsonValue | null;
      availableAt?: Date;
    },
  ) {
    return tx.outboxMessage.create({
      data: {
        tenantId: input.tenantId,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload,
        headers: input.headers ?? undefined,
        availableAt: input.availableAt,
      },
    });
  }
}
