# TimeSync HR Backend

Enterprise multi-tenant WorkforceOS / HR backend built with NestJS, Prisma, PostgreSQL, Swagger, and HTTP-only cookie authentication.

## Implementation Status

The repository currently includes the Phase 0/1 foundation through Phase 16 frontend readiness:

- NestJS API gateway scaffold.
- Strict TypeScript, ESLint, Prettier, Jest.
- Global config validation.
- Structured request logging.
- Request IDs.
- Security headers, compression, cookies, CORS.
- Response and error envelopes.
- Swagger at `/docs`.
- Health endpoints at `/health/live`, `/health/ready`, `/health/dependencies`, and `/health/runtime`.
- Prisma 7 configuration with PostgreSQL adapter.
- Enterprise Phase 1 Prisma schema.
- Initial generated migration.
- Platform/reference seed architecture.
- Docker Compose for PostgreSQL and Redis.
- HTTP-only cookie login, refresh rotation, logout, logout-all, and session revocation.
- CSRF protection for state-changing authenticated requests.
- Global auth guard, permission guard, and rate limiting.
- RBAC permission listing, role CRUD, role-permission sync, and user role assignment.
- Platform tenant provisioning and tenant lifecycle administration.
- Tenant settings, branding, subscription, and feature enablement APIs.
- Dynamic organization hierarchy and cost center APIs.
- Person identity/profile APIs with sensitive identity-document separation.
- Employee core and employment lifecycle APIs with audit, timeline, workforce actions, and outbox events.
- Effective-dated employee assignment engine with primary-assignment history, manager-chain checks, and position headcount protection.
- Position management engine with grades, levels, skill requirements, hierarchy control, capacity/vacancy intelligence, lifecycle governance, audit logs, and outbox events.
- Workflow and approval engine with definition lifecycle, ordered steps, active workflow resolution, approval task routing, delegated approvals, request actions, workforce-action status sync, timeline events, audit logs, and outbox events.
- Document management and compliance engine with tenant/global document types, employee-linked documents, immutable versions, current-version control, expiry intelligence, verification actions, storage-provider abstraction, audit logs, timeline events, and outbox events.
- Notification and communication engine with tenant/global templates, in-app inbox, outbound creation, recipient status tracking, preference upserts, email-provider handoff foundation, delivery retry API, audit logs, timeline events, and outbox events.
- Enterprise history and outbox architecture with tenant/platform audit queries, activity log queries, global timeline queries, outbox monitoring, retry scheduling, manual worker processing, exponential backoff, and shared history writer helpers.
- Dashboard and analytics intelligence with executive overview, workforce trend, position control, operational queues, risk scoring, dashboard widget configuration, and immutable analytics snapshots.
- Production hardening with strict production environment validation, allowlisted CORS, protected Swagger support, proxy-aware secure cookies, OpenAPI export, Docker production image, and CI gates.
- Frontend readiness with an idempotent enterprise demo tenant seed, browser-style HttpOnly cookie smoke checks, and FE handoff docs for API contracts and permission gates.
- Release hardening with sanitized runtime posture checks, backup scripts, CI migration/runtime smoke gates, tenant onboarding checklists, admin docs, and reusable IAM permission templates.

## Local Commands

```bash
npm install
npm run db:up
npm run prisma:migrate -- --name init
npm run db:seed
npm run db:seed:demo
npm run start
```

The local Docker PostgreSQL service is exposed on host port `55432` to avoid colliding
with any existing PostgreSQL service on `localhost:5432`. Keep `DATABASE_URL` pointed at:

```bash
postgresql://timesync:timesync_dev_password@localhost:55432/timesync_hr?schema=public
```

Useful checks:

```bash
npm run prisma:validate
npm run prisma:generate
npm run build
npm run lint
npm run test
npm run openapi:export
npm run smoke:frontend
npm run ops:runtime-check
npm run backup:postgres
```

Seeded platform admin credentials come from:

```bash
AUTH_PLATFORM_ADMIN_EMAIL=admin@timesync.local
AUTH_PLATFORM_ADMIN_PASSWORD=ChangeMe123!
```

Seeded frontend demo tenant credentials:

```txt
tenantSlug=acme-health
password=DemoPass123!
admin@acme-health.test
hr@acme-health.test
manager@acme-health.test
employee@acme-health.test
```

Frontend handoff docs:

```txt
docs/frontend/api-contract.md
docs/frontend/permission-matrix.md
```

Operations and admin docs:

```txt
docs/operations/release-runbook.md
docs/tenants/onboarding-playbook.md
docs/iam/permission-templates.md
```

Document storage is reference-based in Phase 11 and prepared for local, external URL, and S3-compatible providers:

```bash
DOCUMENT_STORAGE_PROVIDER=local # local | external | s3
DOCUMENT_STORAGE_LOCAL_ROOT_PATH=./storage/documents
DOCUMENT_STORAGE_LOCAL_PUBLIC_BASE_URL=http://localhost:4040/storage/documents
DOCUMENT_STORAGE_S3_ENDPOINT=https://s3.example.com
DOCUMENT_STORAGE_S3_BUCKET=timesync-documents
DOCUMENT_STORAGE_S3_REGION=us-east-1
```

Notification email delivery is queue-handoff based in Phase 12. The provider adapter records status and failure reasons without requiring a local SMTP client dependency:

```bash
NOTIFICATION_EMAIL_FROM=hr@example.com
MAIL_PROVIDER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=465
MAIL_SECURE=true
MAIL_USER=hr@example.com
ZEPTOMAIL_TOKEN=optional-token-for-zeptomail-style-provider
```

Implemented endpoints:

```txt
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/logout-all
GET    /api/v1/auth/me
GET    /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/:id

GET    /api/v1/iam/permissions
GET    /api/v1/iam/roles
POST   /api/v1/iam/roles
GET    /api/v1/iam/roles/:id
PATCH  /api/v1/iam/roles/:id
POST   /api/v1/iam/roles/:id/permissions
POST   /api/v1/iam/users/:id/roles
DELETE /api/v1/iam/users/:id/roles/:roleId

POST   /api/v1/platform/tenants
GET    /api/v1/platform/tenants
GET    /api/v1/platform/tenants/:id
PATCH  /api/v1/platform/tenants/:id
POST   /api/v1/platform/tenants/:id/activate
POST   /api/v1/platform/tenants/:id/suspend
POST   /api/v1/platform/tenants/:id/archive
PATCH  /api/v1/platform/tenants/:id/subscription
GET    /api/v1/platform/tenants/:id/features
POST   /api/v1/platform/tenants/:id/features/:featureCode/enable
POST   /api/v1/platform/tenants/:id/features/:featureCode/disable

GET    /api/v1/tenants/current
PATCH  /api/v1/tenants/current/settings
PATCH  /api/v1/tenants/current/branding
GET    /api/v1/tenants/current/subscription
GET    /api/v1/tenants/current/features
POST   /api/v1/tenants/current/features/:featureCode/enable
POST   /api/v1/tenants/current/features/:featureCode/disable

POST   /api/v1/organization/nodes
GET    /api/v1/organization/nodes
GET    /api/v1/organization/tree
GET    /api/v1/organization/nodes/:id
PATCH  /api/v1/organization/nodes/:id
DELETE /api/v1/organization/nodes/:id
POST   /api/v1/organization/cost-centers
GET    /api/v1/organization/cost-centers
GET    /api/v1/organization/cost-centers/:id
PATCH  /api/v1/organization/cost-centers/:id
DELETE /api/v1/organization/cost-centers/:id

POST   /api/v1/persons
GET    /api/v1/persons
GET    /api/v1/persons/:id
PATCH  /api/v1/persons/:id
DELETE /api/v1/persons/:id
GET    /api/v1/persons/skills/catalog
GET    /api/v1/persons/:id/contacts
POST   /api/v1/persons/:id/contacts
PATCH  /api/v1/persons/:id/contacts/:contactId
DELETE /api/v1/persons/:id/contacts/:contactId
GET    /api/v1/persons/:id/addresses
POST   /api/v1/persons/:id/addresses
PATCH  /api/v1/persons/:id/addresses/:addressId
DELETE /api/v1/persons/:id/addresses/:addressId
GET    /api/v1/persons/:id/identity-documents
POST   /api/v1/persons/:id/identity-documents
PATCH  /api/v1/persons/:id/identity-documents/:identityId
DELETE /api/v1/persons/:id/identity-documents/:identityId
GET    /api/v1/persons/:id/emergency-contacts
POST   /api/v1/persons/:id/emergency-contacts
PATCH  /api/v1/persons/:id/emergency-contacts/:emergencyContactId
DELETE /api/v1/persons/:id/emergency-contacts/:emergencyContactId
POST   /api/v1/persons/:id/education
PATCH  /api/v1/persons/:id/education/:educationId
DELETE /api/v1/persons/:id/education/:educationId
POST   /api/v1/persons/:id/experiences
PATCH  /api/v1/persons/:id/experiences/:experienceId
DELETE /api/v1/persons/:id/experiences/:experienceId
POST   /api/v1/persons/:id/skills
PATCH  /api/v1/persons/:id/skills/:personSkillId
DELETE /api/v1/persons/:id/skills/:personSkillId
POST   /api/v1/persons/:id/languages
PATCH  /api/v1/persons/:id/languages/:languageId
DELETE /api/v1/persons/:id/languages/:languageId
POST   /api/v1/persons/:id/certifications
PATCH  /api/v1/persons/:id/certifications/:certificationId
DELETE /api/v1/persons/:id/certifications/:certificationId

GET    /api/v1/employees/number-preview
GET    /api/v1/employees/summary
POST   /api/v1/employees
GET    /api/v1/employees
GET    /api/v1/employees/:id
PATCH  /api/v1/employees/:id
DELETE /api/v1/employees/:id
POST   /api/v1/employees/:id/hire
POST   /api/v1/employees/:id/confirm
POST   /api/v1/employees/:id/suspend
POST   /api/v1/employees/:id/reinstate
POST   /api/v1/employees/:id/separate
POST   /api/v1/employees/:id/retire
POST   /api/v1/employees/:id/alumni
POST   /api/v1/employees/:id/rehire
POST   /api/v1/employees/:id/archive
GET    /api/v1/employees/:id/workforce-actions
GET    /api/v1/employees/:id/timeline

POST   /api/v1/positions/grades
GET    /api/v1/positions/grades
GET    /api/v1/positions/grades/:id
PATCH  /api/v1/positions/grades/:id
DELETE /api/v1/positions/grades/:id
POST   /api/v1/positions/levels
GET    /api/v1/positions/levels
GET    /api/v1/positions/levels/:id
PATCH  /api/v1/positions/levels/:id
DELETE /api/v1/positions/levels/:id
POST   /api/v1/positions/skills
GET    /api/v1/positions/skills
GET    /api/v1/positions/skills/:id
PATCH  /api/v1/positions/skills/:id
DELETE /api/v1/positions/skills/:id
GET    /api/v1/positions/summary
GET    /api/v1/positions/tree
POST   /api/v1/positions
GET    /api/v1/positions
GET    /api/v1/positions/:id
PATCH  /api/v1/positions/:id
DELETE /api/v1/positions/:id
POST   /api/v1/positions/:id/activate
POST   /api/v1/positions/:id/freeze
POST   /api/v1/positions/:id/close
POST   /api/v1/positions/:id/archive
POST   /api/v1/positions/:id/reopen
GET    /api/v1/positions/:id/occupants
POST   /api/v1/positions/:id/skills
PATCH  /api/v1/positions/:id/skills/:positionSkillId
DELETE /api/v1/positions/:id/skills/:positionSkillId

POST   /api/v1/workflows
GET    /api/v1/workflows
GET    /api/v1/workflows/:id
PATCH  /api/v1/workflows/:id
DELETE /api/v1/workflows/:id
POST   /api/v1/workflows/:id/activate
POST   /api/v1/workflows/:id/inactivate
POST   /api/v1/workflows/:id/archive
POST   /api/v1/workflows/:id/steps
POST   /api/v1/workflows/:id/steps/reorder
PATCH  /api/v1/workflows/:id/steps/:stepId
DELETE /api/v1/workflows/:id/steps/:stepId

POST   /api/v1/approvals/requests
GET    /api/v1/approvals/requests
GET    /api/v1/approvals/tasks
GET    /api/v1/approvals/requests/:id
POST   /api/v1/approvals/requests/:id/approve
POST   /api/v1/approvals/requests/:id/reject
POST   /api/v1/approvals/requests/:id/return
POST   /api/v1/approvals/requests/:id/comment
POST   /api/v1/approvals/requests/:id/delegate
POST   /api/v1/approvals/requests/:id/cancel
POST   /api/v1/approvals/requests/:id/withdraw
POST   /api/v1/approvals/delegations
GET    /api/v1/approvals/delegations
PATCH  /api/v1/approvals/delegations/:id
DELETE /api/v1/approvals/delegations/:id

POST   /api/v1/documents/types
GET    /api/v1/documents/types
GET    /api/v1/documents/types/:id
PATCH  /api/v1/documents/types/:id
DELETE /api/v1/documents/types/:id
GET    /api/v1/documents/summary
GET    /api/v1/documents/compliance
GET    /api/v1/documents/expiring
POST   /api/v1/documents
GET    /api/v1/documents
GET    /api/v1/documents/:id
PATCH  /api/v1/documents/:id
DELETE /api/v1/documents/:id
GET    /api/v1/documents/:id/versions
POST   /api/v1/documents/:id/versions
POST   /api/v1/documents/:id/versions/:versionId/current
POST   /api/v1/documents/:id/request-verification
POST   /api/v1/documents/:id/verify
POST   /api/v1/documents/:id/reject
POST   /api/v1/documents/:id/expire

POST   /api/v1/notifications/templates
GET    /api/v1/notifications/templates
GET    /api/v1/notifications/templates/:id
PATCH  /api/v1/notifications/templates/:id
DELETE /api/v1/notifications/templates/:id
GET    /api/v1/notifications/summary
GET    /api/v1/notifications/outbound
GET    /api/v1/notifications/preferences
PATCH  /api/v1/notifications/preferences
POST   /api/v1/notifications
GET    /api/v1/notifications
POST   /api/v1/notifications/read-all
GET    /api/v1/notifications/:id
POST   /api/v1/notifications/:id/read
POST   /api/v1/notifications/:id/deliver

GET    /api/v1/audit-logs
GET    /api/v1/activity-logs
GET    /api/v1/timeline-events
GET    /api/v1/outbox/messages
GET    /api/v1/outbox/messages/summary
POST   /api/v1/outbox/messages/process
GET    /api/v1/outbox/messages/:id
POST   /api/v1/outbox/messages/:id/retry

GET    /api/v1/dashboard/overview
GET    /api/v1/dashboard/workforce
GET    /api/v1/dashboard/positions
GET    /api/v1/dashboard/operations
GET    /api/v1/dashboard/risks
GET    /api/v1/dashboard/widgets
POST   /api/v1/dashboard/widgets
PATCH  /api/v1/dashboard/widgets/:id
GET    /api/v1/analytics/snapshots
GET    /api/v1/analytics/snapshots/latest
POST   /api/v1/analytics/snapshots/refresh

POST   /api/v1/assignments
GET    /api/v1/assignments
GET    /api/v1/assignments/current
GET    /api/v1/assignments/summary
GET    /api/v1/assignments/employees/:employeeId/history
GET    /api/v1/assignments/:id
PATCH  /api/v1/assignments/:id
POST   /api/v1/assignments/:id/end
DELETE /api/v1/assignments/:id
```

Start here:

- [Enterprise Backend Roadmap](./docs/enterprise-backend-roadmap.md)
- [Phase Execution Checklist](./docs/phase-execution-checklist.md)
- [Production Hardening Guide](./docs/deployment/production-hardening.md)

The first implementation target is Phase 0 plus Phase 1: NestJS foundation, Docker dependencies, Swagger, Prisma, schema normalization, migration, and seed architecture.
