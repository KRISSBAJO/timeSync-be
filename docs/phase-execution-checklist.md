# Phase Execution Checklist

Use this checklist while building each backend phase. A phase is not complete until the code, tests, Swagger documentation, and operational behavior are all present.

## Phase Quality Gate

Every phase must include:

- Domain module.
- DTOs with validation.
- Swagger decorators.
- Service layer.
- Repository or Prisma data access layer.
- Tenant isolation checks.
- RBAC checks where applicable.
- Audit/timeline/outbox hooks where applicable.
- Unit tests for business rules.
- E2E tests for primary APIs.
- Seed data where required.
- README or module notes when behavior is non-obvious.

## Security Gate

Before merging a phase:

- No unscoped tenant queries.
- No password or token returned in API responses.
- No raw refresh token stored in the database.
- Sensitive endpoints require permissions.
- Mutating cookie-authenticated endpoints are CSRF protected.
- Errors do not leak stack traces in production.
- Rate limits exist for auth and expensive endpoints.

## Database Gate

Before creating a migration:

- All tenant-owned unique constraints include `tenantId`.
- Common list filters have indexes.
- Foreign key `onDelete` behavior is intentional.
- Soft-delete behavior is clear.
- Required relations are actually required in Prisma.
- Optional relations have nullable foreign keys.
- Historical tables do not overwrite important state.

## API Gate

Every API group must have:

- Swagger tag.
- DTO examples.
- Auth requirements documented.
- Pagination for list endpoints.
- Filtering and sorting only where indexed.
- Consistent response envelope.
- Stable error shape.

## Testing Gate

Minimum for each phase:

- Service unit tests.
- Policy or guard tests for authorization.
- E2E happy path.
- E2E unauthorized path.
- E2E cross-tenant isolation path.
- Migration validation in CI.

## Production Gate

Before production deployment:

- Health checks pass.
- `/health/runtime` returns `ok` or an accepted `warning` with no failed checks.
- Structured logs include request ID and tenant ID when available.
- Database migrations run in a controlled job.
- Backup posture is configured and a restore owner exists.
- Secrets come from environment or secret manager.
- Cookie settings are environment-aware.
- CORS is restricted to approved frontend origins.
- Swagger is protected or disabled in production unless explicitly allowed.
