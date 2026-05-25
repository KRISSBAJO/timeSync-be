# Frontend API Contract

This backend is ready for a browser frontend that authenticates with HttpOnly cookies, sends CSRF headers on mutations, and consumes the global response envelope.

## Base URL

Local backend default:

```txt
http://localhost:4040
```

API routes are versioned under:

```txt
/api/v1
```

Health routes are not versioned:

```txt
/health/live
/health/ready
/health/dependencies
```

## Demo Tenant

Run the platform seed, then the frontend demo seed:

```bash
npm run db:seed
npm run db:seed:demo
```

Seeded browser personas:

```txt
tenantSlug: acme-health
password: DemoPass123!

admin@acme-health.test
hr@acme-health.test
manager@acme-health.test
employee@acme-health.test
```

Override with `DEMO_TENANT_SLUG` and `DEMO_PASSWORD` for local variants.

## Auth Flow

Login:

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@acme-health.test",
  "password": "DemoPass123!",
  "tenantSlug": "acme-health",
  "rememberDevice": false
}
```

The server sets:

```txt
access_token   HttpOnly
refresh_token  HttpOnly
csrf_token     readable by JavaScript
```

The login response also returns `data.csrfToken`. Keep this in memory and send it on every authenticated state-changing request:

```txt
X-CSRF-Token: <csrf token>
```

Frontend fetch defaults:

```ts
const api = async <T>(path: string, init: RequestInit = {}) => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const envelope = (await response.json()) as
    | { data: T; meta: { requestId?: string; timestamp: string } }
    | { error: { statusCode: number; code: string; message: string | string[] }; meta: { timestamp: string } };

  if (!response.ok || 'error' in envelope) {
    throw envelope;
  }

  return envelope.data;
};
```

For `POST`, `PATCH`, and `DELETE` after login:

```ts
headers: {
  'x-csrf-token': csrfToken,
}
```

Refresh:

```http
POST /api/v1/auth/refresh
```

Logout:

```http
POST /api/v1/auth/logout
X-CSRF-Token: <csrf token>
```

## Response Envelope

Success:

```json
{
  "data": {},
  "meta": {
    "requestId": "optional-request-id",
    "timestamp": "2026-05-17T12:00:00.000Z"
  }
}
```

Error:

```json
{
  "error": {
    "statusCode": 403,
    "code": "ForbiddenException",
    "message": "Missing required permission: employees.read"
  },
  "meta": {
    "requestId": "optional-request-id",
    "timestamp": "2026-05-17T12:00:00.000Z"
  }
}
```

## Core Screen Endpoints

Use these as the first frontend pages.

| Screen | Endpoint |
| --- | --- |
| Session bootstrap | `GET /api/v1/auth/me` |
| Executive dashboard | `GET /api/v1/dashboard/overview?period=LAST_30_DAYS` |
| Workforce dashboard | `GET /api/v1/dashboard/workforce?period=LAST_30_DAYS` |
| Position control | `GET /api/v1/dashboard/positions?period=LAST_30_DAYS` |
| Operations queues | `GET /api/v1/dashboard/operations?period=LAST_30_DAYS` |
| Risk dashboard | `GET /api/v1/dashboard/risks?period=LAST_30_DAYS` |
| Tenant settings | `GET /api/v1/tenants/current` |
| Tenant features | `GET /api/v1/tenants/current/features` |
| Organization tree | `GET /api/v1/organization/tree` |
| Cost centers | `GET /api/v1/organization/cost-centers` |
| People directory | `GET /api/v1/persons` |
| Employee list | `GET /api/v1/employees` |
| Employee summary | `GET /api/v1/employees/summary` |
| Assignment summary | `GET /api/v1/assignments/summary` |
| Current assignments | `GET /api/v1/assignments/current` |
| Position summary | `GET /api/v1/positions/summary` |
| Position tree | `GET /api/v1/positions/tree` |
| Workflows | `GET /api/v1/workflows` |
| Approval inbox | `GET /api/v1/approvals/tasks` |
| Approval requests | `GET /api/v1/approvals/requests` |
| Documents | `GET /api/v1/documents` |
| Document compliance | `GET /api/v1/documents/compliance` |
| Notification inbox | `GET /api/v1/notifications` |
| Notification summary | `GET /api/v1/notifications/summary` |
| Audit logs | `GET /api/v1/audit-logs` |
| Activity logs | `GET /api/v1/activity-logs` |
| Timeline | `GET /api/v1/timeline-events` |
| Outbox monitor | `GET /api/v1/outbox/messages` |
| Analytics snapshots | `GET /api/v1/analytics/snapshots/latest` |

## Generated Contract

Export OpenAPI any time after code changes:

```bash
npm run openapi:export
```

Generated files are written under `openapi/` and are intentionally ignored by git.

## Frontend Readiness Smoke

After seeding demo data and starting the backend:

```bash
npm run smoke:frontend
```

Optional overrides:

```bash
SMOKE_BASE_URL=http://localhost:4040
SMOKE_TENANT_SLUG=acme-health
SMOKE_EMAIL=admin@acme-health.test
SMOKE_PASSWORD=DemoPass123!
```
