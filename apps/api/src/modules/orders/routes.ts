import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireCustomer } from '../../lib/auth.ts';
import { notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import { CashfreeGateway, type CfPayment, type GatewayPayment } from '../payments/gateway.ts';
import { placeOrderSchema, type OrderService } from './service.ts';

const numberParam = z.object({ number: z.string().regex(/^[A-Z]{2,4}-[A-Z0-9]{4,10}$/) });

/** Checkout: place an order, open the payment window, confirm the payment. */
export const orderRoutes =
  (db: Db, orders: OrderService): FastifyPluginAsyncZod =>
  async (app) => {
    const mine = async (number: string, customerId: string) => {
      const o = await orders.byNumber(number);
      if (!o || o.customerId !== customerId) throw notFound('Order');
      return o;
    };

    app.post(
      '/orders',
      {
        preValidation: requireCustomer,
        schema: { tags: ['orders'], summary: 'Place an order (cash on delivery) or create it and open the payment', body: placeOrderSchema },
        config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
      },
      async (req, reply) => {
        const result = await orders.place(req.customer!.customerId, req.body, req.clientIp);
        reply.code(201);
        return result;
      },
    );

    app.post(
      '/orders/:number/pay',
      { preValidation: requireCustomer, schema: { tags: ['orders'], summary: 'Open the payment window again for an unpaid order', params: numberParam } },
      async (req) => ({ payment: await orders.paymentStart(await mine(req.params.number, req.customer!.customerId)) }),
    );

    app.post(
      '/orders/:number/razorpay',
      {
        preValidation: requireCustomer,
        schema: {
          tags: ['orders'],
          summary: 'Confirm a Razorpay payment (the checkout success handler)',
          params: numberParam,
          body: z.object({ razorpay_order_id: z.string().max(60), razorpay_payment_id: z.string().max(60), razorpay_signature: z.string().max(200) }),
        },
      },
      async (req) => {
        const o = await mine(req.params.number, req.customer!.customerId);
        return { order: orders.dto(await orders.confirmRazorpay(o, req.body)) };
      },
    );

    app.post(
      '/orders/:number/cashfree',
      {
        preValidation: requireCustomer,
        schema: { tags: ['orders'], summary: 'Check a Cashfree payment with Cashfree (after its window closes, or on the way back from Cashfree)', params: numberParam },
        config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
      },
      async (req) => {
        const o = await mine(req.params.number, req.customer!.customerId);
        return { order: orders.dto(await orders.confirmCashfree(o)) };
      },
    );

    app.post(
      '/orders/:number/fake-payment',
      {
        preValidation: requireCustomer,
        schema: { tags: ['orders'], summary: 'Test payments only: succeed or fail the pretend payment', params: numberParam, body: z.object({ ok: z.boolean() }) },
      },
      async (req) => {
        if (orders.gateway.name !== 'fake') throw notFound('Route');
        const o = await mine(req.params.number, req.customer!.customerId);
        return { order: orders.dto(await orders.fakePayment(o, req.body.ok)) };
      },
    );

    app.post(
      '/orders/:number/payment-failed',
      {
        preValidation: requireCustomer,
        schema: { tags: ['orders'], summary: 'Note a failed payment attempt reported by the browser', params: numberParam, body: z.object({ reason: z.string().max(300).optional() }) },
      },
      async (req) => {
        const o = await mine(req.params.number, req.customer!.customerId);
        await db.orderEvent.create({ data: { orderId: o.id, type: 'payment_failed', message: `Payment attempt failed${req.body.reason ? `: ${req.body.reason}` : ''}`, actor: 'CUSTOMER', visible: false } });
        return { ok: true };
      },
    );
  };

interface RzpEvent {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string | null; status: string; method: string | null; amount: number; error_description?: string | null } };
    refund?: { entity: { id: string; payment_id: string; amount: number; status: string } };
  };
}

/** a Cashfree webhook (payment and refund events) */
interface CfEvent {
  type: string;
  data: {
    order?: { order_id: string };
    payment?: CfPayment;
    error_details?: { error_description?: string | null } | null;
    refund?: { refund_id: string; refund_status: string };
  };
}

/** Razorpay and Cashfree webhooks (the raw body is needed to check the signature). */
export const webhookRoutes =
  (db: Db, orders: OrderService): FastifyPluginAsync =>
  async (app) => {
    app.removeContentTypeParser('application/json');
    app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 1 << 20 }, (_req, body, done) => done(null, body));

    app.post('/webhooks/razorpay', { schema: { hide: true }, config: { rateLimit: false } }, async (req, reply) => {
      const raw = req.body as Buffer;
      const sig = req.headers['x-razorpay-signature'];
      if (orders.gateway.name !== 'razorpay' || typeof sig !== 'string' || !Buffer.isBuffer(raw) || !orders.gateway.verifyWebhook(raw, sig)) {
        reply.code(400);
        return { ok: false };
      }
      const evt = JSON.parse(raw.toString('utf8')) as RzpEvent;
      const pay = evt.payload.payment?.entity;
      switch (evt.event) {
        case 'payment.authorized':
        case 'payment.captured':
        case 'order.paid': {
          if (!pay?.order_id) break;
          const row = await db.payment.findUnique({ where: { providerOrderId: pay.order_id } });
          if (!row) break;
          let gp: GatewayPayment = { paymentId: pay.id, orderId: pay.order_id, status: pay.status, method: pay.method, amountPaise: pay.amount, errorReason: null, raw: pay };
          if (gp.status === 'authorized') gp = { ...(await orders.gateway.capture(pay.id, pay.amount)), raw: pay };
          if (gp.status === 'captured') await orders.recordPaid(row.id, gp);
          break;
        }
        case 'payment.failed': {
          if (!pay?.order_id) break;
          await db.payment.updateMany({ where: { providerOrderId: pay.order_id, status: 'CREATED' }, data: { errorReason: pay.error_description ?? 'failed' } });
          break;
        }
        case 'refund.processed':
        case 'refund.failed': {
          const r = evt.payload.refund?.entity;
          if (r) await refundSettled(r.id, evt.event === 'refund.processed' ? 'PROCESSED' : 'FAILED', 'Razorpay');
          break;
        }
        default:
          break;
      }
      return { ok: true };
    });

    app.post('/webhooks/cashfree', { schema: { hide: true }, config: { rateLimit: false } }, async (req, reply) => {
      const raw = req.body as Buffer;
      const sig = req.headers['x-webhook-signature'];
      const ts = req.headers['x-webhook-timestamp'];
      const cf = orders.gateway instanceof CashfreeGateway ? orders.gateway : null;
      if (!cf || typeof sig !== 'string' || typeof ts !== 'string' || !Buffer.isBuffer(raw) || !cf.verifyWebhook(raw, sig, ts)) {
        reply.code(400);
        return { ok: false };
      }
      const evt = JSON.parse(raw.toString('utf8')) as CfEvent;
      const orderId = evt.data?.order?.order_id;
      switch (evt.type) {
        case 'PAYMENT_SUCCESS_WEBHOOK': {
          if (!orderId || !evt.data.payment) break;
          const row = await db.payment.findUnique({ where: { providerOrderId: orderId } });
          const gp = CashfreeGateway.toPayment(evt.data.payment, orderId);
          if (row && gp.status === 'captured') await orders.recordPaid(row.id, gp);
          break;
        }
        case 'PAYMENT_FAILED_WEBHOOK':
        case 'PAYMENT_USER_DROPPED_WEBHOOK': {
          if (!orderId) break;
          const reason = evt.data.error_details?.error_description ?? (evt.type === 'PAYMENT_USER_DROPPED_WEBHOOK' ? 'The shopper closed the payment window' : 'failed');
          await db.payment.updateMany({ where: { providerOrderId: orderId, status: 'CREATED' }, data: { errorReason: reason } });
          break;
        }
        case 'REFUND_STATUS_WEBHOOK': {
          const r = evt.data?.refund;
          const status = r && { SUCCESS: 'PROCESSED' as const, CANCELLED: 'FAILED' as const, REJECTED: 'FAILED' as const }[r.refund_status];
          if (r && status) await refundSettled(r.refund_id, status, 'Cashfree');
          break;
        }
        default:
          break;
      }
      return { ok: true };
    });

    /** the bank has finished a refund (or it failed): note it once */
    async function refundSettled(providerRefundId: string, status: 'PROCESSED' | 'FAILED', gateway: string) {
      const row = await db.refund.findUnique({ where: { providerRefundId } });
      if (!row || row.status === status) return;
      await db.refund.update({ where: { id: row.id }, data: { status } });
      await db.orderEvent.create({ data: { orderId: row.orderId, type: `refund_${status.toLowerCase()}`, message: status === 'PROCESSED' ? 'Refund processed by the bank' : `Refund failed: please check in the ${gateway} dashboard`, visible: status === 'PROCESSED' } });
    }
  };
