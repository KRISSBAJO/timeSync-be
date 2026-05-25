import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { configuration, validateEnv } from '@timesync/config';
import { DatabaseModule } from '@timesync/database';

import { AppController } from './app.controller';
import { AssignmentsModule } from './assignments/assignments.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/guards/auth.guard';
import { CsrfGuard } from './auth/guards/csrf.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { TenantFeatureGuard } from './auth/guards/tenant-feature.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { DemoRequestsModule } from './demo-requests/demo-requests.module';
import { DocumentsModule } from './documents/documents.module';
import { EmployeesModule } from './employees/employees.module';
import { FormsModule } from './forms/forms.module';
import { HealthModule } from './health/health.module';
import { HistoryModule } from './history/history.module';
import { HrGuidesModule } from './hr-guides/hr-guides.module';
import { IamModule } from './iam/iam.module';
import { LeaveModule } from './leave/leave.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrganizationModule } from './organization/organization.module';
import { PersonsModule } from './persons/persons.module';
import { PositionsModule } from './positions/positions.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RecruitmentModule } from './recruitment/recruitment.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SearchModule } from './search/search.module';
import { TenantsModule } from './tenants/tenants.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDevelopment = config.get<string>('app.env') === 'development';

        return {
          pinoHttp: {
            level: config.get<string>('logging.level', 'info'),
            transport: isDevelopment
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                  },
                }
              : undefined,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              censor: '[REDACTED]',
            },
            customProps: (req) => ({
              requestId: req.headers['x-request-id'],
              tenantId: req.headers['x-tenant-id'],
            }),
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttlMs', 60000),
          limit: config.get<number>('throttle.limit', 120),
        },
      ],
    }),
    DatabaseModule,
    AuthModule,
    IamModule,
    TenantsModule,
    OrganizationModule,
    PersonsModule,
    EmployeesModule,
    AssignmentsModule,
    PositionsModule,
    WorkflowsModule,
    DocumentsModule,
    FormsModule,
    DemoRequestsModule,
    NotificationsModule,
    HrGuidesModule,
    HistoryModule,
    DashboardModule,
    RealtimeModule,
    SchedulingModule,
    AttendanceModule,
    LeaveModule,
    RecruitmentModule,
    SearchModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantFeatureGuard,
    },
  ],
})
export class AppModule {}
