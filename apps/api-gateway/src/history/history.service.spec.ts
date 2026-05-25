/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, OutboxStatus, UserStatus } from '@prisma/client';

import { HistoryService } from './history.service';

describe('HistoryService outbox broadcasting', () => {
  const actor = {
    id: 'user-1',
    email: 'admin@acme-health.test',
    tenantId: 'tenant-1',
    type: 'TENANT_USER',
    roles: ['TENANT_ADMIN'],
    permissions: ['outbox.read', 'outbox.process'],
  };

  it('broadcasts a tenant outbox message to active stewards', async () => {
    const message = {
      id: 'outbox-1',
      tenantId: 'tenant-1',
      eventType: 'employee.import.completed',
      aggregateType: 'EmployeeImport',
      aggregateId: 'batch-1',
      payload: {},
      headers: null,
      status: OutboxStatus.PENDING,
      attempts: 0,
      availableAt: new Date(),
      processedAt: null,
      failedAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const notification = {
      id: 'notification-1',
      recipients: [{ id: 'recipient-1' }, { id: 'recipient-2' }],
    };
    const prisma: any = {
      outboxMessage: {
        findFirst: jest.fn().mockResolvedValue(message),
        update: jest.fn().mockResolvedValue({
          ...message,
          headers: {
            stewardNotificationId: notification.id,
          },
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'user-1', email: 'admin@acme-health.test' },
          { id: 'user-2', email: 'hr@acme-health.test' },
        ]),
      },
      notification: {
        create: jest.fn().mockResolvedValue(notification),
      },
      $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) => callback(prisma)),
    };
    const writer = {
      writeAudit: jest.fn().mockResolvedValue({}),
      writeActivity: jest.fn().mockResolvedValue({}),
    };
    const service = new HistoryService(prisma, writer as any);

    const result = await service.broadcastOutboxMessage(actor as any, 'outbox-1');

    expect(result.recipientCount).toBe(2);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          status: UserStatus.ACTIVE,
        }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          channel: NotificationChannel.IN_APP,
          status: NotificationStatus.SENT,
          templateCode: 'OUTBOX_STEWARD_ALERT',
        }),
        include: {
          recipients: true,
        },
      }),
    );
    expect(writer.writeAudit).toHaveBeenCalled();
    expect(writer.writeActivity).toHaveBeenCalled();
  });

  it('rejects platform-scoped outbox messages for tenant steward broadcast', async () => {
    const prisma = {
      outboxMessage: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'outbox-1',
          tenantId: null,
          eventType: 'platform.event',
          aggregateType: 'Platform',
          aggregateId: 'platform',
          payload: {},
          headers: null,
          status: OutboxStatus.PENDING,
          attempts: 0,
          availableAt: new Date(),
          processedAt: null,
          failedAt: null,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };
    const service = new HistoryService(prisma as any, {
      writeAudit: jest.fn(),
      writeActivity: jest.fn(),
    } as any);

    await expect(service.broadcastOutboxMessage({ ...actor, tenantId: null, type: 'PLATFORM_ADMIN' } as any, 'outbox-1'))
      .rejects
      .toBeInstanceOf(BadRequestException);
  });
});
