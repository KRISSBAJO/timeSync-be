# Frontend Permission Matrix

The frontend should render navigation and page actions from permissions returned by:

```txt
GET /api/v1/auth/me
```

Use role names only for persona-specific UX defaults. Authorization should rely on permission codes.

## Navigation Gates

| Frontend area | Required permission |
| --- | --- |
| Executive dashboard | `dashboard.read` |
| Analytics snapshots | `analytics.read` |
| Tenant settings | `tenants.settings.read` |
| Tenant branding | `tenants.branding.read` |
| Tenant features | `tenants.features.read` |
| Tenant subscription | `tenants.subscription.read` |
| IAM users and roles | `iam.users.read`, `iam.roles.read` |
| Organization | `organization.read` |
| Cost centers | `cost-centers.read` |
| People directory | `persons.read` |
| Sensitive identity documents | `persons.sensitive.read` |
| Employees | `employees.read` |
| Assignments | `assignments.read` |
| Positions | `positions.read` |
| Workflows | `workflows.read` |
| Approval inbox | `approvals.read` |
| Documents | `documents.read` |
| Notifications | `notifications.read` |
| Audit logs | `audit.read` |
| Activity logs | `activity.read` |
| Timeline | `timeline.read` |
| Outbox monitor | `outbox.read` |
| Platform tenants | `platform.tenants.manage` |
| Platform features | `platform.features.manage` |

## Action Gates

| Action | Required permission |
| --- | --- |
| Update tenant settings | `tenants.settings.write` |
| Update branding | `tenants.branding.write` |
| Enable or disable tenant features | `tenants.features.write` |
| Update subscription | `tenants.subscription.write` |
| Create or update roles | `iam.roles.write` |
| Assign roles to users | `iam.roles.write` |
| Create or update organization nodes | `organization.write` |
| Create or update cost centers | `cost-centers.write` |
| Create or update person records | `persons.write` |
| Create identity documents | `persons.write`, `persons.sensitive.read` |
| Create or update employees | `employees.write` |
| Invite employees | `employees.invite` |
| Transfer employee | `employees.transfer` |
| Suspend employee | `employees.suspend` |
| Separate employee | `employees.separate` |
| Create or end assignments | `assignments.write` |
| Create or update positions | `positions.write` |
| Create workforce action | `workforce-actions.write` |
| Create or update workflows | `workflows.write` |
| Approve, reject, delegate, cancel, or withdraw approvals | `approvals.process` |
| Upload or update documents | `documents.write` |
| Verify documents | `documents.verify` |
| Create outbound notification | `notifications.write` |
| Create dashboard widget | `dashboard.write` |
| Refresh analytics snapshot | `analytics.write` |
| Process or retry outbox | `outbox.process` |

## Seeded Demo Personas

| Persona | Email | Navigation intent |
| --- | --- | --- |
| Tenant Admin | `admin@acme-health.test` | Full tenant administration, dashboard, analytics, audit, outbox, and all workforce modules. |
| HR Admin | `hr@acme-health.test` | Workforce operations, people, employees, assignments, positions, approvals, documents, notifications, audit, and analytics. |
| Manager | `manager@acme-health.test` | Team dashboard, org read views, employee read views, approval tasks, documents, notifications, and timeline. |
| Employee | `employee@acme-health.test` | Self-service profile, documents, notifications, timeline, and read-only workforce context. |

## UX Rules

- Hide navigation when the user lacks the read permission for that area.
- Disable or hide write actions when the user lacks the matching write/process permission.
- Always preserve backend error handling. Permissions can change after page load.
- Treat `persons.sensitive.read` as a separate gate from `persons.read`.
- Use feature flags from `GET /api/v1/tenants/current/features` before showing module-level navigation.
- Use permissions from `GET /api/v1/auth/me` before showing route-level and action-level controls.
