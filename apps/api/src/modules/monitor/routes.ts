import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { capture, parseStack, redactPath } from '../../lib/monitor.ts';

/* Errors from the storefront: shoppers' browsers (via the /api proxy) and the Next.js server. They go to the
   log and, when SENTRY_DSN is set, to Sentry. Anyone can call this, so it is small, rate-limited and never
   trusted for anything else. */
const body = z.object({
  message: z.string().min(1).max(500),
  type: z.string().max(80).optional(),
  stack: z.string().max(8000).optional(),
  /** the page (browser) or route pattern (server) where it happened */
  url: z.string().max(500).optional(),
  source: z.enum(['browser', 'web-server']).default('browser'),
  /** Next.js error digest, shown to the shopper as "ref …" */
  digest: z.string().max(64).optional(),
});

export const monitorRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/client-errors',
    {
      bodyLimit: 16 * 1024,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { tags: ['monitoring'], summary: 'Report a storefront error (browser or web server)', body, hide: true },
    },
    async (req, reply) => {
      const b = req.body;
      const where = b.url ? redactPath(b.url.replace(/^https?:\/\/[^/]+/, '')) : undefined;
      req.log.warn({ source: b.source, where, digest: b.digest, error: b.message }, 'storefront error');
      capture({
        type: b.type || 'Error',
        message: b.message,
        frames: parseStack(b.stack),
        platform: b.source === 'browser' ? 'javascript' : 'node',
        tags: { source: b.source, ...(b.digest ? { digest: b.digest } : {}) },
        ...(where ? { request: { url: where } } : {}),
        extra: { userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) },
      });
      return reply.code(204).send();
    },
  );
};
