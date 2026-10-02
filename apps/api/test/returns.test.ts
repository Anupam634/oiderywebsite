import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { hashPassword } from '../src/lib/crypto.ts';
import { createPrisma, type Db } from '../src/lib/prisma.ts';

/* Returns and exchanges, end to end: the shopper asks from a delivered order, the studio approves, receives
   the piece and sends a new size or refunds (online, or by UPI for cash orders). Uses the knit jacket and the
   tulip cushion (other tests only count their stock by difference). */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-returns-'));
let app: Awaited<ReturnType<typeof buildApp>>;
let db: Db;
let owner: { asid: string };
let staff: { asid: string };
const OWNER = { email: 'owner@returns.test', password: 'owner-pass-123' };
const STAFF = { email: 'staff@returns.test', password: 'staff-pass-123' };

beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: 'test', DATABASE_URL: inject('databaseUrl'), LOG_LEVEL: 'silent', OTP_DEV_CODE: '864201',
    OUTBOX_DIR: path.join(tmp, 'outbox'), UPLOAD_DIR: path.join(tmp, 'uploads'), OWNER_EMAIL: 'owner@returns.test',
  });
  db = createPrisma(config.DATABASE_URL);
  app = await buildApp({ config, db });
  for (const [u, role] of [[OWNER, 'OWNER'], [STAFF, 'STAFF']] as const)
    await db.adminUser.upsert({ where: { email: u.email }, create: { email: u.email, name: role, role, passwordHash: await hashPassword(u.password) }, update: { failedLogins: 0, lockedUntil: null, active: true } });
  owner = await adminLogin(OWNER);
  staff = await adminLogin(STAFF);
});
afterAll(async () => {
  // the login-code limit per network counts codes in the shared database: give this file's back
  await db.otpChallenge.deleteMany({ where: { phone: { in: phones } } });
  await app.close();
  await db.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

type Opts = { cookies?: Record<string, string>; body?: object };
const call = async (method: 'GET' | 'POST', url: string, o: Opts = {}) => {
  const r = await app.inject({ method, url, ...(o.body ? { payload: o.body } : {}), ...(o.cookies ? { cookies: o.cookies } : {}) });
  return { status: r.statusCode, body: r.body ? (r.json() as any) : null };
};
async function adminLogin(u: { email: string; password: string }) {
  const r = await app.inject({ method: 'POST', url: '/v1/admin/login', payload: u });
  expect(r.statusCode).toBe(200);
  return { asid: r.cookies.find((c) => c.name === 'asid')!.value };
}
let seq = 0;
const phones: string[] = [];
let regular: Awaited<ReturnType<typeof newShopper>> | undefined;
/** one shopper for the whole file (each test uses its own orders) */
const shopper = async () => (regular ??= await newShopper());
async function newShopper() {
  const phone = `91${String(Date.now() % 1e6).padStart(6, '0')}${String(++seq).padStart(2, '0')}`;
  phones.push(phone);
  await call('POST', '/v1/auth/otp', { body: { phone } });
  const r = await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: { phone, code: '864201' } });
  return { phone, sid: { sid: r.cookies.find((c) => c.name === 'sid')!.value } };
}
const variant = async (code: string, size: string) => (await db.productVariant.findFirst({ where: { product: { code }, size } }))!;
const stock = async (id: string) => (await db.productVariant.findUnique({ where: { id } }))!.stock;
const details = (phone: string) => ({ phone, email: 'buyer@example.com', whatsappUpdates: true, pincode: '560001', name: 'Meera Iyer', line1: '7 Church Street', line2: 'Ashok Nagar', landmark: '', city: 'Bengaluru', state: 'Karnataka', addressType: 'home', gst: null, giftNote: null });

/** a delivered order: placed, (paid,) shipped and delivered through the API */
async function deliveredOrder(s: { phone: string; sid: Record<string, string> }, items: object[], payment: 'cod' | 'upi' = 'cod') {
  const r = await call('POST', '/v1/orders', { cookies: s.sid, body: { items, shipping: 'standard', payment, details: details(s.phone), clientKey: `ret-${Date.now()}-${++seq}` } });
  expect(r.status).toBe(201);
  const n = r.body.order.number as string;
  if (payment !== 'cod') expect((await call('POST', `/v1/orders/${n}/fake-payment`, { cookies: s.sid, body: { ok: true } })).status).toBe(200);
  // force: personalised pieces skip the proof step here (the admin tests cover proofs)
  expect((await call('POST', `/v1/admin/orders/${n}/status`, { cookies: owner, body: { to: 'SHIPPED', courier: 'shiprocket', awb: `SR${seq}${Date.now() % 1e5}`, force: true } })).status).toBe(200);
  expect((await call('POST', `/v1/admin/orders/${n}/status`, { cookies: owner, body: { to: 'DELIVERED' } })).status).toBe(200);
  return n;
}
const myOrder = async (sid: Record<string, string>, n: string) => (await call('GET', `/v1/me/orders/${n}`, { cookies: sid })).body.order;
const outbox = () => fs.readdirSync(path.join(tmp, 'outbox'));

async function uploadPhoto(sid: Record<string, string>) {
  const jpg = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#C0392B' } }).jpeg().toBuffer();
  const b = `----ret${Date.now()}`;
  const payload = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nreturn\r\n`),
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="tear.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    jpg,
    Buffer.from(`\r\n--${b}--\r\n`),
  ]);
  const r = await app.inject({ method: 'POST', url: '/v1/uploads', payload, headers: { 'content-type': `multipart/form-data; boundary=${b}` }, cookies: sid });
  expect(r.statusCode).toBe(201);
  return (r.json() as { id: string }).id;
}

describe('exchanges', () => {
  it('swaps a delivered jacket for another size, setting the new size aside and restocking the old one', async () => {
    const s = await shopper();
    const m = await variant('knit', 'M');
    const l = await variant('knit', 'L');
    const n = await deliveredOrder(s, [{ variantId: m.id, qty: 1 }]);
    const o = await myOrder(s.sid, n);
    expect(o.returnOptions).toMatchObject({ open: true, windowDays: 7, allowRefund: true, allowExchange: true, cod: true });
    const opt = o.returnOptions.items[0];
    expect(opt).toMatchObject({ qty: 1, custom: false });
    expect(opt.exchange.map((e: any) => e.label)).toEqual(expect.arrayContaining(['Size M', 'Size L']));
    expect(opt.exchange.find((e: any) => e.label === 'Size M').current).toBe(true);

    // a size must be chosen
    const noSize = await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'EXCHANGE', reason: 'WRONG_SIZE', items: [{ orderItemId: opt.orderItemId, qty: 1 }] } });
    expect(noSize.body.error.code).toBe('pick_size');
    const r = await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'EXCHANGE', reason: 'WRONG_SIZE', details: 'Too snug on the shoulders', items: [{ orderItemId: opt.orderItemId, qty: 1, exchangeVariantId: l.id }] } });
    expect(r.status).toBe(201);
    expect(r.body.request).toMatch(/^RT-[A-Z0-9]{6}$/);
    expect(r.body.order.returns[0]).toMatchObject({ status: 'REQUESTED', kind: 'EXCHANGE', reason: 'WRONG_SIZE', canCancel: true, items: [{ qty: 1, exchangeLabel: 'Size L' }] });
    // nothing left to send back now
    expect(r.body.order.returnOptions.open).toBe(false);
    expect((await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'EXCHANGE', reason: 'WRONG_SIZE', items: [{ orderItemId: opt.orderItemId, qty: 1, exchangeVariantId: l.id }] } })).body.error.code).toBe('nothing_left');
    expect(outbox().some((f) => f.includes('whatsapp-return-requested'))).toBe(true);
    expect(outbox().some((f) => f.includes('Return-request'))).toBe(true);

    // the studio's queue
    const rn = r.body.request;
    const queue = await call('GET', '/v1/admin/returns?status=open', { cookies: staff });
    expect(queue.body.items.find((x: any) => x.number === rn)).toMatchObject({ orderNumber: n, kind: 'EXCHANGE', status: 'REQUESTED', pieces: 1 });
    expect((await call('GET', '/v1/admin/dashboard', { cookies: staff })).body.todo.returnsToReview).toBeGreaterThan(0);

    const lBefore = await stock(l.id);
    const mBefore = await stock(m.id);
    const ok = await call('POST', `/v1/admin/returns/${rn}/approve`, { cookies: staff, body: { pickupCourier: 'Delhivery', pickupAwb: 'DLV55501' } });
    expect(ok.body.return).toMatchObject({ status: 'APPROVED', pickup: { courier: 'Delhivery', awb: 'DLV55501' }, studioNote: expect.stringContaining('pickup') });
    expect(await stock(l.id)).toBe(lBefore - 1);
    expect(outbox().some((f) => f.includes('whatsapp-return-approved'))).toBe(true);

    const got = await call('POST', `/v1/admin/returns/${rn}/receive`, { cookies: staff, body: { restock: true } });
    expect(got.body.return).toMatchObject({ status: 'RECEIVED', restocked: true });
    expect(await stock(m.id)).toBe(mBefore + 1);

    const sent = await call('POST', `/v1/admin/returns/${rn}/exchange`, { cookies: staff, body: { courier: 'Delhivery', awb: 'DLV55502' } });
    expect(sent.body.return).toMatchObject({ status: 'EXCHANGED', replacement: { courier: 'Delhivery', awb: 'DLV55502' } });
    expect(await stock(l.id)).toBe(lBefore - 1); // the set-aside size left with the courier
    expect(outbox().some((f) => f.includes('whatsapp-exchange-shipped'))).toBe(true);
    const mine = await myOrder(s.sid, n);
    expect(mine.returns[0]).toMatchObject({ status: 'EXCHANGED', canCancel: false });
    expect(mine.events.map((e: any) => e.type)).toEqual(expect.arrayContaining(['return_requested', 'return_approved', 'return_received', 'return_exchanged']));
  });

  it('gives the set-aside size back when a request is declined, and lets the shopper withdraw', async () => {
    const s = await shopper();
    const m = await variant('knit', 'S');
    const xl = await variant('knit', 'XL');
    const n = await deliveredOrder(s, [{ variantId: m.id, qty: 1 }]);
    const item = (await myOrder(s.sid, n)).returnOptions.items[0];

    const first = await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'EXCHANGE', reason: 'WRONG_SIZE', items: [{ orderItemId: item.orderItemId, qty: 1, exchangeVariantId: xl.id }] } });
    const w = await call('POST', `/v1/me/returns/${first.body.request}/cancel`, { cookies: s.sid });
    expect(w.body.order.returns[0]).toMatchObject({ status: 'CANCELLED' });
    expect(w.body.order.returnOptions.open).toBe(true);

    const before = await stock(xl.id);
    const second = await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'EXCHANGE', reason: 'WRONG_SIZE', items: [{ orderItemId: item.orderItemId, qty: 1, exchangeVariantId: xl.id }] } });
    const rn = second.body.request;
    await call('POST', `/v1/admin/returns/${rn}/approve`, { cookies: staff, body: {} });
    expect(await stock(xl.id)).toBe(before - 1);
    // once approved the shopper can't withdraw it themselves
    expect((await call('POST', `/v1/me/returns/${rn}/cancel`, { cookies: s.sid })).body.error.code).toBe('cannot_withdraw');
    expect((await call('POST', `/v1/admin/returns/${rn}/reject`, { cookies: staff, body: { reason: 'x' } })).status).toBe(400);
    const no = await call('POST', `/v1/admin/returns/${rn}/reject`, { cookies: staff, body: { reason: 'The tags were removed and it has been worn' } });
    expect(no.body.return).toMatchObject({ status: 'REJECTED', studioNote: 'The tags were removed and it has been worn' });
    expect(await stock(xl.id)).toBe(before);
    expect(outbox().some((f) => f.includes('whatsapp-return-rejected'))).toBe(true);
    // someone else's request is invisible
    const other = await newShopper();
    expect((await call('POST', `/v1/me/returns/${rn}/cancel`, { cookies: other.sid })).status).toBe(404);
  });
});

describe('refunds', () => {
  it('refunds a damaged piece paid online, after a photo and the studio’s check', async () => {
    const s = await shopper();
    const v = await variant('tulip', '16 × 16"');
    const n = await deliveredOrder(s, [{ variantId: v.id, qty: 2 }], 'upi');
    const o = await myOrder(s.sid, n);
    const item = o.returnOptions.items[0];
    expect(o.returnOptions.cod).toBe(false);
    // the order's offers (buy-2 discount, UPI discount) are shared across the pieces
    expect(o.discountPaise + o.upiDiscountPaise).toBeGreaterThan(0);
    expect(item.unitRefundPaise).toBe(Math.floor((2 * 139_900 - o.discountPaise - o.upiDiscountPaise) / 2));

    const noPhoto = await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'REFUND', reason: 'DAMAGED', items: [{ orderItemId: item.orderItemId, qty: 1 }] } });
    expect(noPhoto.body.error.code).toBe('photo_needed');
    const photo = await uploadPhoto(s.sid);
    const r = await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'REFUND', reason: 'DAMAGED', details: 'A thread came loose', items: [{ orderItemId: item.orderItemId, qty: 1 }], photos: [photo] } });
    expect(r.status).toBe(201);
    expect(r.body.order.returns[0].photos).toHaveLength(1);
    expect(r.body.order.returnOptions.items[0].qty).toBe(1); // the other cushion can still go back

    const rn = r.body.request;
    await call('POST', `/v1/admin/returns/${rn}/approve`, { cookies: staff, body: {} });
    // refunds are for the owner
    expect((await call('POST', `/v1/admin/returns/${rn}/refund`, { cookies: staff, body: { amountPaise: 1000, method: 'GATEWAY' } })).status).toBe(403);
    await call('POST', `/v1/admin/returns/${rn}/receive`, { cookies: staff, body: { restock: false } });
    const d = (await call('GET', `/v1/admin/returns/${rn}`, { cookies: owner })).body.return;
    expect(d).toMatchObject({ paidOnline: true, suggestedRefundPaise: item.unitRefundPaise, restocked: false });
    const done = await call('POST', `/v1/admin/returns/${rn}/refund`, { cookies: owner, body: { amountPaise: d.suggestedRefundPaise, method: 'GATEWAY' } });
    expect(done.body.return).toMatchObject({ status: 'REFUNDED', refundPaise: item.unitRefundPaise });
    const after = await myOrder(s.sid, n);
    expect(after).toMatchObject({ paymentState: 'PARTIALLY_REFUNDED', refundedPaise: item.unitRefundPaise });
    const rows = await db.refund.findMany({ where: { order: { number: n } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.returnId).toBeTruthy();
    expect(outbox().some((f) => f.includes('whatsapp-refund-processed'))).toBe(true);
  });

  it('refunds a cash order to the shopper’s UPI ID, recorded with the transfer reference', async () => {
    const s = await shopper();
    const v = await variant('tulip', '18 × 18"');
    const n = await deliveredOrder(s, [{ variantId: v.id, qty: 1 }]);
    const item = (await myOrder(s.sid, n)).returnOptions.items[0];
    const noUpi = await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'REFUND', reason: 'CHANGED_MIND', items: [{ orderItemId: item.orderItemId, qty: 1 }] } });
    expect(noUpi.body.error.code).toBe('upi_needed');
    expect((await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'REFUND', reason: 'CHANGED_MIND', refundUpi: 'not a upi', items: [{ orderItemId: item.orderItemId, qty: 1 }] } })).status).toBe(400);
    const r = await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'REFUND', reason: 'CHANGED_MIND', refundUpi: 'meera.iyer@okhdfc', items: [{ orderItemId: item.orderItemId, qty: 1 }] } });
    const rn = r.body.request;
    await call('POST', `/v1/admin/returns/${rn}/approve`, { cookies: staff, body: {} });
    await call('POST', `/v1/admin/returns/${rn}/receive`, { cookies: staff, body: { restock: true } });
    const d = (await call('GET', `/v1/admin/returns/${rn}`, { cookies: owner })).body.return;
    expect(d).toMatchObject({ paidOnline: false, refundUpi: 'meera.iyer@okhdfc' });
    // no online payment to refund through
    expect((await call('POST', `/v1/admin/returns/${rn}/refund`, { cookies: owner, body: { amountPaise: d.suggestedRefundPaise, method: 'GATEWAY' } })).body.error.code).toBe('not_paid_online');
    expect((await call('POST', `/v1/admin/returns/${rn}/refund`, { cookies: owner, body: { amountPaise: d.suggestedRefundPaise, method: 'MANUAL' } })).body.error.code).toBe('reference_needed');
    expect((await call('POST', `/v1/admin/returns/${rn}/refund`, { cookies: owner, body: { amountPaise: 99_999_999, method: 'MANUAL', reference: 'UTR123' } })).body.error.code).toBe('bad_amount');
    const done = await call('POST', `/v1/admin/returns/${rn}/refund`, { cookies: owner, body: { amountPaise: d.suggestedRefundPaise, method: 'MANUAL', reference: 'UTR4455667788' } });
    expect(done.body.return).toMatchObject({ status: 'REFUNDED', refundReference: 'UTR4455667788' });
    const after = await myOrder(s.sid, n);
    expect(after.refundedPaise).toBe(d.suggestedRefundPaise);
    expect(after.events.some((e: any) => e.message.includes('meera.iyer@okhdfc'))).toBe(true);
  });
});

describe('the rules', () => {
  it('opens after delivery, for the return window, and not for made-for-you pieces that are fine', async () => {
    const s = await shopper();
    const v = await variant('knit', 'XL');
    // not delivered yet
    const r = await call('POST', '/v1/orders', { cookies: s.sid, body: { items: [{ variantId: v.id, qty: 1 }], shipping: 'standard', payment: 'cod', details: details(s.phone), clientKey: `ret-nd-${Date.now()}` } });
    const pending = r.body.order.number;
    expect((await myOrder(s.sid, pending)).returnOptions).toBeNull();
    expect((await call('POST', `/v1/me/orders/${pending}/returns`, { cookies: s.sid, body: { kind: 'REFUND', reason: 'CHANGED_MIND', refundUpi: 'a.b@okicici', items: [{ orderItemId: 'x', qty: 1 }] } })).body.error.code).toBe('not_returnable');

    // a personalised name T-shirt only comes back if something is wrong with it
    const tee = (await db.productVariant.findFirst({ where: { product: { code: 'nametee' }, size: 'M' } }))!;
    const n = await deliveredOrder(s, [{ variantId: tee.id, qty: 1, personalisation: { text: 'Kabir', font: 'script', thread: 'rani' } }], 'upi');
    const item = (await myOrder(s.sid, n)).returnOptions.items[0];
    expect(item.custom).toBe(true);
    const fit = await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'REFUND', reason: 'WRONG_SIZE', refundUpi: 'a.b@okicici', items: [{ orderItemId: item.orderItemId, qty: 1 }] } });
    expect(fit.body.error.code).toBe('custom_piece');
    const photo = await uploadPhoto(s.sid);
    const remake = await call('POST', `/v1/me/orders/${n}/returns`, { cookies: s.sid, body: { kind: 'EXCHANGE', reason: 'DAMAGED', photos: [photo], items: [{ orderItemId: item.orderItemId, qty: 1 }] } });
    expect(remake.status).toBe(201);
    expect(remake.body.order.returns[0].items[0].exchangeLabel).toBe('Remade for you');

    // past the window
    const late = await deliveredOrder(s, [{ variantId: v.id, qty: 1 }]);
    await db.order.update({ where: { number: late }, data: { deliveredAt: new Date(Date.now() - 8 * 86_400_000) } });
    const lo = await myOrder(s.sid, late);
    expect(lo.returnOptions.open).toBe(false);
    expect((await call('POST', `/v1/me/orders/${late}/returns`, { cookies: s.sid, body: { kind: 'REFUND', reason: 'CHANGED_MIND', refundUpi: 'a.b@okicici', items: [{ orderItemId: lo.returnOptions.items[0].orderItemId, qty: 1 }] } })).body.error.code).toBe('window_closed');
  });
});
