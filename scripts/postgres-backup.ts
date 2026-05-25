import 'dotenv/config';

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const databaseUrl = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
const outputRoot = resolve(process.env.BACKUP_LOCAL_PATH || './storage/backups');
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const provider = process.env.BACKUP_STORAGE_PROVIDER || 'local';
const releaseSha = process.env.RELEASE_SHA || 'local';

if (!databaseUrl) {
  throw new Error('DATABASE_URL or BACKUP_DATABASE_URL is required to run a PostgreSQL backup.');
}

if (provider !== 'local') {
  throw new Error(`postgres-backup currently writes local dumps. Configure provider=local or run the ${provider} upload job after dump creation.`);
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

async function runPgDump(filePath: string) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--file',
      filePath,
      databaseUrl,
    ], {
      stdio: ['ignore', 'inherit', 'pipe'],
    }) as ChildProcessWithoutNullStreams;

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(stderr || `pg_dump exited with code ${code ?? 'unknown'}.`));
    });
  });
}

async function pruneOldBackups() {
  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const entries = await readdir(outputRoot, { withFileTypes: true });
  const removed: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.dump')) {
      continue;
    }

    const filePath = join(outputRoot, entry.name);
    const details = await stat(filePath);

    if (now - details.mtimeMs > maxAgeMs) {
      await unlink(filePath);
      removed.push(entry.name);
    }
  }

  return removed;
}

async function main() {
  await mkdir(outputRoot, { recursive: true });

  const fileName = `timesync-${timestamp()}.dump`;
  const filePath = join(outputRoot, fileName);
  await runPgDump(filePath);

  const details = await stat(filePath);
  const removed = await pruneOldBackups();
  const metadata = {
    fileName,
    sizeBytes: details.size,
    createdAt: new Date().toISOString(),
    releaseSha,
    retentionDays,
    removed,
  };

  await writeFile(`${filePath}.json`, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  console.log(`Backup complete: ${basename(filePath)} (${details.size} bytes)`);
  if (removed.length > 0) {
    console.log(`Pruned old backups: ${removed.join(', ')}`);
  }
}

void main();
