# WorkforceOS Enterprise Backend Roadmap

This document is the execution blueprint for the TimeSync HR backend. The product is not a simple HR CRUD system. It is a multi-tenant Workforce Operating System that models people, employment, organizational structure, positions, lifecycle actions, workflows, governance, and history over time.

## 1. Architecture Intent

The backend must be designed for:

- Multi-tenant isolation from day one.
- Enterprise identity and access management.
- Dynamic organization structures, not hardcoded departments or branches.
- Historical workforce integrity through effective-dated assignments and actions.
- Workflow-centric employee operations.
- Event-driven extensibility for payroll, attendance, leave, recruitment, analytics, and AI.
- Strong observability, auditability, and security.
- Swagger/OpenAPI-first backend delivery.
- HTTP-only cookie based browser authentication.

## 2. Recommended Backend Shape

Use a NestJS monorepo with microservice-ready domain boundaries. In early phases, services can run together for speed, but code boundaries must match future deployable services.

Recommended structure:

```txt
apps/
  api-gateway/
  iam-service/
  tenant-service/
  workforce-service/
  workflow-service/
  document-service/
  notification-service/
  audit-service/
  worker-service/

libs/
  common/
  config/
  database/
  auth/
  tenancy/
  rbac/
  events/
  observability/
  testing/

prisma/
  schema.prisma
  migrations/
  seed.ts
```

### Service Responsibilities

`api-gateway`

- Public REST API surface.
- Swagger/OpenAPI aggregation.
- Cookie handling.
- Request validation.
- Tenant context extraction.
- Auth and RBAC guard orchestration.
- Rate limiting and security headers.

`iam-service`

- Users, sessions, devices, refresh tokens, login history.
- Password auth and future providers.
- MFA-ready design.
- Account lockout and security events.

`tenant-service`

- Tenant provisioning.
- Tenant settings, branding, subscriptions, feature flags.
- Country, currency, language, timezone reference data.
- Platform administration.

`workforce-service`

- Organization nodes.
- Cost centers.
- Persons.
- Employees.
- Assignments.
- Positions, grades, levels, skills.
- Workforce actions.

`workflow-service`

- Workflow definitions.
- Approval requests.
- Approval step instances.
- Delegations.
- SLA and escalation foundations.

`document-service`

- Document types.
- Documents.
- Versions.
- Expiration and verification states.
- Storage adapter abstraction.

`notification-service`

- Notification templates.
- Notification dispatch.
- Preferences.
- Email, in-app, SMS, and push channel abstraction.

`audit-service`

- Immutable audit logs.
- Activity logs.
- Timeline events.
- Security logs.

`worker-service`

- Outbox publisher.
- Async jobs.
- Email dispatch.
- Scheduled workflow escalation.
- Analytics snapshots.

## 3. Non-Negotiable Design Rules

1. Every tenant-owned domain row must carry `tenantId`.
2. Every tenant-scoped query must be resolved through a trusted tenant context.
3. Never store current department, branch, manager, or position directly on `Employee`.
4. Organization placement belongs to `EmployeeAssignment`.
5. Major employment changes must flow through `WorkforceAction`.
6. Approval-backed changes must flow through `ApprovalRequest`.
7. Important changes must create audit logs and timeline events.
8. Integration events must be written through the transactional outbox.
9. Passwords must use Argon2id.
10. Browser auth must use secure HTTP-only cookies.
11. DTOs must be validated and documented with Swagger decorators.
12. Soft deletes must be respected consistently where `deletedAt` exists.
13. Business writes must be transactional when they touch multiple domain records.
14. Code must remain modular enough to split into physical microservices later.

## 4. Authentication And Cookie Strategy

Use secure cookie-based authentication for browser clients.

### Token Model

Use a short-lived access session plus rotating refresh token.

- `access_token`: short lived, preferably 5 to 15 minutes.
- `refresh_token`: long lived, rotated on every refresh.
- Store both as `HttpOnly` cookies for browser clients.
- Set cookies with `Secure` in production.
- Use `SameSite=Lax` by default.
- Use `SameSite=None; Secure` only if frontend and backend must be on different sites.
- Hash refresh tokens before storage.
- Store session and device metadata.
- Revoke refresh token family on suspected reuse.

### CSRF

Because cookies are automatically sent by browsers, protect state-changing requests.

- Use a CSRF token cookie that is readable by the frontend.
- Require the frontend to send the token in an `X-CSRF-Token` header.
- Exempt only safe methods and explicitly approved auth endpoints.

### Security Controls

- Argon2id password hashing.
- Login rate limiting by IP and account.
- Account lockout with `lockedUntil`.
- Login history and device tracking.
- Optional trusted device flow.
- MFA-ready tables and interfaces.
- Security audit events for login, logout, failed login, token reuse, password reset, and role changes.

## 5. Tenant Isolation Strategy

Tenant resolution order:

1. Verified custom domain.
2. Verified subdomain.
3. Tenant slug in route for platform-admin flows.
4. Internal service header only for trusted service-to-service traffic.

Tenant context must include:

- `tenantId`
- `tenantSlug`
- `userId`
- `userType`
- `sessionId`
- `roles`
- `permissions`
- `scopes`
- `requestId`

Application-level isolation is required in Phase 1. PostgreSQL row-level security can be added in a hardening phase for high-security deployments.

Use a Prisma tenant helper or extension so common reads and writes automatically include tenant filters where possible. Do not rely only on developer memory.

## 6. Authorization Strategy

Authorization has three layers:

1. Authentication: Who are you?
2. Tenant authorization: Are you allowed inside this tenant?
3. Permission and scope authorization: Are you allowed to do this action on this resource?

RBAC must support:

- Platform roles.
- Tenant roles.
- Organization node scoped roles.
- Department/team/self scopes.
- Temporary role assignments.
- Delegated approval authority.

Use both declarative route decorators and policy checks:

```ts
@RequirePermissions('employees.read')
@RequireScopes(RoleScope.TENANT, RoleScope.ORGANIZATION_NODE)
```

For complex operations, use policy classes:

```txt
EmployeePolicy.canTransfer(actor, employee, targetAssignment)
WorkflowPolicy.canApprove(actor, request, step)
DocumentPolicy.canView(actor, document)
```

## 7. API Standards

All public APIs must use:

- REST controllers in the API gateway.
- DTO classes with `class-validator`.
- Swagger decorators on DTOs and controllers.
- Cursor or keyset pagination for large lists.
- Consistent response envelopes.
- Consistent error codes.
- Request IDs.
- Idempotency keys for critical create operations.

Recommended response envelope:

```json
{
  "data": {},
  "meta": {
    "requestId": "req_...",
    "timestamp": "2026-05-16T00:00:00.000Z"
  }
}
```

Recommended paginated envelope:

```json
{
  "data": [],
  "page": {
    "limit": 50,
    "nextCursor": "..."
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

## 8. Database And Prisma Standards

Use PostgreSQL and Prisma.

### Modeling Rules

- Use UUID primary keys.
- Use composite unique indexes for tenant-owned codes.
- Add `createdAt`, `updatedAt`, and `deletedAt` where lifecycle matters.
- Use `createdById` and `updatedById` for important tenant-owned entities.
- Use `Json` only for flexible metadata, not for core queryable facts.
- Use effective dating for workforce assignments.
- Use immutable history records for status and lifecycle events.

### Prisma Schema Review Before First Migration

The provided schema is a strong Phase 1 foundation, but it must be normalized before the first migration.

Required review items:

- Add missing `Tenant` relations for models with `tenantId` where relation navigation is needed.
- Fix any required foreign keys whose relation field is optional.
- Add reverse relations for entities that will be queried from parent objects.
- Decide which models require soft deletes.
- Add missing actor relations for workflow, approval, delegation, and history models.
- Add document current version relation carefully to avoid circular relation ambiguity.
- Add indexes for common enterprise list screens.
- Consider unique partial indexes manually for soft-deleted records where Prisma cannot express the index.

### Transactions

Use transactions for:

- Tenant provisioning.
- User invitation acceptance.
- Employee creation.
- Workforce actions.
- Assignment changes.
- Workflow submission and approval.
- Document version creation.
- Audit plus timeline plus outbox writes.

## 9. Event-Driven Architecture

Use the transactional outbox pattern.

Business transaction:

1. Write domain data.
2. Write audit log.
3. Write timeline event when relevant.
4. Write outbox message.
5. Commit.

Worker transaction:

1. Lock pending outbox message.
2. Publish event to queue or broker.
3. Mark as published.
4. Retry with backoff on failure.

Initial events:

- `tenant.created`
- `tenant.feature.enabled`
- `user.invited`
- `user.login.succeeded`
- `employee.created`
- `employee.hired`
- `employee.assignment.changed`
- `employee.transferred`
- `employee.promoted`
- `employee.separated`
- `position.created`
- `workflow.submitted`
- `workflow.approved`
- `workflow.rejected`
- `document.uploaded`
- `notification.requested`

## 10. Observability

Add from the start:

- Structured JSON logs.
- Request IDs.
- Correlation IDs across services.
- Health endpoints.
- Readiness endpoints.
- Metrics-ready architecture.
- Error tracking adapter.
- Audit logs for business operations.

Recommended endpoints:

```txt
GET /health/live
GET /health/ready
GET /health/dependencies
```

## 11. Testing Standard

Minimum test layers:

- Unit tests for policies, services, validators, and helpers.
- Integration tests for repositories and Prisma queries.
- E2E tests for major API flows.
- Contract tests when services are physically split.

Critical E2E flows:

- Tenant provisioning.
- Admin login and refresh.
- Invitation accept.
- Role assignment.
- Employee creation.
- Position creation.
- Employee assignment.
- Workforce action approval.
- Document upload metadata.
- Audit and timeline creation.

## 12. Phase Roadmap

### Phase 0: Repository And Engineering Foundation

Goal: Create a production-quality NestJS backend base.

Deliverables:

- NestJS monorepo scaffold.
- TypeScript strict mode.
- ESLint and Prettier.
- Environment validation.
- Docker Compose for PostgreSQL and Redis.
- Config module.
- Global validation pipe.
- Global exception filter.
- Request ID middleware.
- Structured logger.
- Swagger setup.
- Health endpoints.
- Base response envelope.
- Testing setup.

Exit criteria:

- App boots locally.
- Swagger opens.
- Health endpoints pass.
- Test command runs.
- Docker dependencies start cleanly.

### Phase 1: Database Foundation And Prisma

Goal: Establish the database contract.

Deliverables:

- `prisma/schema.prisma` committed.
- Schema corrected and validated.
- Initial migration.
- Prisma service and database module.
- Seed architecture.
- Reference data seeds for countries, currencies, languages, timezones, features, permissions, and platform roles.
- Transaction helper.
- Tenant-aware Prisma helper.

Exit criteria:

- `prisma validate` passes.
- Migration applies to a clean database.
- Seed creates platform bootstrap data.
- Basic database integration test passes.

### Phase 2: Platform And Tenant Core

Goal: Provision and govern tenants.

Deliverables:

- Platform settings.
- Platform features.
- Tenant CRUD for platform admins.
- Tenant settings.
- Tenant branding.
- Tenant subscriptions.
- Tenant feature enablement.
- Tenant provisioning workflow.
- Tenant default roles and permissions seed.
- Tenant context resolver.

Primary APIs:

```txt
POST /platform/tenants
GET /platform/tenants
GET /platform/tenants/:id
PATCH /platform/tenants/:id
POST /platform/tenants/:id/activate
POST /platform/tenants/:id/suspend
GET /tenants/current
PATCH /tenants/current/settings
PATCH /tenants/current/branding
GET /tenants/current/features
```

Exit criteria:

- Platform admin can create a tenant.
- Tenant defaults are created transactionally.
- Tenant feature checks are enforced.

### Phase 3: IAM, Sessions, And HTTP-Only Auth

Goal: Implement enterprise-grade authentication.

Deliverables:

- User model service.
- Password hashing with Argon2id.
- Login with HTTP-only cookies.
- Refresh token rotation.
- Logout and revoke session.
- Device tracking.
- Login history.
- Email verification foundation.
- Password reset foundation.
- Auth guards.
- CSRF protection.
- Rate limiting.

Primary APIs:

```txt
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/logout-all
GET /auth/me
GET /auth/sessions
DELETE /auth/sessions/:id
```

Exit criteria:

- Auth works with HTTP-only cookies.
- Refresh token reuse can be detected and revoked.
- Sessions can be listed and revoked.
- Auth Swagger docs are clear.

### Phase 4: RBAC And Policy Authorization

Goal: Build enterprise authorization.

Deliverables:

- Permission registry.
- Role management.
- Role permission assignment.
- User role assignment.
- Scoped access checks.
- Permission decorators.
- Policy engine foundation.
- Invitation role assignment.

Primary APIs:

```txt
GET /iam/permissions
POST /iam/roles
GET /iam/roles
PATCH /iam/roles/:id
POST /iam/roles/:id/permissions
POST /iam/users/:id/roles
DELETE /iam/users/:id/roles/:roleId
```

Exit criteria:

- Tenant admin can manage tenant roles.
- Platform roles remain protected.
- Scoped permissions are enforced in test routes and real routes.

### Phase 5: Organization Structure Engine

Goal: Model dynamic enterprise hierarchy.

Deliverables:

- Organization node CRUD.
- Parent-child hierarchy rules.
- Cost center CRUD.
- Active/inactive handling.
- Org tree endpoint.
- Basic hierarchy validation.

Primary APIs:

```txt
POST /organization/nodes
GET /organization/nodes
GET /organization/tree
PATCH /organization/nodes/:id
DELETE /organization/nodes/:id
POST /organization/cost-centers
GET /organization/cost-centers
```

Exit criteria:

- Tenant can model company, region, branch, division, department, unit, and team.
- Org tree can be returned efficiently.
- Cross-tenant hierarchy access is impossible.

### Phase 6: Person Domain

Goal: Model human identity independently from employment.

Deliverables:

- Person CRUD.
- Contacts.
- Addresses.
- Identity documents metadata.
- Emergency contacts.
- Education, experience, skills, languages, certifications.
- Person search.

Primary APIs:

```txt
POST /persons
GET /persons
GET /persons/:id
PATCH /persons/:id
POST /persons/:id/contacts
POST /persons/:id/addresses
POST /persons/:id/identity-documents
POST /persons/:id/emergency-contacts
```

Exit criteria:

- Person can exist without employee.
- Person records are tenant-isolated.
- Sensitive fields are permission protected.

### Phase 7: Employee Core

Goal: Model employment relationship.

Deliverables:

- Employee creation from person.
- Employee numbers.
- Employee statuses.
- Employment type and lifecycle fields.
- Employee profile view.
- Employee directory list.
- Employee lifecycle history foundation.

Primary APIs:

```txt
POST /employees
GET /employees
GET /employees/:id
PATCH /employees/:id
GET /employees/:id/profile
GET /employees/:id/timeline
```

Exit criteria:

- Employee is linked to person.
- Employee number uniqueness is tenant-scoped.
- Employee creation emits audit, timeline, and outbox records.

### Phase 8: Position And Assignment Engine

Goal: Build the core workforce placement model.

Deliverables:

- Position grades.
- Position levels.
- Position CRUD.
- Position hierarchy.
- Position skills.
- Employee assignment CRUD.
- Effective-dated assignment changes.
- Current assignment resolver.
- Manager assignment resolver.
- Vacancy and occupied headcount foundation.

Primary APIs:

```txt
POST /positions
GET /positions
GET /positions/:id
PATCH /positions/:id
POST /positions/:id/skills
POST /employees/:id/assignments
GET /employees/:id/assignments
GET /employees/:id/current-assignment
```

Exit criteria:

- Employee can move without overwriting history.
- Primary assignment rules are enforced.
- Position occupancy can be calculated.

### Phase 9: Workforce Actions

Goal: Make workforce changes workflow-ready and auditable.

Deliverables:

- Workforce action creation.
- Previous and proposed state snapshots.
- Action status transitions.
- Action history.
- Action completion handlers for hire, transfer, promotion, suspension, reinstatement, separation, rehire, manager change, and position change.
- Attachments metadata foundation.

Primary APIs:

```txt
POST /workforce-actions
GET /workforce-actions
GET /workforce-actions/:id
POST /workforce-actions/:id/submit
POST /workforce-actions/:id/cancel
POST /workforce-actions/:id/complete
GET /employees/:id/workforce-actions
```

Exit criteria:

- Important employee changes can be represented as actions.
- Completing an action creates the correct assignment or status update.
- Action history is immutable.

### Phase 10: Workflow And Approval Engine

Goal: Orchestrate enterprise approvals.

Deliverables:

- Workflow definitions.
- Workflow steps.
- Approval request submission.
- Approval step instances.
- Approve, reject, return, delegate, cancel.
- Conditional step foundation.
- SLA fields and escalation-ready design.
- Workflow integration with workforce actions.

Primary APIs:

```txt
POST /workflows
GET /workflows
PATCH /workflows/:id
POST /workflows/:id/steps
POST /approval-requests
GET /approval-requests
GET /approval-requests/:id
POST /approval-requests/:id/approve
POST /approval-requests/:id/reject
POST /approval-requests/:id/return
POST /delegations
```

Exit criteria:

- Workforce actions can require approval.
- Approvers are resolved by user, role, or expression.
- Approval decisions are audited and visible in timeline.

### Phase 11: Documents

Goal: Build compliance document foundation.

Deliverables:

- Document type management.
- Document metadata.
- Document versions.
- Current version handling.
- Expiration tracking.
- Verification status.
- Storage adapter interface.
- Local storage adapter for development.
- S3-compatible adapter prepared for production.

Primary APIs:

```txt
POST /documents/types
GET /documents/types
PATCH /documents/types/:id
GET /documents/summary
GET /documents/compliance
GET /documents/expiring
POST /documents
GET /documents
GET /documents/:id
PATCH /documents/:id
POST /documents/:id/versions
GET /documents/:id/versions
POST /documents/:id/versions/:versionId/current
POST /documents/:id/request-verification
POST /documents/:id/verify
POST /documents/:id/reject
POST /documents/:id/expire
```

Exit criteria:

- Documents can be linked to employees.
- Version history is preserved.
- Expiring documents can be queried.

### Phase 12: Notifications

Goal: Provide event-driven communication.

Deliverables:

- Notification templates.
- Notification preferences.
- Notification creation.
- Recipient tracking.
- In-app notification list.
- Email channel adapter.
- Queue-backed delivery foundation.

Primary APIs:

```txt
POST /notifications/templates
GET /notifications/templates
PATCH /notifications/templates/:id
GET /notifications/summary
GET /notifications/outbound
GET /notifications
POST /notifications/:id/read
POST /notifications/:id/deliver
GET /notifications/preferences
PATCH /notifications/preferences
```

Exit criteria:

- Workflow and workforce events can create notifications.
- Users can read in-app notifications.
- Delivery failures are recorded.

### Phase 13: Audit, Timeline, And Outbox

Goal: Complete enterprise history and event architecture.

Deliverables:

- Audit logging helper.
- Activity logging helper.
- Timeline event helper.
- Outbox writer.
- Outbox worker.
- Retry and backoff strategy.
- Admin audit query APIs.

Primary APIs:

```txt
GET /audit-logs
GET /activity-logs
GET /timeline-events
GET /outbox/messages
GET /outbox/messages/summary
POST /outbox/messages/process
POST /outbox/messages/:id/retry
```

Exit criteria:

- Critical flows write audit records.
- Employee profile timeline is useful.
- Outbox reliably publishes pending events.

### Phase 14: Dashboard And Analytics Foundation

Goal: Create executive, HR, and operational visibility across the workforce operating system.

Deliverables:

- Dashboard widgets.
- Tenant workforce snapshots.
- Active employee counts.
- New hires.
- Separations.
- Pending approvals.
- Organization distribution.
- Position vacancy snapshot.
- Workforce health score.
- Risk indicators.
- Operational queue metrics.
- Document compliance metrics.
- Notification delivery metrics.
- Outbox and activity health.
- Immutable analytics snapshots.

Primary APIs:

```txt
GET /dashboard/overview
GET /dashboard/workforce
GET /dashboard/positions
GET /dashboard/operations
GET /dashboard/risks
GET /dashboard/widgets
POST /dashboard/widgets
PATCH /dashboard/widgets/:id
GET /analytics/snapshots
GET /analytics/snapshots/latest
POST /analytics/snapshots/refresh
```

Exit criteria:

- Tenant dashboard can load with real data.
- Platform dashboard can aggregate tenant posture for platform admins.
- Analytics snapshots are tenant-scoped, auditable, and outbox-backed.

### Phase 15: Production Hardening

Goal: Prepare for real enterprise deployment.

Deliverables:

- Enforced production environment validation.
- CORS allowlist hardening.
- Helmet and HSTS security headers.
- Cookie domain, proxy, and secure cookie configuration.
- Protected or disabled Swagger.
- Sanitized environment templates.
- Database indexes reviewed with query plans.
- Backup and restore procedure.
- CI pipeline.
- Migration pipeline.
- Docker production image.
- Deployment manifests.
- Load testing for key endpoints.
- OpenAPI export.

Exit criteria:

- Backend can be deployed repeatably.
- Security defaults are production-safe.
- Critical user journeys pass E2E tests.
- Observability is sufficient for incident response.
- CI validates build, lint, tests, Prisma schema, and OpenAPI export.

## 13. First Build Recommendation

Start with Phase 0 and Phase 1 together only if the repository is empty. They are tightly connected:

1. Scaffold the NestJS monorepo.
2. Add Docker Compose for PostgreSQL and Redis.
3. Add config, logger, validation, Swagger, and health checks.
4. Add Prisma.
5. Normalize the schema.
6. Create the initial migration.
7. Seed platform bootstrap data.

After that, build Phase 2 tenant provisioning before auth. Enterprise auth needs tenant context, default roles, and seeded permissions.
