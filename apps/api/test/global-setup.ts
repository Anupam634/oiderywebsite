/* Starts a throwaway PostgreSQL (in a child process), applies migrations and seeds the catalogue once
   for the whole test run. */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

let child: ChildProcess | undefined;

export default async function setup(project: TestProject) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-')), 'pg');
  const port = 55_000 + Math.floor(Math.random() * 5_000);
  // run node directly (not npx) so SIGTERM reaches the script, which then stops Postgres cleanly
  child = spawn(process.execPath, ['--import', 'tsx', 'scripts/dev-db.ts'], {
    env: { ...process.env, PG_DIR: dir, PG_PORT: String(port), PG_USER: 'test', PG_DATABASES: 'store_test', PG_EPHEMERAL: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('test database did not start')), 60_000);
    child!.stdout!.on('data', (b: Buffer) => {
      if (b.toString().includes('ready')) {
        clearTimeout(timer);
        child!.stdout!.removeAllListeners('data').resume(); // don't keep a reader attached for the whole run
        resolve();
      }
    });
    child!.on('exit', (code) => reject(new Error(`test database exited (${code})`)));
  });
  const url = `postgresql://test:test@localhost:${port}/store_test`;
  const env = { ...process.env, DATABASE_URL: url };
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env, stdio: 'pipe' });
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], { env, stdio: 'pipe' });
  project.provide('databaseUrl', url);

  // returned teardown: stop Postgres (the script deletes the throwaway data dir)
  return async () => {
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve) => {
      child!.once('exit', resolve);
      child!.kill('SIGTERM');
    });
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
