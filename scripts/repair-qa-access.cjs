require('dotenv/config');

const { randomUUID } = require('crypto');
const { Client } = require('pg');

const tenantSlug = process.env.QA_REPAIR_TENANT_SLUG || process.env.SMOKE_TENANT_SLUG || process.env.DEMO_TENANT_SLUG || 'acme-health';
const databaseUrl = process.env.DATABASE_URL;
const dryRun = ['1', 'true', 'yes'].includes(String(process.env.QA_REPAIR_DRY_RUN || '').toLowerCase());

const permissionDefinitions = [
  ['qa.read', 'Read QA Console', 'qa', 'View the QA command center, script catalog, run history, and captured output.'],
  ['qa.run', 'Run QA Scripts', 'qa', 'Launch and cancel whitelisted QA scripts from the command center.'],
];

const rolePermissionCodes = {
  TENANT_ADMIN: permissionDefinitions.map(([code]) => code),
};

async function main() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Check your .env file before running the repair.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    const tenant = await findTenant(client, tenantSlug);
    const permissions = await upsertPermissions(client, tenant.id);
    const grants = await grantRolePermissions(client, tenant.id, permissions);

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }

    console.log(`${dryRun ? 'Dry run complete' : 'QA access repair complete'} for ${tenant.name} (${tenant.slug}).`);
    console.table(grants);
    console.log('Next: log out/in if the QA Console navigation is not visible yet.');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function findTenant(client, slug) {
  const result = await client.query(
    `
      SELECT "id", "name", "slug"
      FROM "Tenant"
      WHERE "slug" = $1 AND "deletedAt" IS NULL
      LIMIT 1
    `,
    [slug],
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  const tenants = await client.query(
    `
      SELECT "slug"
      FROM "Tenant"
      WHERE "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 8
    `,
  );
  const knownSlugs = tenants.rows.map((tenant) => tenant.slug).join(', ') || 'none';

  throw new Error(`Tenant "${slug}" was not found. Set QA_REPAIR_TENANT_SLUG to one of: ${knownSlugs}.`);
}

async function upsertPermissions(client, tenantId) {
  const permissions = new Map();

  for (const [code, name, module, description] of permissionDefinitions) {
    const result = await client.query(
      `
        INSERT INTO "Permission" (
          "id",
          "tenantId",
          "code",
          "name",
          "module",
          "description",
          "isSystem",
          "createdAt",
          "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
        ON CONFLICT ("tenantId", "code") DO UPDATE SET
          "name" = EXCLUDED."name",
          "module" = EXCLUDED."module",
          "description" = EXCLUDED."description",
          "isSystem" = true,
          "updatedAt" = NOW()
        RETURNING "id", "code"
      `,
      [randomUUID(), tenantId, code, name, module, description],
    );

    permissions.set(result.rows[0].code, result.rows[0].id);
  }

  return permissions;
}

async function grantRolePermissions(client, tenantId, permissions) {
  const roleCodes = Object.keys(rolePermissionCodes);
  const roleResult = await client.query(
    `
      SELECT "id", "code"
      FROM "Role"
      WHERE "tenantId" = $1
        AND "code" = ANY($2::text[])
        AND "deletedAt" IS NULL
        AND "isActive" = true
      ORDER BY "code"
    `,
    [tenantId, roleCodes],
  );

  const rolesByCode = new Map(roleResult.rows.map((role) => [role.code, role]));
  const summary = [];

  for (const roleCode of roleCodes) {
    const role = rolesByCode.get(roleCode);
    const permissionCodes = rolePermissionCodes[roleCode];

    if (!role) {
      summary.push({ role: roleCode, permissions: permissionCodes.length, inserted: 0, existing: 0, status: 'role not found' });
      continue;
    }

    let inserted = 0;
    let existing = 0;

    for (const permissionCode of permissionCodes) {
      const permissionId = permissions.get(permissionCode);
      if (!permissionId) throw new Error(`Permission ${permissionCode} was not prepared.`);

      const grant = await client.query(
        `
          INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
          VALUES ($1, $2, $3)
          ON CONFLICT ("roleId", "permissionId") DO NOTHING
          RETURNING "id"
        `,
        [randomUUID(), role.id, permissionId],
      );

      if (grant.rowCount > 0) {
        inserted += 1;
      } else {
        existing += 1;
      }
    }

    summary.push({ role: roleCode, permissions: permissionCodes.length, inserted, existing, status: 'ok' });
  }

  return summary;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

