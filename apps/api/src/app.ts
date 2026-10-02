import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { BRAND } from '@store/shared';
import type { Config } from './config.ts';
import { registerAuth } from './lib/auth.ts';
import { registerErrorHandler } from './lib/errors.ts';
import type { Db } from './lib/prisma.ts';
import { accountRoutes } from './modules/account/routes.ts';
import { adminAuthRoutes } from './modules/admin/auth.ts';
import { adminCatalogRoutes } from './modules/admin/catalog.ts';
import { adminOrderRoutes } from './modules/admin/orders.ts';
import { adminReportRoutes } from './modules/admin/reports.ts';
import { adminStoreRoutes } from './modules/admin/store.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { createOtpProvider } from './modules/auth/otp.ts';
import { cartRoutes } from './modules/cart/routes.ts';
import { CatalogRepo } from './modules/catalog/repo.ts';
import { catalogRoutes } from './modules/catalog/routes.ts';
import { fileRoutes } from './modules/files/routes.ts';
import { Files } from './modules/files/service.ts';
import { createStorage } from './modules/files/storage.ts';
import { InvoiceService } from './modules/invoice/service.ts';
import { Notifications } from './modules/notify/messages.ts';
import { Transport } from './modules/notify/transport.ts';
import { Fulfilment } from './modules/orders/fulfil.ts';
import { orderRoutes, webhookRoutes } from './modules/orders/routes.ts';
import { monitorRoutes } from './modules/monitor/routes.ts';
import { pincodeRoutes } from './modules/pincodes/routes.ts';
import { OrderService } from './modules/orders/service.ts';
import { createGateway, type PaymentGateway } from './modules/payments/gateway.ts';
import { proofRoutes } from './modules/proofs/routes.ts';
import { adminReturnRoutes, returnRoutes } from './modules/returns/routes.ts';
import { ReturnService } from './modules/returns/service.ts';
import { StitchFiles } from './modules/stitchfiles/service.ts';

export async function buildApp({ config, db, gateway }: { config: Config; db: Db; gateway?: PaymentGateway }) {
  const app = Fastify({
    logger:
      config.LOG_LEVEL === 'silent'
        ? false
        : { level: config.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-proxy-key"]', 'res.headers["set-cookie"]'] },
    // trust exactly TRUST_PROXY hops of X-Forwarded-For (a load balancer in front of us), never more
    trustProxy: config.TRUST_PROXY > 0 ? (_addr: string, hop: number) => hop < config.TRUST_PROXY : false,
    bodyLimit: 1 << 20,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(cookie);
  registerAuth(app, db, config); // before the rate limiter: it works out the shopper's address
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } });
  await app.register(cors, { origin: config.WEB_ORIGIN.split(',').map((s) => s.trim()), credentials: true });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute', keyGenerator: (req) => req.clientIp || req.ip });
  await app.register(multipart, { limits: { fileSize: 25 << 20, files: 1, fields: 8 } });
  await app.register(swagger, { openapi: { info: { title: `${BRAND.name} API`, version: '0.2.0' } }, transform: jsonSchemaTransform });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', { schema: { hide: true } }, async () => {
    await db.$queryRaw`select 1`;
    return { ok: true };
  });

  const catalog = new CatalogRepo(db, config.CATALOG_CACHE_SECONDS);
  const files = new Files(db, createStorage(config), config);
  const notify = new Notifications(new Transport(config, app.log), config);
  const orders = new OrderService(db, config, gateway ?? createGateway(config), files, notify, app.log);
  const invoices = new InvoiceService(db, files);
  const fulfil = new Fulfilment(db, orders, invoices, notify, files);
  const stitch = new StitchFiles(db, files, config);
  const returns = new ReturnService(db, orders, files, notify);
  // ask the storefront to drop its cached catalogue after admin edits (best effort)
  const refreshWeb = () => {
    if (!config.WEB_REVALIDATE_URL) return;
    void fetch(config.WEB_REVALIDATE_URL, { method: 'POST', headers: { 'x-proxy-key': config.PROXY_KEY ?? '' }, signal: AbortSignal.timeout(5000) }).catch((err: unknown) =>
      app.log.warn({ err }, 'storefront refresh failed'),
    );
  };
  const otp = createOtpProvider(config, (msg) => app.log.info(msg));
  app.decorate('catalog', catalog);
  app.decorate('files', files);
  app.decorate('orders', orders);
  app.decorate('notify', notify);
  app.decorate('invoices', invoices);
  app.decorate('fulfil', fulfil);

  await app.register(catalogRoutes(catalog), { prefix: '/v1' });
  await app.register(cartRoutes(db), { prefix: '/v1' });
  await app.register(pincodeRoutes, { prefix: '/v1' });
  await app.register(monitorRoutes, { prefix: '/v1' });
  await app.register(authRoutes(db, otp, config.OTP_IP_LIMIT_PER_HOUR), { prefix: '/v1' });
  await app.register(accountRoutes(db, orders, files, returns), { prefix: '/v1' });
  await app.register(returnRoutes(orders, returns), { prefix: '/v1' });
  await app.register(orderRoutes(db, orders), { prefix: '/v1' });
  await app.register(fileRoutes(db, files), { prefix: '/v1' });
  await app.register(webhookRoutes(db, orders), { prefix: '/v1' });
  await app.register(proofRoutes(db, files, fulfil), { prefix: '/v1' });
  await app.register(adminAuthRoutes(db), { prefix: '/v1' });
  await app.register(adminOrderRoutes(db, orders, fulfil, invoices, files, stitch), { prefix: '/v1' });
  await app.register(adminReturnRoutes(db, returns), { prefix: '/v1' });
  await app.register(adminCatalogRoutes(db, catalog, files, refreshWeb), { prefix: '/v1' });
  await app.register(adminStoreRoutes(db, files), { prefix: '/v1' });
  await app.register(adminReportRoutes(db), { prefix: '/v1' });
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    catalog: CatalogRepo;
    files: Files;
    orders: OrderService;
    notify: Notifications;
    invoices: InvoiceService;
    fulfil: Fulfilment;
  }
}
