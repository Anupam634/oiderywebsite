/* Local PostgreSQL for development and tests, no Docker or sudo needed (embedded-postgres runs the real
   Postgres binaries). Stop with Ctrl+C / SIGTERM.
   Defaults: data in <repo>/.data/pg, port 54329, databases store + store_shadow.
   Tests override with PG_DIR, PG_PORT, PG_DATABASES and PG_EPHEMERAL=1 (delete the data dir on stop). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dir = process.env.PG_DIR ?? path.join(root, '.data', 'pg');
const port = Number(process.env.PG_PORT ?? 54329);
const user = process.env.PG_USER ?? 'store';
const databases = (process.env.PG_DATABASES ?? 'store,store_shadow').split(',');
const ephemeral = process.env.PG_EPHEMERAL === '1';

const pg = new EmbeddedPostgres({ databaseDir: dir, user, password: user, port, persistent: !ephemeral, onLog: () => {} });
if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
for (const db of databases) await pg.createDatabase(db).catch(() => undefined); // already exists
console.log(`PostgreSQL ready: postgresql://${user}:${user}@localhost:${port}/${databases[0]}  (Ctrl+C to stop)`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
