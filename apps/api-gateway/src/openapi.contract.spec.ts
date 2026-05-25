import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppController } from './app.controller';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { TokenService } from './auth/token.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { EmployeesController } from './employees/employees.controller';
import { EmployeesService } from './employees/employees.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { HistoryService } from './history/history.service';
import { OutboxController } from './history/outbox.controller';
import { IamController } from './iam/iam.controller';
import { IamService } from './iam/iam.service';
import { createOpenApiDocument } from './openapi';
import { CurrentTenantController } from './tenants/current-tenant.controller';
import { PlatformTenantsController } from './tenants/platform-tenants.controller';
import { TenantsService } from './tenants/tenants.service';

describe('OpenAPI contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AppController,
        AuthController,
        EmployeesController,
        OutboxController,
        DashboardController,
        IamController,
        PlatformTenantsController,
        CurrentTenantController,
        HealthController,
      ],
      providers: [
        { provide: AuthService, useValue: {} },
        {
          provide: TokenService,
          useValue: {
            cookieNames: {
              access: 'access_token',
              refresh: 'refresh_token',
              csrf: 'csrf_token',
            },
          },
        },
        { provide: EmployeesService, useValue: {} },
        { provide: HistoryService, useValue: {} },
        { provide: DashboardService, useValue: {} },
        { provide: IamService, useValue: {} },
        { provide: TenantsService, useValue: {} },
        { provide: HealthService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes the core auth, import, outbox, and quality routes', () => {
    const document = createOpenApiDocument(app);

    expect(document.info.title).toBe('TimeSync HR API');
    const securitySchemes = document.components?.securitySchemes ?? {};
    expect(securitySchemes).toHaveProperty('access_token');
    expect(securitySchemes).toHaveProperty('refresh_token');
    expect(securitySchemes).toHaveProperty('csrf-token');
    expect(document.paths['/api/v1/auth/login']?.post).toBeDefined();
    expect(document.paths['/api/v1/auth/me']?.get).toBeDefined();
    expect(document.paths['/api/v1/employees/import-preview']?.post).toBeDefined();
    expect(document.paths['/api/v1/employees/import-commit']?.post).toBeDefined();
    expect(document.paths['/api/v1/employees/import-batches']?.get).toBeDefined();
    expect(document.paths['/api/v1/employees/import-batches/{batchId}']?.get).toBeDefined();
    expect(document.paths['/api/v1/employees/import-batches/{batchId}/rollback']?.post).toBeDefined();
    expect(document.paths['/api/v1/outbox/messages/process']?.post).toBeDefined();
    expect(document.paths['/api/v1/outbox/messages/{id}/broadcast']?.post).toBeDefined();
    expect(document.paths['/api/v1/dashboard/data-quality']?.get).toBeDefined();
    expect(document.paths['/api/v1/dashboard/data-quality/actions']?.post).toBeDefined();
    expect(document.paths['/api/v1/iam/permission-templates']?.get).toBeDefined();
    expect(document.paths['/api/v1/iam/roles/{id}/permission-template/{templateCode}']?.post).toBeDefined();
    expect(document.paths['/api/v1/tenants/current/onboarding']?.get).toBeDefined();
    expect(document.paths['/api/v1/platform/tenants/{id}/onboarding']?.get).toBeDefined();
    expect(document.paths['/api/v1/health/ready']?.get).toBeDefined();
    expect(document.paths['/api/v1/health/runtime']?.get).toBeDefined();
  });
});
