import { Module } from '@nestjs/common';

import { NotificationDeliveryService } from './delivery/notification-delivery.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDeliveryService],
  exports: [NotificationsService, NotificationDeliveryService],
})
export class NotificationsModule {}
