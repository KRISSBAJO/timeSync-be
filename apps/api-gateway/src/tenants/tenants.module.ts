import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CurrentTenantController } from './current-tenant.controller';
import { PlatformTenantsController } from './platform-tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PlatformTenantsController, CurrentTenantController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
