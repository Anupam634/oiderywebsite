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
import { authRoutes } from './modules/auth/routes.ts';
import { createOtpProvider } from './modules/auth/otp.ts';
import { cartRoutes } from './modules/cart/routes.ts';
import { CatalogRepo } from './modules/catalog/repo.ts';
import { catalogRoutes } from './modules/catalog/routes.ts';
import { fileRoutes } from './modules/files/routes.ts';
import { Files } from './modules/files/service.ts';
import { createStorage } from './modules/files/storage.ts';
import { Notifications } from './modules/notify/messages.ts';
import { Transport } from './modules/notify/transport.ts';
import { orderRoutes, webhookRoutes } from './modules/orders/routes.ts';
import { OrderService } from './modules/orders/service.ts';
import { createGateway, type PaymentGateway } from './modules/payments/gateway.ts';

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
  const otp = createOtpProvider(config, (msg) => app.log.info(msg));
  app.decorate('catalog', catalog);
  app.decorate('files', files);
  app.decorate('orders', orders);
  app.decorate('notify', notify);

  await app.register(catalogRoutes(catalog), { prefix: '/v1' });
  await app.register(cartRoutes(db), { prefix: '/v1' });
  await app.register(authRoutes(db, otp), { prefix: '/v1' });
  await app.register(accountRoutes(db, orders, files), { prefix: '/v1' });
  await app.register(orderRoutes(db, orders), { prefix: '/v1' });
  await app.register(fileRoutes(db, files), { prefix: '/v1' });
  await app.register(webhookRoutes(db, orders), { prefix: '/v1' });
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    catalog: CatalogRepo;
    files: Files;
    orders: OrderService;
    notify: Notifications;
  }
}
