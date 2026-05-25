import { Module } from '@nestjs/common';

import { ActivityLogsController } from './activity-logs.controller';
import { AuditLogsController } from './audit-logs.controller';
import { HistoryService } from './history.service';
import { HistoryWriterService } from './history-writer.service';
import { OutboxController } from './outbox.controller';
import { TimelineEventsController } from './timeline-events.controller';

@Module({
  controllers: [
    AuditLogsController,
    ActivityLogsController,
    TimelineEventsController,
    OutboxController,
  ],
  providers: [HistoryService, HistoryWriterService],
  exports: [HistoryWriterService],
})
export class HistoryModule {}
