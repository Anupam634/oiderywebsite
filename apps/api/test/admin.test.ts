import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { isValidGstin } from '@store/shared';
import { hashPassword } from '../src/lib/crypto.ts';
import { createPrisma, type Db } from '../src/lib/prisma.ts';

/* The studio admin, end to end: staff login, proofs, shipping, delivery, reviews, products, coupons. */

const require = createRequire(import.meta.url);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-admin-'));
let app: Awaited<ReturnType<typeof buildApp>>;
let db: Db;
// one session per role for the whole file (staff logins are rate limited per network)
let ownerCookie: { asid: string };
let staffCookie: { asid: string };
const OWNER = { email: 'owner@studio.test', password: 'owner-pass-123' };
const STAFF = { email: 'staff@studio.test', password: 'staff-pass-123' };

beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: 'test', OTP_IP_LIMIT_PER_HOUR: '1000', DATABASE_URL: inject('databaseUrl'), LOG_LEVEL: 'silent', OTP_DEV_CODE: '135790',
    OUTBOX_DIR: path.join(tmp, 'outbox'), UPLOAD_DIR: path.join(tmp, 'uploads'), OWNER_EMAIL: 'owner@studio.test',
  });
  db = createPrisma(config.DATABASE_URL);
  app = await buildApp({ config, db });
  for (const [u, role] of [[OWNER, 'OWNER'], [STAFF, 'STAFF']] as const)
    await db.adminUser.upsert({ where: { email: u.email }, create: { email: u.email, name: role === 'OWNER' ? 'Owner' : 'Staff', role, passwordHash: await hashPassword(u.password) }, update: { failedLogins: 0, lockedUntil: null, active: true } });
  ownerCookie = await adminLogin(OWNER);
  staffCookie = await adminLogin(STAFF);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

type Opts = { cookies?: Record<string, string>; body?: object; payload?: Buffer; headers?: Record<string, string> };
const call = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, o: Opts = {}) => {
  const r = await app.inject({ method, url, ...(o.body ? { payload: o.body } : o.payload ? { payload: o.payload } : {}), headers: o.headers ?? {}, ...(o.cookies ? { cookies: o.cookies } : {}) });
  return { status: r.statusCode, body: r.body ? (r.json() as any) : null, cookies: r.cookies, headers: r.headers };
};
const adminLogin = async (u: { email: string; password: string }) => {
  const r = await call('POST', '/v1/admin/login', { body: u });
  expect(r.status).toBe(200);
  return { asid: r.cookies.find((c) => c.name === 'asid')!.value };
};
let seq = 0;
const customer = async () => {
  const phone = `93${String(Date.now() % 1e6).padStart(6, '0')}${String(++seq).padStart(2, '0')}`;
  await call('POST', '/v1/auth/otp', { body: { phone } });
  const r = await call('POST', '/v1/auth/verify', { body: { phone, code: '135790' } });
  return { phone, sid: r.cookies.find((c) => c.name === 'sid')!.value };
};
const variant = async (code: string, where: object = {}) => (await db.productVariant.findFirst({ where: { product: { code }, ...where }, orderBy: { sortOrder: 'asc' } }))!;
const details = (phone: string) => ({ phone, email: 'buyer@example.com', whatsappUpdates: true, pincode: '411001', name: 'Asha Rao', line1: '12 MG Road', line2: 'Camp', landmark: '', city: 'Pune', state: 'Maharashtra', addressType: 'home', gst: null, giftNote: null });
const multipart = (fields: Record<string, string>, file: { name: string; type: string; data: Buffer }) => {
  const b = `----admin${Date.now()}`;
  return {
    payload: Buffer.concat([
      ...Object.entries(fields).map(([k, v]) => Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)),
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`),
      file.data,
      Buffer.from(`\r\n--${b}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${b}` },
  };
};
const png = (w: number, h: number, colour = '#E4007C') => sharp({ create: { width: w, height: h, channels: 3, background: colour } }).png().toBuffer();

describe('staff login', () => {
  it('locks after repeated wrong passwords and keeps shoppers out', async () => {
    const lockme = { email: 'lock@studio.test', password: 'right-password-1' };
    await db.adminUser.create({ data: { email: lockme.email, name: 'Lock', passwordHash: await hashPassword(lockme.password) } });
    for (let i = 0; i < 5; i++) expect((await call('POST', '/v1/admin/login', { body: { ...lockme, password: 'wrong-password' } })).status).toBe(401);
    const locked = await call('POST', '/v1/admin/login', { body: lockme });
    expect(locked.status).toBe(423);

    expect((await call('GET', '/v1/admin/me', { cookies: ownerCookie })).body.me).toMatchObject({ email: OWNER.email, role: 'OWNER' });
    const shopper = await customer();
    expect((await call('GET', '/v1/admin/orders', { cookies: { sid: shopper.sid } })).status).toBe(401);
    const staff = staffCookie;
    expect((await call('GET', '/v1/admin/users', { cookies: staff })).status).toBe(403);
    expect((await call('GET', '/v1/admin/orders', { cookies: staff })).status).toBe(200);
  });

  it('lets the owner add staff with a one-time password', async () => {
    const owner = ownerCookie;
    const r = await call('POST', '/v1/admin/users', { cookies: owner, body: { email: 'new@studio.test', name: 'New Person' } });
    expect(r.status).toBe(201);
    expect(r.body.password).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await adminLogin({ email: 'new@studio.test', password: r.body.password });
  });
});

describe('proof → stitch → ship → deliver', () => {
  it('runs a personalised order through the studio', async () => {
    const owner = ownerCookie;
    const shopper = await customer();
    const tee = await variant('nametee', { size: 'L' });
    const kit = await variant('poppy');
    const placed = await call('POST', '/v1/orders', {
      cookies: { sid: shopper.sid },
      body: {
        items: [{ variantId: tee.id, qty: 1, personalisation: { text: 'Asha', font: 'classic', thread: 'neel' } }, { variantId: kit.id, qty: 1 }],
        shipping: 'standard', payment: 'upi', details: details(shopper.phone), clientKey: `admin-${Date.now()}`,
      },
    });
    const number = placed.body.order.number;
    await call('POST', `/v1/orders/${number}/fake-payment`, { cookies: { sid: shopper.sid }, body: { ok: true } });

    const list = await call('GET', '/v1/admin/orders?proofs=toMake', { cookies: owner });
    const row = list.body.items.find((o: any) => o.number === number);
    expect(row).toMatchObject({ status: 'PLACED', paymentState: 'PAID', proofs: { toMake: 1, sent: 0, changes: 0 }, city: 'Pune' });

    let d = (await call('GET', `/v1/admin/orders/${number}`, { cookies: owner })).body.order;
    expect(d.next).toEqual(['IN_PRODUCTION', 'SHIPPED']);
    const teeItem = d.items.find((i: any) => i.sku === tee.sku);
    expect(teeItem.personalisation).toEqual({ text: 'Asha', font: 'classic', thread: 'neel' });
    expect(teeItem.description).toContain('“Asha” in Classic, Neel thread');

    // can't ship before the proof is approved
    const early = await call('POST', `/v1/admin/orders/${number}/status`, { cookies: owner, body: { to: 'SHIPPED', courier: 'shiprocket', awb: 'SR123' } });
    expect(early.body.error.code).toBe('proofs_pending');

    // proof v1 → changes requested → proof v2 → approved
    const send = async (colour: string, note: string) => {
      const m = multipart({ note }, { name: 'proof.png', type: 'image/png', data: await png(900, 1100, colour) });
      const r = await app.inject({ method: 'POST', url: `/v1/admin/items/${teeItem.id}/proofs`, payload: m.payload, headers: m.headers, cookies: owner });
      expect(r.statusCode).toBe(200);
      return (r.json() as any).order.items.find((i: any) => i.id === teeItem.id).proofs[0]; // newest first
    };
    const v1 = await send('#3D2BD6', 'Classic font, neel thread, 7 cm wide');
    expect(v1).toMatchObject({ version: 1, status: 'SENT' });
    const box = fs.readdirSync(path.join(tmp, 'outbox'));
    expect(box.some((x) => x.includes('whatsapp-stitch-proof-ready'))).toBe(true);
    const view = await call('GET', `/v1/proofs/${v1.token}`);
    expect(view.body).toMatchObject({ orderNumber: number, firstName: 'Asha', latest: true, proof: { version: 1, status: 'SENT', note: 'Classic font, neel thread, 7 cm wide' } });
    expect((await app.inject({ method: 'GET', url: view.body.proof.imageUrl })).headers['content-type']).toBe('image/jpeg');
    expect((await call('POST', `/v1/proofs/${v1.token}/changes`, { body: { comment: '' } })).status).toBe(400);
    const changed = await call('POST', `/v1/proofs/${v1.token}/changes`, { body: { comment: 'Please make the name a little bigger' } });
    expect(changed.body.proof).toMatchObject({ status: 'CHANGES_REQUESTED', customerComment: 'Please make the name a little bigger' });

    const v2 = await send('#E4007C', 'Bigger name, 9 cm');
    expect(v2.version).toBe(2);
    expect((await call('POST', `/v1/proofs/${v1.token}/approve`)).body.error.code).toBe('proof_answered');
    const ok = await call('POST', `/v1/proofs/${v2.token}/approve`);
    expect(ok.body.proof.status).toBe('APPROVED');
    d = (await call('GET', `/v1/admin/orders/${number}`, { cookies: owner })).body.order;
    expect(d.status).toBe('IN_PRODUCTION');
    expect(d.items.find((i: any) => i.id === teeItem.id).proofs.map((p: any) => p.status)).toEqual(['APPROVED', 'CHANGES_REQUESTED']);

    // ship: tracking link from the courier, invoice issued and emailed
    const shipped = await call('POST', `/v1/admin/orders/${number}/status`, { cookies: owner, body: { to: 'SHIPPED', courier: 'shiprocket', awb: 'SR778899' } });
    expect(shipped.body.order).toMatchObject({ status: 'SHIPPED', tracking: { courier: 'Shiprocket', awb: 'SR778899', url: 'https://shiprocket.co/tracking/SR778899' } });
    expect(shipped.body.order.invoice.number).toMatch(/^TK\//);
    await new Promise((r) => setTimeout(r, 300));
    expect(fs.readdirSync(path.join(tmp, 'outbox')).some((x) => x.includes('email-Invoice'))).toBe(true);

    // delivered; the shopper reviews the kit, the studio publishes it
    await call('POST', `/v1/admin/orders/${number}/status`, { cookies: owner, body: { to: 'DELIVERED' } });
    const mine = (await call('GET', `/v1/me/orders/${number}`, { cookies: { sid: shopper.sid } })).body.order;
    expect(mine.status).toBe('DELIVERED');
    const kitItem = mine.items.find((i: any) => i.productSlug === 'poppy-field-diy-kit');
    expect(kitItem.canReview).toBe(true);
    expect((await call('POST', '/v1/me/reviews', { cookies: { sid: shopper.sid }, body: { itemId: kitItem.id, rating: 5, body: 'Lovely kit, the threads are so bright!' } })).status).toBe(201);
    expect((await call('POST', '/v1/me/reviews', { cookies: { sid: shopper.sid }, body: { itemId: kitItem.id, rating: 4, body: 'Second try at a review' } })).body.error.code).toBe('already_reviewed');
    const pending = await call('GET', '/v1/admin/reviews?status=PENDING', { cookies: owner });
    const review = pending.body.items.find((r: any) => r.body.startsWith('Lovely kit'));
    expect(review).toMatchObject({ authorName: 'Asha Rao', city: 'Pune', rating: 5, isSample: false });
    expect((await call('PATCH', `/v1/admin/reviews/${review.id}`, { cookies: owner, body: { status: 'PUBLISHED' } })).status).toBe(200);
    const published = await db.review.count({ where: { product: { code: 'poppy' }, status: 'PUBLISHED' } });
    expect((await db.product.findUnique({ where: { code: 'poppy' } }))!.ratingCount).toBe(published);
  });

  it('refunds part of a paid order (owner only) and blocks cash on delivery for a customer', async () => {
    const owner = ownerCookie;
    const staff = staffCookie;
    const shopper = await customer();
    const kit = await variant('poppy');
    const placed = await call('POST', '/v1/orders', { cookies: { sid: shopper.sid }, body: { items: [{ variantId: kit.id, qty: 2 }], shipping: 'standard', payment: 'card', details: details(shopper.phone), clientKey: `refund-${Date.now()}` } });
    const number = placed.body.order.number;
    await call('POST', `/v1/orders/${number}/fake-payment`, { cookies: { sid: shopper.sid }, body: { ok: true } });
    expect((await call('POST', `/v1/admin/orders/${number}/refund`, { cookies: staff, body: { amountPaise: 10_000, reason: 'One kit damaged' } })).status).toBe(403);
    const r = await call('POST', `/v1/admin/orders/${number}/refund`, { cookies: owner, body: { amountPaise: 10_000, reason: 'One kit damaged' } });
    expect(r.body.order).toMatchObject({ paymentState: 'PARTIALLY_REFUNDED', refundedPaise: 10_000 });
    expect(r.body.order.refunds).toHaveLength(1);

    const c = await db.customer.findUniqueOrThrow({ where: { phone: shopper.phone } });
    await call('PATCH', `/v1/admin/customers/${c.id}`, { cookies: owner, body: { codBlocked: true, notes: 'Refused two COD parcels' } });
    const cod = await call('POST', '/v1/orders', { cookies: { sid: shopper.sid }, body: { items: [{ variantId: kit.id, qty: 1 }], shipping: 'standard', payment: 'cod', details: details(shopper.phone), clientKey: `cod-${Date.now()}` } });
    expect(cod.body.error.code).toBe('cod_blocked');
    const detail = await call('GET', `/v1/admin/customers/${c.id}`, { cookies: staff });
    expect(detail.body.customer).toMatchObject({ codBlocked: true, notes: 'Refused two COD parcels' });
    expect(detail.body.orders.map((o: any) => o.number)).toContain(number);
  });
});

describe('catalogue admin', () => {
  it('creates a product with variants and photos, then publishes it', async () => {
    const owner = ownerCookie;
    const cat = await db.category.findUniqueOrThrow({ where: { slug: 'cushions' } });
    const created = await call('POST', '/v1/admin/products', { cookies: owner, body: { name: 'Neel Bagh Cushion Cover', categoryId: cat.id, type: 'READY', pricePaise: 159_900 } });
    expect(created.status).toBe(201);
    const p = created.body.product;
    expect(p).toMatchObject({ status: 'DRAFT', slug: 'neel-bagh-cushion-cover', code: 'neelbaghcushio' });
    expect((await call('GET', `/v1/products/${p.slug}`)).status).toBe(404);

    const patched = await call('PATCH', `/v1/admin/products/${p.id}`, {
      cookies: owner,
      body: {
        techLine: 'Chain stitch on cotton slub', story: 'A garden of indigo flowers.', mrpPaise: 189_900, colourFamily: 'blue', occasions: ['housewarming'],
        hsnCode: '6304', gstRule: 'threshold', gstRateBp: 500,
        details: { why: [{ title: 'Soft', text: 'Washed cotton slub' }], spec: [{ label: 'Size', value: '16 × 16 in' }], care: ['Hand wash'], faq: [] },
      },
    });
    expect(patched.body.product).toMatchObject({ techLine: 'Chain stitch on cotton slub', colourFamily: 'blue', mrpPaise: 189_900 });
    expect((await call('PATCH', `/v1/admin/products/${p.id}`, { cookies: owner, body: { hsnCode: 'abc' } })).status).toBe(400);

    const variants = await call('PUT', `/v1/admin/products/${p.id}/variants`, {
      cookies: owner,
      body: { variants: [
        { sku: 'NEELBAGH-16', colourName: 'Indigo', colourValue: '#2B3A8C', colourHex: '#2B3A8C', size: '16 × 16"', sizeNote: null, priceDeltaPaise: 0, stock: 5, trackStock: true, sortOrder: 0 },
        { sku: 'NEELBAGH-18', colourName: 'Indigo', colourValue: '#2B3A8C', colourHex: '#2B3A8C', size: '18 × 18"', sizeNote: null, priceDeltaPaise: 20_000, stock: 2, trackStock: true, sortOrder: 1 },
      ] },
    });
    expect(variants.body.product.variants.map((v: any) => v.sku)).toEqual(['NEELBAGH-16', 'NEELBAGH-18']);
    const clash = await call('PUT', `/v1/admin/products/${p.id}/variants`, { cookies: owner, body: { variants: [{ sku: 'TULIP-IVORY-16-16', colourName: 'X', colourValue: '#000000', colourHex: '#000000', size: null, sizeNote: null, priceDeltaPaise: 0, stock: 1, trackStock: true, sortOrder: 0 }] } });
    expect(clash.status).toBe(409);

    const m = multipart({ role: 'MAIN', alt: 'Indigo cushion on a cane chair' }, { name: 'cushion.png', type: 'image/png', data: await png(2000, 2500, '#2B3A8C') });
    const img = await app.inject({ method: 'POST', url: `/v1/admin/products/${p.id}/images`, payload: m.payload, headers: m.headers, cookies: owner });
    const image = (img.json() as any).product.images[0];
    expect(image).toMatchObject({ role: 'MAIN', alt: 'Indigo cushion on a cane chair' });
    expect(image.path).toMatch(/^\/v1\/media\/public\/product-image\/.+\.webp$/);
    expect(image.zoomPath).toMatch(/\.webp$/);
    const served = await app.inject({ method: 'GET', url: image.path });
    expect(served.headers['content-type']).toBe('image/webp');
    expect(served.headers['cache-control']).toContain('immutable');
    expect((await sharp(served.rawPayload).metadata()).width).toBe(1280);

    await call('PATCH', `/v1/admin/products/${p.id}`, { cookies: owner, body: { status: 'ACTIVE' } });
    const live = await call('GET', `/v1/products/${p.slug}`);
    expect(live.status).toBe(200);
    expect(live.body).toMatchObject({ name: 'Neel Bagh Cushion Cover', pricePaise: 159_900 });
    expect(live.body.variants).toHaveLength(2);

    // archived products leave the shop (and keep the catalogue tests' counts intact)
    await call('PATCH', `/v1/admin/products/${p.id}`, { cookies: owner, body: { status: 'ARCHIVED' } });
    expect((await call('GET', `/v1/products/${p.slug}`)).status).toBe(404);
  });

  it('manages coupons and categories', async () => {
    const owner = ownerCookie;
    const made = await call('POST', '/v1/admin/coupons', {
      cookies: owner,
      body: { code: 'diwali20', label: '20% off for Diwali', percent: 20, maxDiscountPaise: 50_000, minSubtotalPaise: 149_900, firstOrderOnly: false, maxUses: 100, active: true, startsAt: null, endsAt: '2099-11-15T18:29:59.000Z' },
    });
    expect(made.body.items.find((c: any) => c.code === 'DIWALI20')).toMatchObject({ percent: 20, maxUses: 100, usedCount: 0 });
    expect((await call('GET', '/v1/coupons')).body.items.map((c: any) => c.code)).toContain('DIWALI20');
    await call('PATCH', '/v1/admin/coupons/DIWALI20', { cookies: owner, body: { active: false } });
    expect((await call('GET', '/v1/coupons')).body.items.map((c: any) => c.code)).not.toContain('DIWALI20');
    await call('DELETE', '/v1/admin/coupons/DIWALI20', { cookies: owner });
    expect(await db.coupon.findUnique({ where: { code: 'DIWALI20' } })).toBeNull();

    const home = await db.category.findUniqueOrThrow({ where: { slug: 'home' } });
    const cats = await call('POST', '/v1/admin/categories', { cookies: owner, body: { slug: 'table-linen', name: 'Table linen', blurb: null, image: null, sortOrder: 9, parentId: home.id } });
    const tl = cats.body.items.find((c: any) => c.slug === 'table-linen');
    expect(tl).toMatchObject({ parentId: home.id, productCount: 0 });
    const kurtas = cats.body.items.find((c: any) => c.slug === 'kurtas');
    expect((await call('DELETE', `/v1/admin/categories/${kurtas.id}`, { cookies: owner })).body.error.code).toBe('not_empty');
    expect((await call('DELETE', `/v1/admin/categories/${tl.id}`, { cookies: owner })).status).toBe(200);
  });

  it('shows a dashboard, settings for invoices and the audit trail', async () => {
    const owner = ownerCookie;
    const staff = staffCookie;
    const dash = (await call('GET', '/v1/admin/dashboard', { cookies: staff })).body;
    expect(dash.days).toHaveLength(14);
    expect(dash.month.orders).toBeGreaterThan(0);
    expect(dash.todo).toHaveProperty('proofsToMake');
    const settings = (await call('GET', '/v1/admin/settings', { cookies: staff })).body.settings;
    expect((await call('PUT', '/v1/admin/settings', { cookies: staff, body: settings })).status).toBe(403);
    const saved = await call('PUT', '/v1/admin/settings', { cookies: owner, body: { ...settings, gstin: '27aapfu0939f1zv', city: 'Pune', addressLine1: 'Shop 4, Rangoli Arcade' } });
    expect(saved.body.settings.gstin).toBe('27AAPFU0939F1ZV');
    const trail = (await call('GET', '/v1/admin/audit', { cookies: owner })).body.items.map((a: any) => a.action);
    expect(trail).toEqual(expect.arrayContaining(['settings_saved', 'product_created', 'order_shipped']));
  });
});

describe('machine files (pyembroidery)', () => {
  const python = (() => {
    try {
      require('node:child_process').execFileSync('python3', ['-c', 'import pyembroidery'], { env: { ...process.env, PYTHONPATH: path.resolve('.data/pylib') }, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!python)('turns a digitizer’s DST into a coloured PES with a preview', async () => {
    const owner = ownerCookie;
    // a 2-colour DST, made with pyembroidery
    const dst = path.join(tmp, 'logo.dst');
    require('node:child_process').execFileSync('python3', ['-c', `
import pyembroidery
p = pyembroidery.EmbPattern()
for row, y in enumerate(range(0, 200, 4)):
    for x in (range(0, 301, 30) if row % 2 == 0 else range(300, -1, -30)):
        p.add_stitch_absolute(pyembroidery.STITCH, x, y)
p.add_command(pyembroidery.COLOR_CHANGE)
for i in range(60):
    p.add_stitch_absolute(pyembroidery.STITCH, i * 5, 240 + (40 if i % 2 else 0))
p.end()
pyembroidery.write_dst(p, ${JSON.stringify(dst)})
`], { env: { ...process.env, PYTHONPATH: path.resolve('.data/pylib') } });

    const shopper = await customer();
    const png = await sharp({ create: { width: 300, height: 300, channels: 4, background: '#0F766E' } }).png().toBuffer();
    const m0 = multipart({ kind: 'logo' }, { name: 'logo.png', type: 'image/png', data: png });
    const logo = (await app.inject({ method: 'POST', url: '/v1/uploads', payload: m0.payload, headers: m0.headers })).json() as any;
    const studio = { garment: 'polo', colour: 'kajal', view: 'polo', placement: 'lc', widthCm: 8, stitches: 6100, source: 'upload', label: 'logo.png', sizes: { M: 1 }, threads: [{ hex: '#0F766E', name: 'Mor' }, { hex: '#FFB300', name: 'Haldi' }] };
    const placed = await call('POST', '/v1/orders', { cookies: { sid: shopper.sid }, body: { items: [{ qty: 1, studio, uploads: [logo.id] }], shipping: 'standard', payment: 'upi', details: details(shopper.phone), clientKey: `stitch-${Date.now()}` } });
    const number = placed.body.order.number;
    const itemId = placed.body.order.items[0].id;

    const m = multipart({ label: 'Chai Co logo 8cm' }, { name: 'chai-logo.dst', type: 'application/octet-stream', data: fs.readFileSync(dst) });
    const r = await app.inject({ method: 'POST', url: `/v1/admin/items/${itemId}/stitch-files`, payload: m.payload, headers: m.headers, cookies: owner });
    expect(r.statusCode).toBe(200);
    const f = (r.json() as any).order.items[0].stitchFiles[0];
    expect(f).toMatchObject({ label: 'Chai Co logo 8cm', format: 'dst', stitches: 610, colourChanges: 1, widthMm: 30, heightMm: 28 });
    expect(f.threads).toEqual([{ hex: '#0F766E', name: 'Mor' }, { hex: '#FFB300', name: 'Haldi' }]);
    const pes = await app.inject({ method: 'GET', url: f.pesUrl });
    expect(pes.rawPayload.subarray(0, 8).toString()).toBe('#PES0060');
    const prev = await app.inject({ method: 'GET', url: f.previewUrl });
    expect(prev.headers['content-type']).toBe('image/png');

    const bad = multipart({ label: 'x' }, { name: 'notes.txt', type: 'text/plain', data: Buffer.from('hello') });
    const no = await app.inject({ method: 'POST', url: `/v1/admin/items/${itemId}/stitch-files`, payload: bad.payload, headers: bad.headers, cookies: owner });
    expect((no.json() as any).error.code).toBe('bad_format');
    const junk = multipart({ label: 'x' }, { name: 'broken.pes', type: 'application/octet-stream', data: Buffer.from('#PES0001 not really') });
    const unread = await app.inject({ method: 'POST', url: `/v1/admin/items/${itemId}/stitch-files`, payload: junk.payload, headers: junk.headers, cookies: owner });
    expect(unread.statusCode).toBe(400);
    expect((await call('GET', `/v1/admin/orders/${number}`, { cookies: owner })).body.order.items[0].stitchFiles).toHaveLength(1);
  });
});

describe('GST reports', () => {
  const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  // a GSTIN with the right check digit for Karnataka (29)
  const gstin = () => {
    const base = '29ABCDE1234F1Z';
    for (const c of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (isValidGstin(base + c)) return base + c;
    throw new Error('no check digit');
  };
  const parse = (csv: string) => csv.replace(/^﻿/, '').trim().split('\r\n').map((line) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.slice(0, -1).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')));

  it('gives the owner a sales register, an HSN summary and refunds that match the invoices', async () => {
    const owner = ownerCookie;
    const kit = await variant('poppy');
    // a cash order in the seller's state (CGST + SGST), and a business order from Karnataka (IGST)
    const a = await customer();
    const local = await call('POST', '/v1/orders', { cookies: { sid: a.sid }, body: { items: [{ variantId: kit.id, qty: 1 }], shipping: 'standard', payment: 'cod', details: details(a.phone), clientKey: `gst-a-${Date.now()}` } });
    expect(local.status).toBe(201);
    const b = await customer();
    const away = { ...details(b.phone), pincode: '560001', city: 'Bengaluru', state: 'Karnataka', gst: { gstin: gstin(), business: '=HYPERLINK("http://x","Studio")' } };
    const biz = await call('POST', '/v1/orders', { cookies: { sid: b.sid }, body: { items: [{ variantId: kit.id, qty: 2 }], shipping: 'standard', payment: 'cod', details: away, clientKey: `gst-b-${Date.now()}` } });
    expect(biz.status).toBe(201);
    const inv: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const n of [local.body.order.number, biz.body.order.number]) inv.push((await call('POST', `/v1/admin/orders/${n}/invoice`, { cookies: owner })).body.order);
    const q = `from=${today()}&to=${today()}`;

    // sales register: one row per line, and the numbers of the invoice snapshot
    const reg = await app.inject({ method: 'GET', url: `/v1/admin/reports/gst-sales.csv?${q}`, cookies: owner });
    expect(reg.statusCode).toBe(200);
    expect(reg.headers['content-type']).toContain('text/csv');
    expect(reg.headers['content-disposition']).toContain(`gst-sales-register-${today()}_to_${today()}.csv`);
    const rows = parse(reg.body);
    const head = rows[0]!;
    const col = (r: string[], name: string) => r[head.indexOf(name)]!;
    const mine = rows.filter((r) => [inv[0].number, inv[1].number].includes(col(r, 'Order no')));
    expect(mine).toHaveLength(2);
    const l = mine.find((r) => col(r, 'Order no') === inv[0].number)!;
    const x = mine.find((r) => col(r, 'Order no') === inv[1].number)!;
    expect([col(l, 'Type'), col(l, 'Inter-state'), col(l, 'Place of supply')]).toEqual(['B2C', 'No', 'Maharashtra']);
    expect(Number(col(l, 'CGST'))).toBeGreaterThan(0);
    expect(Number(col(l, 'IGST'))).toBe(0);
    expect([col(x, 'Type'), col(x, 'Inter-state'), col(x, 'State code'), col(x, 'Customer GSTIN')]).toEqual(['B2B', 'Yes', '29', gstin()]);
    expect(Number(col(x, 'IGST'))).toBeGreaterThan(0);
    expect(Number(col(x, 'CGST'))).toBe(0);
    // a name that Excel would run as a formula comes out as plain text
    expect(col(x, 'Customer')).toBe(`'=HYPERLINK("http://x","Studio")`);
    for (const [r, o] of [[l, inv[0]], [x, inv[1]]] as const) {
      const sum = Number(col(r, 'Taxable value')) + Number(col(r, 'CGST')) + Number(col(r, 'SGST')) + Number(col(r, 'IGST'));
      expect(sum).toBeCloseTo(Number(col(r, 'Total incl. GST')), 2);
      expect(Math.round(Number(col(r, 'Total incl. GST')) * 100)).toBe(o.totalPaise);
      expect(col(r, 'Invoice no')).toBe(o.invoice.number);
    }
    expect(rows.at(-1)![0]).toBe('Total');

    // HSN summary: B2B and B2C apart, quantities add up
    const hsn = parse((await app.inject({ method: 'GET', url: `/v1/admin/reports/gst-hsn.csv?${q}`, cookies: owner })).body);
    const types = hsn.slice(1).map((r) => r[0]);
    expect(types).toContain('B2B');
    expect(types).toContain('B2C');
    expect(hsn[0]).toEqual(['Supply type', 'HSN', 'Description', 'UQC', 'Total quantity', 'Total value', 'Rate %', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Cess']);

    // refunds: a refund on the local order shows with its invoice
    await call('POST', `/v1/admin/orders/${inv[0].number}/cancel`, { cookies: owner, body: { reason: 'Customer asked to cancel', notify: false } });
    const refunds = parse((await app.inject({ method: 'GET', url: `/v1/admin/reports/refunds.csv?${q}`, cookies: owner })).body);
    expect(refunds[0]![0]).toBe('Refund date');

    // staff can't, nobody else can, and silly ranges are refused
    expect((await app.inject({ method: 'GET', url: `/v1/admin/reports/gst-sales.csv?${q}`, cookies: staffCookie })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/v1/admin/reports/gst-sales.csv?${q}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/v1/admin/reports/gst-sales.csv?from=2026-12-01&to=2026-01-01`, cookies: owner })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/v1/admin/reports/gst-sales.csv?from=2024-01-01&to=2026-01-01`, cookies: owner })).statusCode).toBe(400);
  });
});
