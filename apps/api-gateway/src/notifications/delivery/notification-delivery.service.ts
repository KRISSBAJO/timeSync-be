import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';

import { EmailNotificationDeliveryAdapter } from './email-notification-delivery.adapter';
import { InAppNotificationDeliveryAdapter } from './in-app-notification-delivery.adapter';
import {
  type NotificationDeliveryAdapter,
  type NotificationDeliveryContext,
} from './notification-delivery.adapter';
import { UnsupportedNotificationDeliveryAdapter } from './unsupported-notification-delivery.adapter';

@Injectable()
export class NotificationDeliveryService {
  private readonly adapters: Record<NotificationChannel, NotificationDeliveryAdapter>;

  constructor(config: ConfigService) {
    this.adapters = {
      [NotificationChannel.IN_APP]: new InAppNotificationDeliveryAdapter(),
      [NotificationChannel.EMAIL]: new EmailNotificationDeliveryAdapter({
        provider: config.get<string>('notifications.email.provider'),
        from: config.get<string>('notifications.email.from'),
        host: config.get<string>('notifications.email.host'),
        port: config.get<number>('notifications.email.port'),
        secure: config.get<boolean>('notifications.email.secure'),
        user: config.get<string>('notifications.email.user'),
        pass: config.get<string>('notifications.email.pass'),
        zeptoMailTokenConfigured: config.get<boolean>('notifications.email.zeptoMailTokenConfigured'),
      }),
      [NotificationChannel.SMS]: new UnsupportedNotificationDeliveryAdapter(NotificationChannel.SMS),
      [NotificationChannel.PUSH]: new UnsupportedNotificationDeliveryAdapter(NotificationChannel.PUSH),
    };
  }

  async deliver(context: NotificationDeliveryContext) {
    return this.adapters[context.notification.channel].deliver(context);
  }
}
