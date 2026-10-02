import fs from 'node:fs';
import { defineConfig } from 'prisma/config';

// local development keeps settings in .env; servers pass real environment variables
if (fs.existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // read here without requiring it: `prisma generate` runs without a database (CI, Docker builds), and the
  // migrate commands report a missing DATABASE_URL themselves
  datasource: { url: process.env.DATABASE_URL, shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL },
});
