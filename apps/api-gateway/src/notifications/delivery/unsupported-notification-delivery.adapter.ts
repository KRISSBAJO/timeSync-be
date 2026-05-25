import { NotificationChannel, NotificationStatus } from '@prisma/client';

import {
  type NotificationDeliveryAdapter,
  type NotificationDeliveryResult,
} from './notification-delivery.adapter';

export class UnsupportedNotificationDeliveryAdapter implements NotificationDeliveryAdapter {
  constructor(readonly channel: NotificationChannel) {}

  deliver(): Promise<NotificationDeliveryResult> {
    return Promise.resolve({
      status: NotificationStatus.FAILED,
      failureReason: `${this.channel} delivery is not configured yet.`,
    });
  }
}
