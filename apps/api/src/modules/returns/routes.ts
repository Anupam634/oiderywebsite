import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAdmin, requireCustomer, requireOwner } from '../../lib/auth.ts';
import { audit } from '../../lib/audit.ts';
import type { Db } from '../../lib/prisma.ts';
import type { OrderService } from '../orders/service.ts';
import { returnRequestSchema, type ReturnService } from './service.ts';

const orderParam = z.object({ number: z.string().max(20) });
const returnParam = z.object({ number: z.string().max(20) });
const tracking = z.object({ courier: z.string().trim().min(2, 'Enter the courier').max(60), awb: z.string().trim().min(3, 'Enter the tracking number').max(60) });

/** Shoppers: ask to return or exchange delivered pieces, or withdraw the request. */
export const returnRoutes =
  (orders: OrderService, returns: ReturnService): FastifyPluginAsyncZod =>
  async (app) => {
    app.addHook('preValidation', requireCustomer);
    app.addHook('onSend', async (_req, reply) => {
      reply.header('cache-control', 'private, no-store');
    });
    const me = (req: { customer: { customerId: string } | null }) => req.customer!.customerId;
    const view = async (number: string) => {
      const o = (await orders.byNumber(number))!;
      return { ...orders.dto(o), returnOptions: await returns.options(o) };
    };

    app.post(
      '/me/orders/:number/returns',
      {
        schema: { tags: ['account'], summary: 'Ask to return or exchange pieces of a delivered order', params: orderParam, body: returnRequestSchema },
        config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
      },
      async (req, reply) => {
        const r = await returns.create(me(req), req.params.number, req.body);
        reply.code(201);
        return { request: r.number, order: await view(req.params.number) };
      },
    );

    app.post('/me/returns/:number/cancel', { schema: { tags: ['account'], summary: 'Withdraw my return or exchange request', params: returnParam } }, async (req) => {
      const r = await returns.cancelByCustomer(me(req), req.params.number);
      return { order: await view(r.orderNumber) };
    });
  };

/** The studio's queue of returns and exchanges. */
export const adminReturnRoutes =
  (db: Db, returns: ReturnService): FastifyPluginAsyncZod =>
  async (app) => {
    app.addHook('preValidation', requireAdmin);
    app.addHook('onSend', async (_req, reply) => {
      reply.header('cache-control', 'private, no-store');
    });
    const done = async (number: string) => ({ return: await returns.detail(number) });

    app.get(
      '/admin/returns',
      { schema: { tags: ['admin'], summary: 'Return and exchange requests', querystring: z.object({ status: z.enum(['open', 'done', 'all']).default('open') }) } },
      async (req) => ({ items: await returns.list(req.query.status) }),
    );

    app.get('/admin/returns/:number', { schema: { tags: ['admin'], summary: 'One return or exchange request', params: returnParam } }, async (req) => done(req.params.number));

    app.post(
      '/admin/returns/:number/approve',
      {
        schema: {
          tags: ['admin'],
          summary: 'Accept a request (sets an exchange size aside)',
          params: returnParam,
          body: z.object({ note: z.string().trim().max(400).optional(), pickupCourier: z.string().trim().max(60).optional(), pickupAwb: z.string().trim().max(60).optional() }),
        },
      },
      async (req) => {
        await returns.approve(req.params.number, req.admin!.adminId, req.body);
        await audit(db, req, 'return_approved', 'return', req.params.number, req.body);
        return done(req.params.number);
      },
    );

    app.post(
      '/admin/returns/:number/reject',
      { schema: { tags: ['admin'], summary: 'Decline a request (the customer sees the reason)', params: returnParam, body: z.object({ reason: z.string().trim().min(5, 'Tell the customer why').max(300) }) } },
      async (req) => {
        await returns.reject(req.params.number, req.admin!.adminId, req.body.reason);
        await audit(db, req, 'return_rejected', 'return', req.params.number, req.body);
        return done(req.params.number);
      },
    );

    app.post('/admin/returns/:number/pickup', { schema: { tags: ['admin'], summary: 'Pickup courier and tracking number', params: returnParam, body: tracking } }, async (req) => {
      await returns.pickup(req.params.number, req.admin!.adminId, req.body);
      await audit(db, req, 'return_pickup', 'return', req.params.number, req.body);
      return done(req.params.number);
    });

    app.post(
      '/admin/returns/:number/receive',
      { schema: { tags: ['admin'], summary: 'The pieces are back and checked', params: returnParam, body: z.object({ restock: z.boolean(), note: z.string().trim().max(300).optional() }) } },
      async (req) => {
        await returns.receive(req.params.number, req.admin!.adminId, req.body);
        await audit(db, req, 'return_received', 'return', req.params.number, req.body);
        return done(req.params.number);
      },
    );

    app.post('/admin/returns/:number/exchange', { schema: { tags: ['admin'], summary: 'Replacement sent', params: returnParam, body: tracking } }, async (req) => {
      await returns.shipExchange(req.params.number, req.admin!.adminId, req.body);
      await audit(db, req, 'return_exchanged', 'return', req.params.number, req.body);
      return done(req.params.number);
    });

    app.post(
      '/admin/returns/:number/refund',
      {
        preValidation: requireOwner,
        schema: {
          tags: ['admin'],
          summary: 'Refund a request: to the online payment, or record a UPI / bank transfer (owner)',
          params: returnParam,
          body: z.object({ amountPaise: z.number().int().min(100), method: z.enum(['GATEWAY', 'MANUAL']), reference: z.string().trim().max(60).optional() }),
        },
      },
      async (req) => {
        await returns.refund(req.params.number, req.admin!.adminId, req.body);
        await audit(db, req, 'return_refunded', 'return', req.params.number, req.body);
        return done(req.params.number);
      },
    );
  };
