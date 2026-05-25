# Production Hardening Guide

Phase 15 turns the backend from a development service into a deployable enterprise API. This guide captures the default controls and the operator decisions that must be made before production.

## Required Environment Controls

Production and staging must use explicit frontend origins and secure browser cookies.

```bash
NODE_ENV=production
TRUST_PROXY=true
CORS_ORIGINS=https://app.example.com
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=lax
SECURITY_HSTS_ENABLED=true
SWAGGER_ENABLED=false
```

If Swagger is enabled in staging or production, it must be protected:

```bash
SWAGGER_ENABLED=true
SWAGGER_USERNAME=docs-admin
SWAGGER_PASSWORD=replace-with-a-long-secret
```

Do not put real provider keys in `.env.example`, docs, or source control. Use a secret manager or deployment platform secret store for database credentials, mail credentials, object storage credentials, payment keys, OAuth secrets, and webhook signing secrets.

## Runtime Defaults

- CORS is allowlist based.
- Production cookies must be secure.
- `SameSite=None` requires secure cookies.
- Swagger is protected by Basic authentication when credentials are configured.
- Helmet security headers and HSTS are enabled through environment controls.
- JSON and form body limits are configurable.
- The API respects `TRUST_PROXY` for secure cookies and real client IP handling behind a load balancer.
- Health endpoints remain available at `/health/live`, `/health/ready`, `/health/dependencies`, and `/health/runtime`.
- `/health/runtime` reports sanitized release, security, backup, and storage posture for deployment checks.

## Deployment Flow

Recommended release order:

1. Build and publish the Docker image.
2. Run database migrations as a one-off controlled job:

```bash
npm run prisma:deploy
```

3. Run seed only when platform reference data or permissions need to be reconciled:

```bash
npm run db:seed
```

4. Start the API:

```bash
npm run start:prod
```

Docker Compose production example:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## OpenAPI Export

Export the OpenAPI document for API gateway publishing, client generation, or contract review:

```bash
npm run openapi:export
```

The default output is `openapi/timesync-hr-api.json`. Override it with:

```bash
OPENAPI_OUTPUT_PATH=artifacts/openapi.json npm run openapi:export
```

## CI Gates

The included GitHub Actions workflow runs:

- Prisma client generation.
- Prisma schema validation.
- Migration deployment against the CI PostgreSQL service.
- Build.
- Lint.
- Tests.
- OpenAPI export.
- Reference-data seed.
- Runtime readiness smoke checks.

Production deployment should also add environment-specific smoke tests, migration dry-runs, backup verification, and load tests for login, employee list, approval queues, dashboard overview, and document compliance.

See `docs/operations/release-runbook.md` for the full release and rollback flow.
