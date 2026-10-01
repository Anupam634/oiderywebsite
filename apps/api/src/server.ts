import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { startJobs } from './jobs/index.ts';
import { hashPassword } from './lib/crypto.ts';
import { createPrisma } from './lib/prisma.ts';

const config = loadConfig();
const db = createPrisma(config.DATABASE_URL);
const app = await buildApp({ config, db });

// a brand-new server gets its owner login from ADMIN_BOOTSTRAP_EMAIL/PASSWORD (only while no staff exist)
if (config.ADMIN_BOOTSTRAP_EMAIL && config.ADMIN_BOOTSTRAP_PASSWORD && (await db.adminUser.count()) === 0) {
  if (config.ADMIN_BOOTSTRAP_PASSWORD.length < 10) throw new Error('ADMIN_BOOTSTRAP_PASSWORD must be at least 10 characters');
  await db.adminUser.create({ data: { email: config.ADMIN_BOOTSTRAP_EMAIL.toLowerCase(), name: 'Owner', role: 'OWNER', passwordHash: await hashPassword(config.ADMIN_BOOTSTRAP_PASSWORD) } });
  app.log.warn(`created the owner login ${config.ADMIN_BOOTSTRAP_EMAIL}; remove ADMIN_BOOTSTRAP_PASSWORD from the environment now`);
}

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
