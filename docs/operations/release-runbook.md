# TimeSync Production Release Runbook

This runbook covers Stages 37-39: production hardening, observability, deployment/CI, backup, and runtime checks.

## Release Gates

Run these before promoting a backend build:

```bash
npm run ci:verify
npm run prisma:deploy
npm run db:seed
```

When the API is running:

```bash
npm run ops:runtime-check
```

The runtime check calls:

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- `GET /api/v1/health/runtime`

`/health/runtime` is sanitized. It reports release identity, environment posture, database reachability, CORS posture, cookie/HSTS posture, Swagger exposure, backup posture, and document-storage readiness without returning secrets.

## Backup Procedure

Local PostgreSQL dump:

```bash
BACKUP_ENABLED=true \
BACKUP_STORAGE_PROVIDER=local \
BACKUP_LOCAL_PATH=./storage/backups \
npm run backup:postgres
```

Recommended production environment:

```bash
BACKUP_ENABLED=true
BACKUP_STORAGE_PROVIDER=local
BACKUP_LOCAL_PATH=/var/backups/timesync
BACKUP_RETENTION_DAYS=30
```

For S3/R2/managed backup workflows, keep `BACKUP_ENABLED=true`, set `BACKUP_STORAGE_PROVIDER=s3`, and run the storage upload job after the local dump step. Do not store database credentials in source control.

## Deployment Order

1. Build and publish the image.
2. Run `npm run prisma:deploy` as a one-off migration job.
3. Run `npm run db:seed` only for platform reference data reconciliation.
4. Start API containers.
5. Run `npm run ops:runtime-check`.
6. Confirm application dashboards can load `/api/v1/auth/me`, `/api/v1/dashboard/overview`, and `/api/v1/health/runtime`.

## Observability Baseline

Minimum production signals:

- Structured logs with `requestId` and `tenantId`.
- Health probe alerts for `/health/ready` failures.
- Runtime posture alert if `/health/runtime` returns `degraded`.
- Database latency trend from health checks.
- Outbox depth and failed outbox count.
- Login failure rate and 401/403 rate.
- Document upload failures.
- Approval queue age and overdue approval count.

## Rollback

Rollback is safe only when migrations are backward compatible. For destructive migrations, create a separate rollback plan before deploy.

Basic rollback:

1. Stop new traffic at the load balancer.
2. Roll back API image to previous release.
3. Run `/health/ready` and `/health/runtime`.
4. Re-enable traffic.
5. Review audit/outbox errors generated during the release window.
