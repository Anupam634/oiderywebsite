import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { startJobs } from './jobs/index.ts';
import { createPrisma } from './lib/prisma.ts';

const config = loadConfig();
const db = createPrisma(config.DATABASE_URL);
const app = await buildApp({ config, db });

await app.listen({ port: config.PORT, host: config.HOST });
const stopJobs = startJobs({ db, files: app.files, orders: app.orders, log: app.log });
app.log.info(`payments: ${config.PAYMENTS_PROVIDER}, login codes: ${config.OTP_PROVIDER}, email: ${config.EMAIL_PROVIDER}, whatsapp: ${config.WHATSAPP_PROVIDER}, files: ${config.STORAGE}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    stopJobs();
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
}
