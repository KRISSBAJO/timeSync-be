import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { platformPermissionCodes } from './permission-catalog';

describe('Permission catalog', () => {
  it('covers every permission declared by API guards', () => {
    const guardedPermissions = collectGuardedPermissions(join(process.cwd(), 'apps/api-gateway/src'));
    const catalog = new Set(platformPermissionCodes);
    const missing = [...guardedPermissions].filter((permission) => !catalog.has(permission)).sort();

    expect(missing).toEqual([]);
  });
});

function collectGuardedPermissions(root: string) {
  const permissions = new Set<string>();

  for (const filePath of walkTypescriptFiles(root)) {
    const source = readFileSync(filePath, 'utf8');
    const decoratorMatches = source.matchAll(/@RequirePermissions\(([^)]*)\)/g);

    for (const decoratorMatch of decoratorMatches) {
      const argumentList = decoratorMatch[1] ?? '';
      const permissionMatches = argumentList.matchAll(/['"`]([^'"`]+)['"`]/g);

      for (const permissionMatch of permissionMatches) {
        const permission = permissionMatch[1];

        if (permission) {
          permissions.add(permission);
        }
      }
    }
  }

  return permissions;
}

function walkTypescriptFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = join(root, entry);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      files.push(...walkTypescriptFiles(filePath));
      continue;
    }

    if (filePath.endsWith('.ts') && !filePath.endsWith('.spec.ts')) {
      files.push(filePath);
    }
  }

  return files;
}
