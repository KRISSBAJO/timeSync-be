# Permission Templates

TimeSync now exposes reusable permission templates so admins can bootstrap roles consistently.

## API

List templates:

```txt
GET /api/v1/iam/permission-templates
```

Apply a template:

```txt
POST /api/v1/iam/roles/:id/permission-template/:templateCode
```

The apply endpoint replaces the role permission set with the template permission set.

## Templates

| Code | Scope | Risk | Use |
| --- | --- | --- | --- |
| `PLATFORM_OPERATOR` | Platform | High | Full platform operations. |
| `PLATFORM_SUPPORT_READONLY` | Platform | Medium | Platform support without writes. |
| `TENANT_ADMIN_FULL` | Tenant | High | Full tenant administration. |
| `HR_OPERATIONS` | Tenant | High | People operations and workforce management. |
| `MANAGER_SELF_SERVICE` | Tenant | Medium | Manager workspace and approvals. |
| `DOCUMENT_COMPLIANCE` | Tenant | Medium | Document review and verification. |
| `WORKFLOW_STEWARD` | Tenant | High | Workflow builder and approval governance. |
| `EMPLOYEE_SELF_SERVICE` | Tenant | Low | Employee portal access. |
| `AUDITOR_READONLY` | Tenant | Medium | Audit and compliance review. |

## Operating Rules

- Platform templates can only be applied by platform administrators.
- Tenant actors only see tenant-scoped templates.
- System roles remain protected by the existing immutable-role guard.
- Template application is intentionally replace-based to avoid hidden permission drift.
