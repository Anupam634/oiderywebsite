import type { Config } from '../../config.ts';
import { hmacBase64, hmacHex, randomCode, safeEqual } from '../../lib/crypto.ts';

/* Payment gateways. Razorpay or Cashfree in test or live mode once keys are set; "fake" for local development
   and demos (a pretend payment sheet in the browser decides success or failure). */

export interface GatewayOrderInput {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
  /** the shopper (Cashfree puts them on the order) */
  customer: { id: string; phone: string; name: string; email: string | null };
  /** upi | card | netbanking | wallet: the method chosen on our page */
  method: string;
  /** where Cashfree sends the shopper back to when its window can't open over our page (in-app browsers) */
  returnUrl: string;
  /** the gateway order stops taking payments after this */
  expiresAt: Date;
}

export interface GatewayOrder {
  providerOrderId: string;
  /** Cashfree: the payment session the browser opens its checkout with */
  sessionId?: string;
}

export interface GatewayPayment {
  paymentId: string;
  orderId: string | null;
  /** created | authorized | captured | refunded | failed; Cashfree also pending (the bank hasn't answered yet) and dropped (window closed mid-payment) */
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
  readonly name: 'razorpay' | 'cashfree' | 'fake';
  /** Razorpay key id (safe to show in the browser) */
  readonly keyId?: string;
  createOrder(input: GatewayOrderInput): Promise<GatewayOrder>;
  /** the payment that settled this gateway order, if any (used to double-check before cancelling) */
  findPaid(providerOrderId: string): Promise<GatewayPayment | null>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  /** capture an authorized payment (when auto-capture is off in the dashboard) */
  capture(paymentId: string, amountPaise: number): Promise<GatewayPayment>;
  /** Cashfree refunds by order, so the gateway order id comes along */
  refund(paymentId: string, amountPaise: number, notes: Record<string, string>, providerOrderId?: string | null): Promise<GatewayRefund>;
  /** checkout handler signature: HMAC(order_id|payment_id) */
  verifyCheckout(providerOrderId: string, paymentId: string, signature: string): boolean;
  /** Cashfree signs its timestamp header together with the body */
  verifyWebhook(rawBody: Buffer, signature: string, timestamp?: string): boolean;
}

export class GatewayError extends Error {}

export function createGateway(config: Config): PaymentGateway {
  if (config.PAYMENTS_PROVIDER === 'razorpay') return new RazorpayGateway(config.RAZORPAY_KEY_ID!, config.RAZORPAY_KEY_SECRET!, config.RAZORPAY_WEBHOOK_SECRET);
  if (config.PAYMENTS_PROVIDER === 'cashfree') return new CashfreeGateway(config.CASHFREE_APP_ID!, config.CASHFREE_SECRET_KEY!, config.CASHFREE_ENV);
  return new FakeGateway();
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

  async createOrder(input: GatewayOrderInput) {
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

/** a payment as Cashfree reports it (API answers and webhooks) */
export interface CfPayment {
  cf_payment_id: string | number;
  payment_status: string;
  payment_amount: number;
  payment_group?: string | null;
  payment_time?: string | null;
  error_details?: { error_description?: string | null } | null;
}

/** the API version our requests and Cashfree's answers follow */
const CF_VERSION = '2025-01-01';
/** Cashfree's payment groups as the method names the shop uses (upi | card | netbanking | wallet …) */
const CF_GROUP: Record<string, string> = {
  upi: 'upi', upi_credit_card: 'upi', upi_ppi: 'upi', upi_ppi_offline: 'upi',
  credit_card: 'card', debit_card: 'card', prepaid_card: 'card',
  net_banking: 'netbanking', wallet: 'wallet', pay_later: 'paylater',
  credit_card_emi: 'emi', debit_card_emi: 'emi', cardless_emi: 'emi',
};
/** the checkout window shows only the method chosen on our page (the UPI discount depends on it) */
const CF_METHODS: Record<string, string> = { upi: 'upi', card: 'cc,dc,ccc,ppc', netbanking: 'nb', wallet: 'app' };
/** anything else (FAILED, CANCELLED, VOID) failed */
const CF_STATUS: Record<string, string> = { SUCCESS: 'captured', PENDING: 'pending', NOT_ATTEMPTED: 'created', USER_DROPPED: 'dropped' };
const CF_REFUND: Record<string, GatewayRefund['status']> = { SUCCESS: 'PROCESSED', CANCELLED: 'FAILED', REJECTED: 'FAILED' };

/**
 * Cashfree Payment Gateway. The server creates a Cashfree order and hands its payment session to the browser,
 * which opens Cashfree's window over our page. There is no browser-side signature: when the window closes the
 * server asks Cashfree how the payment went, and Cashfree's signed webhooks say the same.
 */
export class CashfreeGateway implements PaymentGateway {
  readonly name = 'cashfree';
  private base: string;
  constructor(
    private appId: string,
    private secretKey: string,
    /** sandbox (test keys) or production; the browser's checkout script needs it too */
    readonly mode: 'sandbox' | 'production',
  ) {
    this.base = mode === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
  }

  private async call<T>(method: string, path: string, body?: object): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        'x-client-id': this.appId,
        'x-client-secret': this.secretKey,
        'x-api-version': CF_VERSION,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) throw new GatewayError(`Cashfree ${res.status}: ${json.message ?? 'request failed'}`);
    return json;
  }

  static toPayment(p: CfPayment, orderId: string): GatewayPayment {
    return {
      paymentId: String(p.cf_payment_id),
      orderId,
      status: CF_STATUS[p.payment_status] ?? 'failed',
      method: p.payment_group ? (CF_GROUP[p.payment_group] ?? p.payment_group) : null,
      amountPaise: Math.round(p.payment_amount * 100),
      errorReason: p.payment_status === 'SUCCESS' ? null : (p.error_details?.error_description ?? null),
      raw: p,
    };
  }

  async createOrder(input: GatewayOrderInput) {
    const c = input.customer;
    const name = c.name.trim();
    const o = await this.call<{ order_id: string; payment_session_id: string }>('POST', '/orders', {
      // our order number plus a random part: a payment started again after an expired one needs a new Cashfree order
      order_id: `${input.receipt}_${randomCode(6)}`,
      order_amount: input.amountPaise / 100,
      order_currency: 'INR',
      customer_details: {
        customer_id: c.id,
        customer_phone: c.phone,
        ...(name.length >= 3 ? { customer_name: name.slice(0, 100) } : {}),
        ...(c.email ? { customer_email: c.email } : {}),
      },
      order_meta: { return_url: input.returnUrl, ...(CF_METHODS[input.method] ? { payment_methods: CF_METHODS[input.method] } : {}) },
      order_expiry_time: input.expiresAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      order_note: `Order ${input.receipt}`,
      order_tags: input.notes,
    });
    return { providerOrderId: o.order_id, sessionId: o.payment_session_id };
  }

  /** an order's state, with its payment session while it still takes payments (ACTIVE) */
  async session(providerOrderId: string): Promise<{ status: string; sessionId: string | null }> {
    const o = await this.call<{ order_status: string; payment_session_id?: string | null }>('GET', `/orders/${encodeURIComponent(providerOrderId)}`);
    return { status: o.order_status, sessionId: o.order_status === 'ACTIVE' ? (o.payment_session_id ?? null) : null };
  }

  /** every payment attempt on an order, newest first */
  async attempts(providerOrderId: string) {
    const list = await this.call<CfPayment[]>('GET', `/orders/${encodeURIComponent(providerOrderId)}/payments`);
    const time = (p: CfPayment) => Date.parse(p.payment_time ?? '') || 0;
    return [...list].sort((a, b) => time(b) - time(a)).map((p) => CashfreeGateway.toPayment(p, providerOrderId));
  }

  async findPaid(providerOrderId: string) {
    return (await this.attempts(providerOrderId)).find((p) => p.status === 'captured') ?? null;
  }

  /** Cashfree finds payments through their order (attempts) */
  async fetchPayment(): Promise<GatewayPayment> {
    throw new GatewayError('Cashfree payments are looked up through their order');
  }

  /** Cashfree captures payments itself: a successful payment is already captured */
  async capture(): Promise<GatewayPayment> {
    throw new GatewayError('Cashfree captures payments itself');
  }

  async refund(_paymentId: string, amountPaise: number, notes: Record<string, string>, providerOrderId?: string | null): Promise<GatewayRefund> {
    if (!providerOrderId) throw new GatewayError('A Cashfree refund needs the Cashfree order id');
    const order = notes.order ?? '';
    const note = (notes.reason ?? '').trim();
    const r = await this.call<{ refund_id: string; refund_status: string }>('POST', `/orders/${encodeURIComponent(providerOrderId)}/refunds`, {
      // letters and digits only: the order number without its dash, then a random part
      refund_id: `${order.replace(/[^A-Za-z0-9]/g, '')}R${randomCode(10)}`,
      refund_amount: amountPaise / 100,
      refund_note: note.length >= 3 ? note.slice(0, 100) : `Refund for order ${order}`.trim(),
      refund_speed: 'STANDARD',
    });
    return { providerRefundId: r.refund_id, status: CF_REFUND[r.refund_status] ?? 'PENDING' };
  }

  /** nothing to check in the browser: the server asks Cashfree instead (OrderService.confirmCashfree) */
  verifyCheckout() {
    return false;
  }

  /** x-webhook-signature = base64 HMAC-SHA256 of x-webhook-timestamp followed by the raw body, keyed with the secret key */
  verifyWebhook(rawBody: Buffer, signature: string, timestamp?: string) {
    return !!timestamp && safeEqual(hmacBase64(this.secretKey, Buffer.concat([Buffer.from(timestamp), rawBody])), signature);
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
