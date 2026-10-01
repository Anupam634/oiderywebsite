import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { BRAND } from '@store/shared';
import type { Config } from './config.ts';
import { registerErrorHandler } from './lib/errors.ts';
import type { Db } from './lib/prisma.ts';
import { cartRoutes } from './modules/cart/routes.ts';
import { CatalogRepo } from './modules/catalog/repo.ts';
import { catalogRoutes } from './modules/catalog/routes.ts';

export async function buildApp({ config, db }: { config: Config; db: Db }) {
  const app = Fastify({
    logger: config.LOG_LEVEL === 'silent' ? false : { level: config.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] },
    trustProxy: true,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.WEB_ORIGIN.split(',').map((s) => s.trim()), credentials: true });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  await app.register(swagger, { openapi: { info: { title: `${BRAND.name} API`, version: '0.1.0' } }, transform: jsonSchemaTransform });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', { schema: { hide: true } }, async () => {
    await db.$queryRaw`select 1`;
    return { ok: true };
  });

  const catalog = new CatalogRepo(db, config.CATALOG_CACHE_SECONDS);
  app.decorate('catalog', catalog);
  await app.register(catalogRoutes(catalog), { prefix: '/v1' });
  await app.register(cartRoutes(db), { prefix: '/v1' });
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    catalog: CatalogRepo;
  }
}
