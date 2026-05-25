require('dotenv/config');

const { randomUUID } = require('crypto');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const dryRun = ['1', 'true', 'yes'].includes(String(process.env.QA_REPAIR_DRY_RUN || '').toLowerCase());

const permissionDefinitions = [
  ['qa.read', 'Read QA Console', 'qa', 'View the QA command center, script catalog, run history, and captured output.'],
  ['qa.run', 'Run QA Scripts', 'qa', 'Launch and cancel whitelisted QA scripts from the command center.'],
];

const platformRolePermissionCodes = {
  SUPER_ADMIN: permissionDefinitions.map(([code]) => code),
  PLATFORM_SUPPORT: ['qa.read'],
};

async function main() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Check your .env file before running the repair.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    const platformPermissions = await upsertPlatformPermissions(client);
    const platformGrants = await grantPlatformRolePermissions(client, platformPermissions);
    const tenantRevocations = await revokeTenantQaAccess(client);

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }

    console.log(`${dryRun ? 'Dry run complete' : 'QA access repair complete'} for platform app-owner access.`);
    console.log('Platform grants');
    console.table(platformGrants);
    console.log('Tenant revocations');
    console.table(tenantRevocations);
    console.log('Next: use the Platform workspace and log out/in if the QA Console navigation is not visible yet.');
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

async function upsertPlatformPermissions(client) {
  const permissions = new Map();

  for (const [code, name, module, description] of permissionDefinitions) {
    const existing = await client.query(
      `
        SELECT "id", "code"
        FROM "Permission"
        WHERE "tenantId" IS NULL AND "code" = $1
        LIMIT 1
      `,
      [code],
    );

    if (existing.rows[0]) {
      const result = await client.query(
        `
          UPDATE "Permission"
          SET
            "name" = $2,
            "module" = $3,
            "description" = $4,
            "isSystem" = true,
            "updatedAt" = NOW()
          WHERE "id" = $1
          RETURNING "id", "code"
        `,
        [existing.rows[0].id, name, module, description],
      );
      permissions.set(result.rows[0].code, result.rows[0].id);
      continue;
    }

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
        VALUES ($1, NULL, $2, $3, $4, $5, true, NOW(), NOW())
        RETURNING "id", "code"
      `,
      [randomUUID(), code, name, module, description],
    );

    permissions.set(result.rows[0].code, result.rows[0].id);
  }

  return permissions;
}

async function grantPlatformRolePermissions(client, permissions) {
  const roleCodes = Object.keys(platformRolePermissionCodes);
  const roleResult = await client.query(
    `
      SELECT "id", "code"
      FROM "Role"
      WHERE "tenantId" IS NULL
        AND "code" = ANY($1::text[])
        AND "deletedAt" IS NULL
        AND "isActive" = true
      ORDER BY "code"
    `,
    [roleCodes],
  );

  const rolesByCode = new Map(roleResult.rows.map((role) => [role.code, role]));
  const summary = [];

  for (const roleCode of roleCodes) {
    const role = rolesByCode.get(roleCode);
    const permissionCodes = platformRolePermissionCodes[roleCode];

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

async function revokeTenantQaAccess(client) {
  const permissionCodes = permissionDefinitions.map(([code]) => code);
  const rolePermissions = await client.query(
    `
      DELETE FROM "RolePermission" rp
      USING "Permission" p, "Role" r
      WHERE rp."permissionId" = p."id"
        AND rp."roleId" = r."id"
        AND p."tenantId" IS NOT NULL
        AND p."code" = ANY($1::text[])
      RETURNING rp."id"
    `,
    [permissionCodes],
  );
  const permissions = await client.query(
    `
      DELETE FROM "Permission"
      WHERE "tenantId" IS NOT NULL
        AND "code" = ANY($1::text[])
      RETURNING "id"
    `,
    [permissionCodes],
  );

  return [
    { action: 'tenant role permission grants removed', count: rolePermissions.rowCount },
    { action: 'tenant-scoped QA permissions removed', count: permissions.rowCount },
  ];
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
