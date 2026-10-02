import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { hmacHex } from '../src/lib/crypto.ts';
import { createPrisma, type Db } from '../src/lib/prisma.ts';
import { RazorpayGateway, type GatewayPayment } from '../src/modules/payments/gateway.ts';

/* Accounts, checkout and payments, end to end through the HTTP API. Uses products the catalogue tests
   don't count stock on (poppy kit, cherry hoop, tulip cushion, meadow hoop, name T-shirt). */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-orders-'));
const env = (extra: Record<string, string> = {}) =>
  loadConfig({
    NODE_ENV: 'test', OTP_IP_LIMIT_PER_HOUR: '1000',
    DATABASE_URL: inject('databaseUrl'),
    LOG_LEVEL: 'silent',
    OTP_DEV_CODE: '246810',
    OUTBOX_DIR: path.join(tmp, 'outbox'),
    UPLOAD_DIR: path.join(tmp, 'uploads'),
    OWNER_EMAIL: 'owner@example.com',
    ...extra,
  });

/** Razorpay with the network calls replaced: real signature checks, pretend API */
class TestRazorpay extends RazorpayGateway {
  payments = new Map<string, GatewayPayment>();
  refunds: { paymentId: string; amount: number }[] = [];
  n = 0;
  constructor() {
    super('rzp_test_key', 'test_secret', 'webhook_secret');
  }
  override async createOrder() {
    return { providerOrderId: `order_T${++this.n}` };
  }
  override async fetchPayment(id: string) {
    return this.payments.get(id)!;
  }
  override async capture(id: string) {
    const p = { ...this.payments.get(id)!, status: 'captured' };
    this.payments.set(id, p);
    return p;
  }
  override async findPaid(orderId: string) {
    return [...this.payments.values()].find((p) => p.orderId === orderId && p.status === 'captured') ?? null;
  }
  override async refund(paymentId: string, amount: number) {
    this.refunds.push({ paymentId, amount });
    return { providerRefundId: `rfnd_T${this.refunds.length}`, status: 'PENDING' as const };
  }
  /** what Razorpay would record when the shopper pays */
  pay(orderId: string, amount: number, method = 'upi', status = 'captured') {
    const p: GatewayPayment = { paymentId: `pay_T${++this.n}`, orderId, status, method, amountPaise: amount, errorReason: null, raw: {} };
    this.payments.set(p.paymentId, p);
    return p;
  }
}

let app: Awaited<ReturnType<typeof buildApp>>;
let rzpApp: Awaited<ReturnType<typeof buildApp>>;
let rzp: TestRazorpay;
let db: Db;

beforeAll(async () => {
  const config = env();
  db = createPrisma(config.DATABASE_URL);
  app = await buildApp({ config, db });
  rzp = new TestRazorpay();
  rzpApp = await buildApp({ config: env({ PAYMENTS_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'test_secret', RAZORPAY_WEBHOOK_SECRET: 'webhook_secret' }), db, gateway: rzp });
});
afterAll(async () => {
  await app.close();
  await rzpApp.close();
  await db.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

type App = typeof app;
const call = async (a: App, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, opts: { sid?: string; body?: object; headers?: Record<string, string> } = {}) => {
  const r = await a.inject({ method, url, ...(opts.body ? { payload: opts.body } : {}), headers: opts.headers ?? {}, ...(opts.sid ? { cookies: { sid: opts.sid } } : {}) });
  return { status: r.statusCode, body: r.body ? (r.json() as any) : null, cookies: r.cookies, headers: r.headers };
};

let phoneSeq = 0;
/** a fresh shopper, logged in */
async function login(a: App = app) {
  const phone = `98${String(Date.now() % 1e6).padStart(6, '0')}${String(++phoneSeq).padStart(2, '0')}`;
  expect((await call(a, 'POST', '/v1/auth/otp', { body: { phone } })).status).toBe(200);
  const r = await call(a, 'POST', '/v1/auth/verify', { body: { phone, code: '246810' } });
  expect(r.status).toBe(200);
  return { phone, sid: r.cookies.find((c) => c.name === 'sid')!.value };
}

const variant = async (code: string, where: object = {}) => (await db.productVariant.findFirst({ where: { product: { code }, ...where }, orderBy: { sortOrder: 'asc' } }))!;
const stock = async (id: string) => (await db.productVariant.findUnique({ where: { id } }))!.stock;

const details = (phone: string) => ({
  phone,
  email: '',
  whatsappUpdates: true,
  pincode: '400050',
  name: 'Priya Sharma',
  line1: 'Flat 402, Gulmohar',
  line2: 'Linking Road',
  landmark: '',
  city: 'Mumbai',
  state: 'Maharashtra',
  addressType: 'home',
  gst: null,
  giftNote: null,
});
let keySeq = 0;
const place = (a: App, sid: string, phone: string, items: object[], extra: object = {}) =>
  call(a, 'POST', '/v1/orders', { sid, body: { items, shipping: 'standard', payment: 'cod', details: details(phone), clientKey: `test-key-${++keySeq}-${Date.now()}`, ...extra } });

describe('login with a one-time code', () => {
  it('sends a code, refuses wrong ones and logs in', async () => {
    const phone = '9123456780';
    const sent = await call(app, 'POST', '/v1/auth/otp', { body: { phone: '+91 91234 56780' } });
    expect(sent.body).toMatchObject({ ok: true, length: 6, devCode: '246810' });
    expect((await call(app, 'POST', '/v1/auth/otp', { body: { phone } })).body.error.code).toBe('otp_wait');
    const wrong = await call(app, 'POST', '/v1/auth/verify', { body: { phone, code: '111111' } });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toContain('4 tries left');
    const ok = await call(app, 'POST', '/v1/auth/verify', { body: { phone, code: '246810' } });
    expect(ok.body).toMatchObject({ isNew: true, me: { phone } });
    const sid = ok.cookies.find((c) => c.name === 'sid')!;
    expect(sid.httpOnly).toBe(true);
    expect((await call(app, 'GET', '/v1/me', { sid: sid.value })).body.me.phone).toBe(phone);
    // a used code can't be used again
    expect((await call(app, 'POST', '/v1/auth/verify', { body: { phone, code: '246810' } })).body.error.code).toBe('otp_expired');
    await call(app, 'POST', '/v1/auth/logout', { sid: sid.value });
    expect((await call(app, 'GET', '/v1/me', { sid: sid.value })).body.me).toBeNull();
  });

  it('rejects bad numbers and requests from other websites', async () => {
    expect((await call(app, 'POST', '/v1/auth/otp', { body: { phone: '12345' } })).body.error.code).toBe('bad_phone');
    const evil = await call(app, 'POST', '/v1/auth/otp', { body: { phone: '9123456781' }, headers: { origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
  });

  it('keeps the account private', async () => {
    expect((await call(app, 'GET', '/v1/me/orders')).status).toBe(401);
    expect((await call(app, 'POST', '/v1/orders', { body: {} })).status).toBe(401);
  });
});

describe('cash on delivery', () => {
  it('places the order, takes stock, saves the address and messages the shopper', async () => {
    const { sid, phone } = await login();
    const v = await variant('poppy');
    const before = await stock(v.id);
    const r = await place(app, sid, phone, [{ variantId: v.id, qty: 2 }], { expectedTotalPaise: 2 * 99_900 - 19_980 + 4_900 });
    expect(r.status).toBe(201);
    expect(r.body.payment).toBeNull();
    expect(r.body.order).toMatchObject({ status: 'PLACED', paymentState: 'COD_PENDING', paymentMethod: 'COD', totalPaise: 184_720, itemCount: 2, canCancel: true });
    expect(r.body.order.number).toMatch(/^TK-[A-Z0-9]{6}$/);
    expect(await stock(v.id)).toBe(before - 2);
    const addr = await call(app, 'GET', '/v1/me/addresses', { sid });
    expect(addr.body.items).toHaveLength(1);
    expect(addr.body.items[0]).toMatchObject({ city: 'Mumbai', isDefault: true });
    const me = await call(app, 'GET', '/v1/me', { sid });
    expect(me.body.me.name).toBe('Priya Sharma');
    const box = fs.readdirSync(path.join(tmp, 'outbox'));
    expect(box.some((d) => d.includes('whatsapp-order-confirmed'))).toBe(true);
    expect(box.some((d) => d.includes('email-New-order'))).toBe(true);

    // retrying the same checkout returns the same order
    const order = await db.order.findUnique({ where: { number: r.body.order.number } });
    const again = await call(app, 'POST', '/v1/orders', { sid, body: { items: [{ variantId: v.id, qty: 2 }], shipping: 'standard', payment: 'cod', details: details(phone), clientKey: order!.clientKey } });
    expect(again.body.order.number).toBe(r.body.order.number);
    expect(await stock(v.id)).toBe(before - 2);

    // the shopper cancels: stock goes back
    const c = await call(app, 'POST', `/v1/me/orders/${r.body.order.number}/cancel`, { sid, body: {} });
    expect(c.body.order).toMatchObject({ status: 'CANCELLED', canCancel: false });
    expect(await stock(v.id)).toBe(before);
  });

  it('is not offered for made-for-you pieces, and stops when the price changed', async () => {
    const { sid, phone } = await login();
    const tee = await variant('nametee', { size: 'M' });
    const custom = await place(app, sid, phone, [{ variantId: tee.id, qty: 1, personalisation: { text: 'Kabir', font: 'script', thread: 'rani' } }]);
    expect(custom.body.error.code).toBe('cod_not_allowed');
    const kit = await variant('poppy');
    const changed = await place(app, sid, phone, [{ variantId: kit.id, qty: 1 }], { expectedTotalPaise: 1 });
    expect(changed.status).toBe(409);
    expect(changed.body.error).toMatchObject({ code: 'price_changed', details: { totals: { totalPaise: 99_900 + 4_900 } } });
  });

  it('keeps first-order coupons for first orders', async () => {
    const { sid, phone } = await login();
    const kit = await variant('poppy');
    const first = await place(app, sid, phone, [{ variantId: kit.id, qty: 1 }], { coupon: 'TAANKA10' });
    expect(first.body.order).toMatchObject({ couponCode: 'TAANKA10', discountPaise: 9_990 });
    const priced = await call(app, 'POST', '/v1/cart/price', { sid, body: { items: [{ variantId: kit.id, qty: 1 }], coupon: 'TAANKA10' } });
    expect(priced.body.coupon).toMatchObject({ valid: false, message: 'TAANKA10 is for your first order' });
    const second = await place(app, sid, phone, [{ variantId: kit.id, qty: 1 }], { coupon: 'TAANKA10' });
    expect(second.body.error.code).toBe('coupon_invalid');
  });
});

describe('online payment (test gateway)', () => {
  it('reminds once about an unpaid order while its pieces are held, and the shopper never sees that in the timeline', async () => {
    const { sid, phone } = await login();
    const v = await variant('cherry');
    const r = await place(app, sid, phone, [{ variantId: v.id, qty: 1 }], { payment: 'upi' });
    const n = r.body.order.number;
    const reminders = () => fs.readdirSync(path.join(tmp, 'outbox')).filter((d) => d.includes('payment-pending') || d.includes('waiting-for-payment'));
    const before = reminders().length;
    await app.orders.remindUnpaid(); // too soon after checkout
    expect(await db.orderEvent.count({ where: { order: { number: n }, type: 'payment_reminder' } })).toBe(0);

    await db.order.update({ where: { number: n }, data: { email: 'priya@example.com', createdAt: new Date(Date.now() - 11 * 60_000) } });
    expect(await app.orders.remindUnpaid()).toBeGreaterThanOrEqual(1);
    await app.orders.remindUnpaid(); // never twice
    expect(await db.orderEvent.count({ where: { order: { number: n }, type: 'payment_reminder' } })).toBe(1);
    const sent = reminders().slice(before);
    expect(sent.some((d) => d.includes('whatsapp-payment-pending'))).toBe(true);
    expect(sent.some((d) => d.includes('email-Your-order') && d.includes('waiting-for-payment'))).toBe(true);
    const mine = await call(app, 'GET', `/v1/me/orders/${n}`, { sid });
    expect(mine.body.order.events.map((e: any) => e.type)).not.toContain('payment_reminder');

    // past the hold, it's released rather than reminded again
    await db.order.update({ where: { number: n }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } });
    await app.orders.expireUnpaid();
    expect((await db.order.findUnique({ where: { number: n } }))!.status).toBe('CANCELLED');
  });

  it('waits for payment, survives a failed try, then confirms', async () => {
    const { sid, phone } = await login();
    const v = await variant('cherry');
    const before = await stock(v.id);
    const r = await place(app, sid, phone, [{ variantId: v.id, qty: 1 }], { payment: 'upi' });
    expect(r.body.order).toMatchObject({ status: 'PENDING_PAYMENT', paymentState: 'PENDING', canPay: true, upiDiscountPaise: 5_000, totalPaise: 144_900 });
    expect(r.body.payment).toMatchObject({ provider: 'fake', method: 'upi', amountPaise: 144_900 });
    expect(await stock(v.id)).toBe(before - 1);
    const n = r.body.order.number;
    expect((await call(app, 'POST', `/v1/orders/${n}/fake-payment`, { sid, body: { ok: false } })).status).toBe(402);
    const paid = await call(app, 'POST', `/v1/orders/${n}/fake-payment`, { sid, body: { ok: true } });
    expect(paid.body.order).toMatchObject({ status: 'PLACED', paymentState: 'PAID', canPay: false });
    expect(paid.body.order.events.map((e: any) => e.type)).toEqual(['created', 'paid']);

    // cancelling a paid order refunds it
    const c = await call(app, 'POST', `/v1/me/orders/${n}/cancel`, { sid, body: { reason: 'Ordered twice' } });
    expect(c.body.order).toMatchObject({ status: 'CANCELLED', paymentState: 'REFUNDED', refundedPaise: 144_900 });
    expect(await stock(v.id)).toBe(before);
  });

  it('holds a one-of-a-kind piece for the payer, and lets it go when the payment window closes', async () => {
    const a = await login();
    const b = await login();
    const v = await variant('meadow');
    const first = await place(app, a.sid, a.phone, [{ variantId: v.id, qty: 1 }], { payment: 'card' });
    expect(first.body.order.status).toBe('PENDING_PAYMENT');
    const blocked = await place(app, b.sid, b.phone, [{ variantId: v.id, qty: 1 }], { payment: 'card' });
    expect(blocked.body.error.code).toBe('cart_changed');
    expect(blocked.body.error.details.lines[0].problems).toEqual(['Sold out']);

    await db.order.update({ where: { number: first.body.order.number }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } });
    await app.orders.expireUnpaid();
    expect((await db.order.findUnique({ where: { number: first.body.order.number } }))!.status).toBe('CANCELLED');
    expect(await stock(v.id)).toBe(1);
    const second = await place(app, b.sid, b.phone, [{ variantId: v.id, qty: 1 }], { payment: 'card' });
    expect(second.body.order.status).toBe('PENDING_PAYMENT');

    // A pays late, after B took the piece: A is refunded automatically
    const pay = await db.payment.findFirst({ where: { order: { number: first.body.order.number } } });
    await app.orders.recordPaid(pay!.id, { paymentId: 'fake_pay_late', orderId: pay!.providerOrderId, status: 'captured', method: 'card', amountPaise: pay!.amountPaise, errorReason: null, raw: {} });
    const late = await db.order.findUnique({ where: { number: first.body.order.number } });
    expect(late).toMatchObject({ status: 'CANCELLED', paymentState: 'REFUNDED', refundedPaise: pay!.amountPaise });

    // B's order lapses too, then B pays late while the piece is still free: B's order comes back
    await db.order.update({ where: { number: second.body.order.number }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } });
    await app.orders.expireUnpaid();
    const bPay = await db.payment.findFirst({ where: { order: { number: second.body.order.number } } });
    await app.orders.recordPaid(bPay!.id, { paymentId: 'fake_pay_b', orderId: bPay!.providerOrderId, status: 'captured', method: 'card', amountPaise: bPay!.amountPaise, errorReason: null, raw: {} });
    expect(await db.order.findUnique({ where: { number: second.body.order.number } })).toMatchObject({ status: 'PLACED', paymentState: 'PAID' });
    expect(await stock(v.id)).toBe(0);
  });
});

describe('Razorpay', () => {
  it('verifies the checkout signature before marking an order paid', async () => {
    const { sid, phone } = await login(rzpApp);
    const v = await variant('tulip');
    const r = await place(rzpApp, sid, phone, [{ variantId: v.id, qty: 1 }], { payment: 'upi' });
    expect(r.body.payment).toMatchObject({ provider: 'razorpay', keyId: 'rzp_test_key', amountPaise: 139_900 - 5_000 });
    const orderId = r.body.payment.providerOrderId;
    const p = rzp.pay(orderId, r.body.payment.amountPaise);
    const url = `/v1/orders/${r.body.order.number}/razorpay`;
    const forged = await call(rzpApp, 'POST', url, { sid, body: { razorpay_order_id: orderId, razorpay_payment_id: p.paymentId, razorpay_signature: 'nope' } });
    expect(forged.body.error.code).toBe('bad_signature');
    const ok = await call(rzpApp, 'POST', url, { sid, body: { razorpay_order_id: orderId, razorpay_payment_id: p.paymentId, razorpay_signature: hmacHex('test_secret', `${orderId}|${p.paymentId}`) } });
    expect(ok.body.order).toMatchObject({ status: 'PLACED', paymentState: 'PAID' });
    const row = await db.payment.findUnique({ where: { providerOrderId: orderId } });
    expect(row).toMatchObject({ status: 'CAPTURED', method: 'upi', providerPaymentId: p.paymentId });
  });

  it('accepts signed webhooks only, and handles repeats', async () => {
    const { sid, phone } = await login(rzpApp);
    const v = await variant('poppy');
    const r = await place(rzpApp, sid, phone, [{ variantId: v.id, qty: 1 }], { payment: 'card' });
    const orderId = r.body.payment.providerOrderId;
    const p = rzp.pay(orderId, r.body.payment.amountPaise, 'card', 'authorized');
    const body = JSON.stringify({ event: 'payment.authorized', payload: { payment: { entity: { id: p.paymentId, order_id: orderId, status: 'authorized', method: 'card', amount: p.amountPaise } } } });
    const send = (sig: string) => rzpApp.inject({ method: 'POST', url: '/v1/webhooks/razorpay', payload: body, headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig } });
    expect((await send('bad')).statusCode).toBe(400);
    const sig = hmacHex('webhook_secret', body);
    expect((await send(sig)).statusCode).toBe(200);
    expect((await send(sig)).statusCode).toBe(200);
    const o = await db.order.findUnique({ where: { number: r.body.order.number }, include: { events: true } });
    expect(o).toMatchObject({ status: 'PLACED', paymentState: 'PAID' });
    expect(o!.events.filter((e) => e.type === 'paid')).toHaveLength(1);
  });
});

describe('uploads and studio orders', () => {
  const multipart = (fields: Record<string, string>, file: { name: string; type: string; data: Buffer }) => {
    const b = `----test${Date.now()}`;
    const parts = Object.entries(fields).map(([k, v]) => Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    return {
      payload: Buffer.concat([...parts, Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from(`\r\n--${b}--\r\n`)]),
      headers: { 'content-type': `multipart/form-data; boundary=${b}` },
    };
  };
  const upload = async (kind: string, data: Buffer, name = 'logo.png', type = 'image/png') => {
    const m = multipart({ kind }, { name, type, data });
    const r = await app.inject({ method: 'POST', url: '/v1/uploads', ...m });
    return { status: r.statusCode, body: r.json() as any };
  };

  it('cleans uploaded images and needs the logo for a logo order', async () => {
    const png = await sharp({ create: { width: 400, height: 300, channels: 4, background: '#E4007C' } }).png().toBuffer();
    const logo = await upload('logo', png);
    expect(logo.status).toBe(201);
    expect(logo.body).toMatchObject({ kind: 'logo', width: 400, height: 300 });
    const jpg = await sharp({ create: { width: 270, height: 338, channels: 3, background: '#ffffff' } }).jpeg().withExifMerge({ IFD0: { Copyright: 'secret' } }).toBuffer();
    const preview = await upload('preview', jpg, 'preview.jpg', 'image/jpeg');
    expect(preview.status).toBe(201);
    const stored = await db.upload.findUnique({ where: { id: preview.body.id } });
    const meta = await sharp((await app.files.read(stored!))!).metadata();
    expect(meta.exif).toBeUndefined();
    expect((await upload('logo', Buffer.from('not an image'))).body.error.code).toBe('not_an_image');
    expect((await upload('virus', png)).body.error.code).toBe('bad_kind');

    const { sid, phone } = await login();
    const studio = { garment: 'tee', colour: 'kajal', view: 'tee', placement: 'lc', widthCm: 8, stitches: 5200, source: 'upload', label: 'logo.png', sizes: { M: 2 } };
    const missing = await place(app, sid, phone, [{ qty: 2, studio }], { payment: 'upi' });
    expect(missing.body.error.code).toBe('logo_missing');
    const r = await place(app, sid, phone, [{ qty: 2, studio, uploads: [logo.body.id, preview.body.id] }], { payment: 'upi' });
    expect(r.status).toBe(201);
    expect(r.body.order.items[0]).toMatchObject({ kind: 'STUDIO', name: 'T-shirt with your logo', productionStatus: 'AWAITING_PROOF', extraPaise: 39_900 });
    const img = r.body.order.items[0].image as string;
    expect(img).toMatch(/^\/v1\/files\/.+\?exp=\d+&sig=[0-9a-f]+$/);
    const file = await app.inject({ method: 'GET', url: img });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    // a forged signature (always a different first digit) is refused
    expect((await app.inject({ method: 'GET', url: img.replace(/sig=(.)/, (_: string, c: string) => `sig=${c === '0' ? '1' : '0'}`) })).statusCode).toBe(403);
    // the upload now belongs to the order and can't be reused
    const item = await db.orderItem.findFirst({ where: { order: { number: r.body.order.number } }, include: { uploads: true } });
    expect(item!.uploads.map((u) => u.kind).sort()).toEqual(['LOGO', 'PREVIEW']);
  });
});

describe('account', () => {
  it('lists my orders and manages addresses', async () => {
    const { sid, phone } = await login();
    const v = await variant('poppy');
    const placed = await place(app, sid, phone, [{ variantId: v.id, qty: 1 }]);
    const list = await call(app, 'GET', '/v1/me/orders', { sid });
    expect(list.body.items.map((o: any) => o.number)).toEqual([placed.body.order.number]);
    expect(list.headers['cache-control']).toBe('private, no-store');
    const other = await login();
    expect((await call(app, 'GET', `/v1/me/orders/${placed.body.order.number}`, { sid: other.sid })).status).toBe(404);

    const added = await call(app, 'POST', '/v1/me/addresses', {
      sid,
      body: { name: 'Office', phone, line1: 'Plot 7', line2: 'MIDC', city: 'Pune', state: 'Maharashtra', pincode: '411001', type: 'WORK', isDefault: true },
    });
    expect(added.status).toBe(201);
    let all = (await call(app, 'GET', '/v1/me/addresses', { sid })).body.items;
    expect(all.map((a: any) => [a.city, a.isDefault])).toEqual([['Pune', true], ['Mumbai', false]]);
    await call(app, 'DELETE', `/v1/me/addresses/${added.body.address.id}`, { sid });
    all = (await call(app, 'GET', '/v1/me/addresses', { sid })).body.items;
    expect(all.map((a: any) => [a.city, a.isDefault])).toEqual([['Mumbai', true]]);

    const updated = await call(app, 'PATCH', '/v1/me', { sid, body: { name: 'Priya S', email: 'priya@example.com' } });
    expect(updated.body.me).toMatchObject({ name: 'Priya S', email: 'priya@example.com' });
  });
});

describe('GST invoices', () => {
  it('numbers invoices in sequence, splits the tax by state and keeps one invoice per order', async () => {
    const { sid, phone } = await login();
    const kit = await variant('poppy');
    const tote = await variant('tote');
    const local = await place(app, sid, phone, [{ variantId: kit.id, qty: 1 }, { variantId: tote.id, qty: 1, personalisation: { text: 'Mira', font: 'script', thread: 'rani' } }], { payment: 'upi' });
    await call(app, 'POST', `/v1/orders/${local.body.order.number}/fake-payment`, { sid, body: { ok: true } });
    const away = await call(app, 'POST', '/v1/orders', {
      sid,
      body: { items: [{ variantId: kit.id, qty: 1 }], shipping: 'express', payment: 'cod', details: { ...details(phone), pincode: '560001', city: 'Bengaluru', state: 'Karnataka' }, clientKey: `inv-${Date.now()}` },
    });
    const a = await db.order.findUniqueOrThrow({ where: { number: local.body.order.number } });
    const b = await db.order.findUniqueOrThrow({ where: { number: away.body.order.number } });
    const i1 = await app.invoices.issue(a.id);
    const i2 = await app.invoices.issue(b.id);
    expect(i1.number).toMatch(/^TK\/\d{4}-\d{2}\/\d{4}$/);
    expect(i2.seq).toBe(i1.seq + 1);
    expect((await app.invoices.issue(a.id)).id).toBe(i1.id);

    const s1 = i1.snapshot as any;
    expect(s1.interState).toBe(false);
    expect(s1.totals.totalPaise).toBe(a.totalPaise);
    expect(s1.totals.cgstPaise).toBeGreaterThan(0);
    expect(s1.lines.map((l: any) => l.rateBp)).toEqual([500, 1800]);
    const s2 = i2.snapshot as any;
    expect(s2).toMatchObject({ interState: true, placeOfSupply: 'Karnataka (29)' });
    expect(s2.totals).toMatchObject({ cgstPaise: 0, sgstPaise: 0, totalPaise: b.totalPaise });

    const pdf = await app.invoices.pdf(i1);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    fs.writeFileSync(path.join(tmp, '..', `${path.basename(tmp)}-invoice.pdf`), pdf);
    // the shopper sees a signed link to it
    const mine = await call(app, 'GET', `/v1/me/orders/${a.number}`, { sid });
    expect(mine.body.order.invoice.number).toBe(i1.number);
    const file = await app.inject({ method: 'GET', url: mine.body.order.invoice.url });
    expect(file.headers['content-type']).toBe('application/pdf');
  });
});
