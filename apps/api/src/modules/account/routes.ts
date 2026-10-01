import { z } from 'zod';
import { INDIAN_STATES, PHONE_RE, PINCODE_RE, type AddressDto } from '@store/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireCustomer } from '../../lib/auth.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { Address } from '../../generated/prisma/client.ts';
import type { Files } from '../files/service.ts';
import { canCustomerCancel, orderInclude, toSummaryDto } from '../orders/dto.ts';
import type { OrderService } from '../orders/service.ts';

const toAddress = (a: Address): AddressDto => ({
  id: a.id,
  name: a.name,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2,
  landmark: a.landmark,
  city: a.city,
  state: a.state,
  pincode: a.pincode,
  type: a.type,
  isDefault: a.isDefault,
});

const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, msg);
const addressBody = z.object({
  name: text(2, 80, 'Enter the full name'),
  phone: z.string().regex(PHONE_RE, 'Enter a 10-digit mobile number'),
  line1: text(3, 120, 'Enter the flat or house number'),
  line2: text(3, 120, 'Enter the area or street'),
  landmark: z.string().trim().max(80).default(''),
  city: text(2, 60, 'Enter the city'),
  state: z.enum(INDIAN_STATES, 'Choose the state'),
  pincode: z.string().regex(PINCODE_RE, 'Enter a 6-digit pincode'),
  type: z.enum(['HOME', 'WORK', 'OTHER']).default('HOME'),
  isDefault: z.boolean().optional(),
});

/** The shopper's own addresses and orders. */
export const accountRoutes =
  (db: Db, orders: OrderService, files: Files): FastifyPluginAsyncZod =>
  async (app) => {
    app.addHook('preValidation', requireCustomer);
    app.addHook('onSend', async (_req, reply) => {
      reply.header('cache-control', 'private, no-store');
    });
    const me = (req: { customer: { customerId: string } | null }) => req.customer!.customerId;

    /* ---- addresses ---- */
    app.get('/me/addresses', { schema: { tags: ['account'], summary: 'Saved addresses' } }, async (req) => ({
      items: (await db.address.findMany({ where: { customerId: me(req) }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] })).map(toAddress),
    }));

    app.post('/me/addresses', { schema: { tags: ['account'], summary: 'Add an address', body: addressBody } }, async (req, reply) => {
      const customerId = me(req);
      const count = await db.address.count({ where: { customerId } });
      if (count >= 20) throw new AppError(400, 'too_many', 'You can save up to 20 addresses');
      const { isDefault, ...data } = req.body;
      const a = await db.$transaction(async (tx) => {
        if (isDefault) await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
        return tx.address.create({ data: { ...data, customerId, isDefault: count === 0 || !!isDefault } });
      });
      reply.code(201);
      return { address: toAddress(a) };
    });

    app.patch(
      '/me/addresses/:id',
      { schema: { tags: ['account'], summary: 'Edit an address', params: z.object({ id: z.string().max(40) }), body: addressBody.partial() } },
      async (req) => {
        const customerId = me(req);
        const a = await db.address.findFirst({ where: { id: req.params.id, customerId } });
        if (!a) throw notFound('Address');
        const { isDefault, ...data } = req.body;
        const saved = await db.$transaction(async (tx) => {
          if (isDefault) await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
          return tx.address.update({ where: { id: a.id }, data: { ...data, ...(isDefault ? { isDefault: true } : {}) } });
        });
        return { address: toAddress(saved) };
      },
    );

    app.delete('/me/addresses/:id', { schema: { tags: ['account'], summary: 'Remove an address', params: z.object({ id: z.string().max(40) }) } }, async (req) => {
      const customerId = me(req);
      const a = await db.address.findFirst({ where: { id: req.params.id, customerId } });
      if (!a) throw notFound('Address');
      await db.$transaction(async (tx) => {
        await tx.address.delete({ where: { id: a.id } });
        if (a.isDefault) {
          const next = await tx.address.findFirst({ where: { customerId }, orderBy: { updatedAt: 'desc' } });
          if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      });
      return { ok: true };
    });

    /* ---- orders ---- */
    app.get(
      '/me/orders',
      { schema: { tags: ['account'], summary: 'My orders, newest first', querystring: z.object({ page: z.coerce.number().int().min(1).default(1) }) } },
      async (req) => {
        // unpaid checkouts that were abandoned are noise; everything else shows
        const where = { customerId: me(req), NOT: { status: 'CANCELLED' as const, placedAt: null } };
        const [rows, total] = await Promise.all([
          db.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (req.query.page - 1) * 10, take: 10, include: { items: orderInclude.items } }),
          db.order.count({ where }),
        ]);
        return { items: rows.map((o) => toSummaryDto(o, files)), total, page: req.query.page, pageSize: 10 };
      },
    );

    app.get('/me/orders/:number', { schema: { tags: ['account'], summary: 'One of my orders', params: z.object({ number: z.string().max(20) }) } }, async (req) => {
      const o = await orders.byNumber(req.params.number);
      if (!o || o.customerId !== me(req)) throw notFound('Order');
      const dto = orders.dto(o);
      if (o.status === 'DELIVERED') {
        const done = new Set((await db.review.findMany({ where: { orderItemId: { in: o.items.map((i) => i.id) } }, select: { orderItemId: true } })).map((r) => r.orderItemId));
        for (const i of dto.items) {
          i.reviewed = done.has(i.id);
          i.canReview = !i.reviewed && !!i.productSlug;
        }
      }
      return { order: dto };
    });

    app.post(
      '/me/reviews',
      {
        schema: {
          tags: ['account'],
          summary: 'Review a delivered piece (checked by the studio before it shows)',
          body: z.object({ itemId: z.string().max(40), rating: z.number().int().min(1).max(5), body: z.string().trim().min(10, 'Write at least a few words').max(1000) }),
        },
        config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      },
      async (req, reply) => {
        const item = await db.orderItem.findUnique({ where: { id: req.body.itemId }, include: { order: true } });
        if (!item || item.order.customerId !== me(req)) throw notFound('Item');
        if (item.order.status !== 'DELIVERED' || !item.productId) throw new AppError(409, 'not_reviewable', 'You can review a piece once it has been delivered');
        if (await db.review.findUnique({ where: { orderItemId: item.id } })) throw new AppError(409, 'already_reviewed', 'You’ve already reviewed this piece');
        const c = await db.customer.findUniqueOrThrow({ where: { id: me(req) } });
        await db.review.create({
          data: { productId: item.productId, customerId: c.id, orderItemId: item.id, authorName: (c.name ?? item.order.shipName).split(/\s+/).slice(0, 2).join(' '), city: item.order.shipCity, rating: req.body.rating, body: req.body.body, status: 'PENDING' },
        });
        reply.code(201);
        return { ok: true };
      },
    );

    app.post(
      '/me/orders/:number/cancel',
      {
        schema: {
          tags: ['account'],
          summary: 'Cancel my order (before it’s made or shipped)',
          params: z.object({ number: z.string().max(20) }),
          body: z.object({ reason: z.string().trim().max(300).optional() }),
        },
      },
      async (req) => {
        const o = await orders.byNumber(req.params.number);
        if (!o || o.customerId !== me(req)) throw notFound('Order');
        if (!canCustomerCancel(o)) throw new AppError(409, 'cannot_cancel', 'This order is already being made or shipped. Please WhatsApp us and we’ll help.');
        const done = await orders.cancel(o.id, req.body.reason ?? '', { actor: 'CUSTOMER' });
        return { order: orders.dto(done) };
      },
    );
  };
