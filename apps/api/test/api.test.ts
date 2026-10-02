import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { INDIAN_STATES, type CategoryNode, type ProductDetail } from '@store/shared';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { createPrisma, type Db } from '../src/lib/prisma.ts';

let app: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: inject('databaseUrl'), LOG_LEVEL: 'silent' });
  db = createPrisma(config.DATABASE_URL);
  app = await buildApp({ config, db });
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const get = async <T = any>(url: string) => {
  const r = await app.inject({ method: 'GET', url });
  return { status: r.statusCode, body: r.json() as T, headers: r.headers };
};
const price = async (body: object) => {
  const r = await app.inject({ method: 'POST', url: '/v1/cart/price', payload: body });
  return { status: r.statusCode, body: r.json() };
};

describe('catalogue', () => {
  it('health check reaches the database', async () => {
    expect((await get('/health')).body).toEqual({ ok: true });
  });

  it('lists the category tree with counts', async () => {
    const { body } = await get<{ items: CategoryNode[] }>('/v1/categories');
    expect(body.items.map((c) => c.slug)).toEqual(['clothing', 'home', 'gifts', 'corporate']);
    const gifts = body.items.find((c) => c.slug === 'gifts')!;
    expect(gifts.productCount).toBe(4);
    expect(gifts.children.map((c) => c.slug)).toEqual(['namegifts', 'pets', 'kits']);
  });

  it('lists products with facets, filters and sort', async () => {
    const all = await get('/v1/products');
    expect(all.body.total).toBe(20);
    expect(all.body.items).toHaveLength(20);
    expect(all.body.facets.cat).toMatchObject({ clothing: 7, home: 6, gifts: 4, corporate: 3 });
    expect(all.headers['cache-control']).toContain('max-age');

    const under999 = await get('/v1/products?price=u999&sort=price-asc');
    expect(under999.body.total).toBe(6);
    expect(under999.body.items[0].code).toBe('logotote');

    const page2 = await get('/v1/products?pageSize=8&page=3');
    expect(page2.body.items).toHaveLength(4);
  });

  it('serves a product page with variants, live preview, reviews and related pieces', async () => {
    const { status, body } = await get<ProductDetail>('/v1/products/phoolwari-name-tote');
    expect(status).toBe(200);
    expect(body.variants).toHaveLength(8);
    expect(body.personalisation).toMatchObject({ feePaise: 0, maxLength: 14, defaultOn: true, flowerPresets: true });
    expect(body.livePreview).toMatchObject({ view: 'tote', place: 'cc', box: [20, 24], motif: 'phoolwari' });
    expect(body.reviews.items).toHaveLength(5);
    expect(body.related.map((r) => r.code)).toEqual(['cap', 'nametee', 'cherry', 'pet']);
    expect(body.gallery[0]!.path).toBe('photos/r-tote.jpg');
  });

  it('adds sharp zoom photos where they exist', async () => {
    const { body } = await get<ProductDetail>('/v1/products/lal-yoke-embroidered-kurta');
    expect(body.gallery[0]!.zoomPath).toBe('photos/z/kurta.jpg');
  });

  it('returns clean 404 and 400 errors', async () => {
    expect((await get('/v1/products/no-such-thing')).status).toBe(404);
    const bad = await get('/v1/products/BAD_SLUG!');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_request');
  });

  it('search suggests matching products', async () => {
    const { body } = await get('/v1/search?q=hoops');
    expect(body.total).toBe(5);
  });
});

describe('pincodes', () => {
  it('finds the city and state of a pincode', async () => {
    expect((await get('/v1/pincodes/400050')).body).toEqual({ pincode: '400050', city: 'Mumbai', state: 'Maharashtra' });
    expect((await get('/v1/pincodes/110001')).body).toEqual({ pincode: '110001', city: 'New Delhi', state: 'Delhi' });
    expect((await get('/v1/pincodes/560001')).body).toMatchObject({ city: 'Bengaluru', state: 'Karnataka' });
    expect((await get('/v1/pincodes/396230')).body).toMatchObject({ state: 'Dadra and Nagar Haveli and Daman and Diu' });
    const r = await get('/v1/pincodes/201301');
    expect(r.body).toMatchObject({ city: 'Noida', state: 'Uttar Pradesh' });
    expect(r.headers['cache-control']).toContain('max-age');
  });

  it('every state it returns is one the checkout accepts', async () => {
    const states = new Set(fs.readFileSync('assets/pincodes.tsv', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[2]));
    expect([...states].filter((s) => !(INDIAN_STATES as readonly string[]).includes(s!))).toEqual([]);
    expect(states.size).toBe(36);
  });

  it('says 404 for an unknown pincode and 400 for a malformed one', async () => {
    expect((await get('/v1/pincodes/999999')).status).toBe(404);
    expect((await get('/v1/pincodes/012345')).status).toBe(400);
    expect((await get('/v1/pincodes/40005')).status).toBe(400);
  });
});

describe('cart pricing', () => {
  const variant = async (code: string, where: object = {}) =>
    (await db.productVariant.findFirst({ where: { product: { code }, ...where }, orderBy: { sortOrder: 'asc' } }))!;

  it('prices a personalised tote, a hoodie with a paid name and a kurta', async () => {
    const tote = await variant('tote');
    const hoodie = await variant('peacock', { size: 'M' });
    const kurta = await variant('kurta', { size: 'M' });
    const { status, body } = await price({
      items: [
        { variantId: tote.id, qty: 1, personalisation: { text: 'Priya', font: 'script', thread: 'rani', flowers: 1 } },
        { variantId: hoodie.id, qty: 1, personalisation: { text: 'Kabir', font: 'classic', thread: 'haldi' }, giftWrap: true },
        { variantId: kurta.id, qty: 1 },
      ],
      coupon: 'taanka10',
      payment: 'upi',
    });
    expect(status).toBe(200);
    expect(body.lines.map((l: any) => [l.unitPricePaise, l.custom, l.available])).toEqual([
      [119_900, true, true],
      [189_900 + 14_900 + 4_900, true, true],
      [249_900, false, true],
    ]);
    expect(body.coupon).toEqual({ code: 'TAANKA10', valid: true, applied: false, message: 'Your Buy 2 offer saves you more, so we kept that' });
    expect(body.totals.discountLabel).toBe('Buy 2, get 10% off');
    expect(body.totals.codAllowed).toBe(false);
  });

  it('flags stock, one-of-a-kind, missing initials and bad codes', async () => {
    const kurtaM = await variant('kurta', { size: 'M' });
    const wreath = await variant('wreath');
    const cap = await variant('cap');
    const { body } = await price({
      items: [
        { variantId: kurtaM.id, qty: 9 },
        { variantId: wreath.id, qty: 2 },
        { variantId: cap.id, qty: 1 },
        { variantId: 'nope', qty: 1 },
      ],
      coupon: 'NOPE',
    });
    expect(body.lines.map((l: any) => l.problems[0])).toEqual([
      'Only 8 available',
      'Only 1 available',
      'This piece needs a name or initials',
      'This piece is no longer available',
    ]);
    expect(body.coupon.valid).toBe(false);
    expect(body.totals.itemCount).toBe(0);
  });

  it('applies a coupon on one piece and explains a minimum', async () => {
    const kurta = await variant('kurta', { size: 'M' });
    let { body } = await price({ items: [{ variantId: kurta.id, qty: 1 }], coupon: 'TAANKA10' });
    expect(body.coupon).toMatchObject({ valid: true, applied: true, message: 'TAANKA10 applied. You save ₹250' });
    expect(body.totals.discountPaise).toBe(24_990);
    ({ body } = await price({ items: [{ variantId: kurta.id, qty: 1 }], coupon: 'FESTIVE15' }));
    expect(body.coupon).toMatchObject({ valid: false, message: 'FESTIVE15 needs a bag of ₹2,999 or more' });
    expect(body.totals.discountPaise).toBe(0);
  });

  it('prices design-studio pieces with tiers and the digitizing fee', async () => {
    const studio = { garment: 'tee', colour: 'kajal', view: 'tee', placement: 'lc', widthCm: 8, stitches: 5200, source: 'upload', label: 'logo.png' };
    let { body } = await price({ items: [{ qty: 2, studio: { ...studio, sizes: { M: 1, L: 1 } } }] });
    expect(body.lines[0]).toMatchObject({ available: true, unitPricePaise: 55_000, extraPaise: 39_900, custom: true });
    expect(body.totals.subtotalPaise).toBe(2 * 55_000 + 39_900);
    expect(body.totals.codAllowed).toBe(false);
    ({ body } = await price({ items: [{ qty: 30, studio: { ...studio, sizes: { M: 30 } } }] }));
    expect(body.lines[0]).toMatchObject({ unitPricePaise: 47_500, extraPaise: 0 });
    ({ body } = await price({ items: [{ qty: 3, studio: { ...studio, colour: 'natural', sizes: { M: 2 } } }] }));
    expect(body.lines[0].problems).toEqual(['This colour is no longer available', 'Choose your sizes again']);
  });

  it('lists the offers shoppers can use', async () => {
    const r = await app.inject({ method: 'GET', url: '/v1/coupons' });
    expect(r.statusCode).toBe(200);
    expect(r.json().items.map((c: any) => c.code)).toEqual(['TAANKA10', 'FESTIVE15']);
  });

  it('rejects malformed bags', async () => {
    const r = await price({ items: [{ variantId: 'x', qty: 0 }] });
    expect(r.status).toBe(400);
  });
});
