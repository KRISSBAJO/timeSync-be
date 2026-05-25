import { NotificationChannel, NotificationStatus } from '@prisma/client';

import {
  type NotificationDeliveryAdapter,
  type NotificationDeliveryContext,
  type NotificationDeliveryResult,
} from './notification-delivery.adapter';

export class InAppNotificationDeliveryAdapter implements NotificationDeliveryAdapter {
  readonly channel = NotificationChannel.IN_APP;

  deliver(context: NotificationDeliveryContext): Promise<NotificationDeliveryResult> {
    if (!context.recipient.userId) {
      return Promise.resolve({
        status: NotificationStatus.FAILED,
        failureReason: 'In-app notifications require a user recipient.',
      });
    }

    return Promise.resolve({
      status: NotificationStatus.DELIVERED,
      metadata: {
        provider: 'in_app',
        strategy: 'database_inbox',
      },
    });
  }
}
