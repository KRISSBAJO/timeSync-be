import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DocumentStorageService } from '../documents/storage/document-storage.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, DocumentStorageService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
