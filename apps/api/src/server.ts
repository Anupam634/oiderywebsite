import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createPrisma } from './lib/prisma.ts';

const config = loadConfig();
const db = createPrisma(config.DATABASE_URL);
const app = await buildApp({ config, db });

await app.listen({ port: config.PORT, host: config.HOST });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
}
