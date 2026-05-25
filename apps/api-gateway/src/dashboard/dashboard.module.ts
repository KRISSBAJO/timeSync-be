import { Module } from '@nestjs/common';

import { HistoryModule } from '../history/history.module';
import { AnalyticsController } from './analytics.controller';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [HistoryModule],
  controllers: [DashboardController, AnalyticsController],
  providers: [DashboardService],
})
export class DashboardModule {}
