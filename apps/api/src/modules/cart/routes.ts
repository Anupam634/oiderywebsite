import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '../../lib/prisma.ts';
import { cartBodySchema, priceCart } from './service.ts';

/** Server-side prices for a bag. The browser shows its own estimate; this is the number we charge. */
export const cartRoutes =
  (db: Db): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/cart/price',
      { schema: { tags: ['cart'], summary: 'Price a bag (validates stock, names and coupon)', body: cartBodySchema }, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
      async (req) => {
        const me = await app.sessions.customer(req);
        const priced = await priceCart(db, req.body, { customerId: me?.customerId });
        return {
          lines: priced.lines.map(({ facts: _f, input: _i, ...l }) => l),
          totals: priced.totals,
          coupon: priced.couponStatus,
        };
      },
    );

    app.get(
      '/coupons',
      { schema: { tags: ['cart'], summary: 'Offers a shopper can apply at checkout' } },
      async (_req, reply) => {
        const now = new Date();
        const rows = await db.coupon.findMany({
          where: { active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
          orderBy: { minSubtotalPaise: 'asc' },
        });
        reply.header('cache-control', 'public, max-age=60');
        return {
          items: rows
            .filter((c) => c.maxUses === null || c.usedCount < c.maxUses)
            .map((c) => ({ code: c.code, label: c.label, percent: c.percent, maxDiscountPaise: c.maxDiscountPaise, minSubtotalPaise: c.minSubtotalPaise, firstOrderOnly: c.firstOrderOnly })),
        };
      },
    );
  };
