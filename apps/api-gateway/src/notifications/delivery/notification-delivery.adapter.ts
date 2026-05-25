import { NotificationChannel, NotificationStatus, type Notification, type NotificationRecipient } from '@prisma/client';

export type NotificationDeliveryContext = {
  notification: Pick<Notification, 'id' | 'channel' | 'title' | 'body' | 'templateCode' | 'data'>;
  recipient: Pick<NotificationRecipient, 'id' | 'userId' | 'employeeId' | 'destination'>;
};

export type NotificationDeliveryResult = {
  status: NotificationStatus;
  failureReason?: string;
  providerMessageId?: string;
  metadata?: Record<string, unknown>;
};

export interface NotificationDeliveryAdapter {
  readonly channel: NotificationChannel;

  deliver(context: NotificationDeliveryContext): Promise<NotificationDeliveryResult>;
}
