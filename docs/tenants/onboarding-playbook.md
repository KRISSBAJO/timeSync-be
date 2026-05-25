# Tenant Onboarding Playbook

This playbook covers Stages 40-42 tenant onboarding polish and admin operations.

## Onboarding API

Current tenant:

```txt
GET /api/v1/tenants/current/onboarding
```

Platform admin view:

```txt
GET /api/v1/platform/tenants/:id/onboarding
```

The response contains:

- Tenant identity and status.
- Completion percentage.
- Completed step count.
- Step evidence.
- Top next best actions.

## Checklist Stages

1. Tenant profile
   Confirm settings, branding, localization, and subscription are present.

2. Features enabled
   Enable the core WorkforceOS modules required for the tenant launch.

3. Roles ready
   Verify default roles and permission templates.

4. Users ready
   Create tenant administrators and invite operators.

5. Organization ready
   Build organization nodes, cost centers, and reporting structure.

6. Workforce ready
   Load employees and assignment history.

7. Workflows ready
   Activate approval workflows.

8. Compliance ready
   Review document types and compliance queues.

9. Dashboard ready
   Confirm dashboard widgets and analytics snapshots.

## Admin Handoff

For each tenant launch, record:

- Tenant slug and primary domain.
- Admin email and temporary-password delivery channel.
- Enabled features.
- Assigned permission template per role.
- Initial workflow list.
- Initial document type list.
- Data import owner.
- Production support contact.

## Quality Bar

Do not consider a tenant ready when:

- No tenant admin can log in.
- No organization node exists.
- Default roles are missing.
- Core features are disabled.
- Document compliance is not initialized.
- Approval workflows are not active for lifecycle changes.
