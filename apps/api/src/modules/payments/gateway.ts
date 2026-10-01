import type { Config } from '../../config.ts';
import { hmacHex, randomCode, safeEqual } from '../../lib/crypto.ts';

/* Payment gateways. Razorpay in test or live mode once keys are set; "fake" for local development and
   demos (a pretend payment sheet in the browser decides success or failure). */

export interface GatewayOrder {
  providerOrderId: string;
}

export interface GatewayPayment {
  paymentId: string;
  orderId: string | null;
  /** created | authorized | captured | refunded | failed */
  status: string;
  /** upi | card | netbanking | wallet | emi | paylater … */
  method: string | null;
  amountPaise: number;
  errorReason: string | null;
  raw: unknown;
}

export interface GatewayRefund {
  providerRefundId: string;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
}

export interface PaymentGateway {
  readonly name: 'razorpay' | 'fake';
  /** Razorpay key id (safe to show in the browser) */
  readonly keyId?: string;
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<GatewayOrder>;
  /** the payment that settled this gateway order, if any (used to double-check before cancelling) */
  findPaid(providerOrderId: string): Promise<GatewayPayment | null>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  /** capture an authorized payment (when auto-capture is off in the dashboard) */
  capture(paymentId: string, amountPaise: number): Promise<GatewayPayment>;
  refund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<GatewayRefund>;
  /** checkout handler signature: HMAC(order_id|payment_id) */
  verifyCheckout(providerOrderId: string, paymentId: string, signature: string): boolean;
  verifyWebhook(rawBody: Buffer, signature: string): boolean;
}

export class GatewayError extends Error {}

export function createGateway(config: Config): PaymentGateway {
  return config.PAYMENTS_PROVIDER === 'razorpay' ? new RazorpayGateway(config.RAZORPAY_KEY_ID!, config.RAZORPAY_KEY_SECRET!, config.RAZORPAY_WEBHOOK_SECRET) : new FakeGateway();
}

interface RzpPayment {
  id: string;
  order_id: string | null;
  status: string;
  method: string | null;
  amount: number;
  error_description?: string | null;
  error_reason?: string | null;
}

export class RazorpayGateway implements PaymentGateway {
  readonly name = 'razorpay';
  private auth: string;
  constructor(
    readonly keyId: string,
    private keySecret: string,
    private webhookSecret: string | undefined,
  ) {
    this.auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  }

  private async call<T>(method: string, path: string, body?: object): Promise<T> {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: { authorization: this.auth, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
    if (!res.ok) throw new GatewayError(`Razorpay ${res.status}: ${json.error?.description ?? 'request failed'}`);
    return json;
  }

  private map = (p: RzpPayment): GatewayPayment => ({
    paymentId: p.id,
    orderId: p.order_id,
    status: p.status,
    method: p.method,
    amountPaise: p.amount,
    errorReason: p.error_description ?? p.error_reason ?? null,
    raw: p,
  });

  async createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
    const o = await this.call<{ id: string }>('POST', '/orders', { amount: input.amountPaise, currency: 'INR', receipt: input.receipt, notes: input.notes });
    return { providerOrderId: o.id };
  }

  async findPaid(providerOrderId: string) {
    const list = await this.call<{ items: RzpPayment[] }>('GET', `/orders/${encodeURIComponent(providerOrderId)}/payments`);
    const p = list.items.find((x) => x.status === 'captured') ?? list.items.find((x) => x.status === 'authorized');
    return p ? this.map(p) : null;
  }

  async fetchPayment(paymentId: string) {
    return this.map(await this.call<RzpPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`));
  }

  async capture(paymentId: string, amountPaise: number) {
    return this.map(await this.call<RzpPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: 'INR' }));
  }

  async refund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<GatewayRefund> {
    const r = await this.call<{ id: string; status: string }>('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, speed: 'normal', notes });
    return { providerRefundId: r.id, status: r.status === 'processed' ? 'PROCESSED' : r.status === 'failed' ? 'FAILED' : 'PENDING' };
  }

  verifyCheckout(providerOrderId: string, paymentId: string, signature: string) {
    return safeEqual(hmacHex(this.keySecret, `${providerOrderId}|${paymentId}`), signature);
  }

  verifyWebhook(rawBody: Buffer, signature: string) {
    return !!this.webhookSecret && safeEqual(hmacHex(this.webhookSecret, rawBody), signature);
  }
}

/** Pretend gateway: orders and payments live in memory; the browser's test sheet reports the outcome. */
export class FakeGateway implements PaymentGateway {
  readonly name = 'fake';
  private payments = new Map<string, GatewayPayment>();

  async createOrder() {
    return { providerOrderId: `fake_order_${randomCode(12)}` };
  }
  /** called by the test sheet route */
  pay(providerOrderId: string, amountPaise: number, method: string, ok: boolean): GatewayPayment {
    const p: GatewayPayment = {
      paymentId: `fake_pay_${randomCode(12)}`,
      orderId: providerOrderId,
      status: ok ? 'captured' : 'failed',
      method,
      amountPaise,
      errorReason: ok ? null : 'Payment declined in the test sheet',
      raw: { fake: true },
    };
    this.payments.set(p.paymentId, p);
    return p;
  }
  async findPaid(providerOrderId: string) {
    return [...this.payments.values()].find((p) => p.orderId === providerOrderId && p.status === 'captured') ?? null;
  }
  async fetchPayment(paymentId: string) {
    const p = this.payments.get(paymentId);
    if (!p) throw new GatewayError('unknown fake payment');
    return p;
  }
  async capture(paymentId: string) {
    return this.fetchPayment(paymentId);
  }
  async refund() {
    return { providerRefundId: `fake_rfnd_${randomCode(12)}`, status: 'PROCESSED' as const };
  }
  verifyCheckout() {
    return false;
  }
  verifyWebhook() {
    return false;
  }
}
