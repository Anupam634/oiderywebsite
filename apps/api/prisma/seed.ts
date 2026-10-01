/* Seeds categories, products, variants, images, sample reviews and coupons from prisma/seed/catalog.json.
   Idempotent: run it again after editing the JSON. Stock levels in the database are reset to the JSON values. */
import fs from 'node:fs';
import { createPrisma } from '../src/lib/prisma.ts';
import type { ImageRole, ProductType, ShipMode } from '../src/generated/prisma/client.ts';

interface SeedCategory { slug: string; name: string; blurb: string | null; image: string | null; sortOrder: number; parent: string | null }
interface SeedProduct {
  code: string; slug: string; name: string; type: ProductType; category: string; pricePaise: number; mrpPaise: number | null;
  badgeText: string | null; badgeTone: string | null; techLine: string; story: string; colourFamily: string; occasions: string[];
  ratingAvg: number; ratingCount: number; popularity: number; publishedAt: string; shipMode: ShipMode; madeDays: number | null;
  shipNote: string | null; isUnique: boolean; handMade: boolean; needsSize: boolean; sizeLabel: string | null; sizeGuide: string | null;
  studioGarment: string | null; studioSample: string | null; petPhoto: boolean; personalisation: object | null; livePreview: object | null;
  details: object; images: { role: ImageRole; path: string; alt: string; caption: string | null; sortOrder: number }[];
  variants: { sku: string; colourName: string; colourValue: string; colourHex: string; size: string | null; sizeNote: string | null; priceDeltaPaise: number; stock: number; trackStock: boolean; sortOrder: number }[];
  reviews: { authorName: string; city: string | null; rating: number; createdAt: string; body: string; helpfulCount: number; isSample: boolean; photoPath: string | null; preview: object | null }[];
  related: string[];
}

const data = JSON.parse(fs.readFileSync(new URL('./seed/catalog.json', import.meta.url), 'utf8')) as { categories: SeedCategory[]; products: SeedProduct[] };
const photosDir = new URL('../../web/public/', import.meta.url);
const zoomOf = (path: string) => {
  const z = path.replace(/^photos\//, 'photos/z/');
  return fs.existsSync(new URL(z, photosDir)) ? z : null;
};
const json = (v: object | null) => (v === null ? undefined : (v as never));

const COUPONS = [
  { code: 'TAANKA10', label: '10% off, first order', percent: 10, maxDiscountPaise: 30_000, minSubtotalPaise: 0, firstOrderOnly: true },
  { code: 'FESTIVE15', label: '15% off above ₹2,999', percent: 15, maxDiscountPaise: 60_000, minSubtotalPaise: 299_900, firstOrderOnly: false },
];

async function main() {
  const db = createPrisma(process.env.DATABASE_URL!);
  const catId = new Map<string, string>();
  for (const c of [...data.categories].sort((a, b) => Number(!!a.parent) - Number(!!b.parent))) {
    const row = { name: c.name, blurb: c.blurb, image: c.image, sortOrder: c.sortOrder, parentId: c.parent ? catId.get(c.parent)! : null };
    const saved = await db.category.upsert({ where: { slug: c.slug }, create: { slug: c.slug, ...row }, update: row });
    catId.set(c.slug, saved.id);
  }
  for (const c of COUPONS) await db.coupon.upsert({ where: { code: c.code }, create: c, update: c });

  const productId = new Map<string, string>();
  for (const p of data.products) {
    const fields = {
      slug: p.slug, name: p.name, status: 'ACTIVE' as const, type: p.type, categoryId: catId.get(p.category)!, pricePaise: p.pricePaise,
      mrpPaise: p.mrpPaise, badgeText: p.badgeText, badgeTone: p.badgeTone, techLine: p.techLine, story: p.story, colourFamily: p.colourFamily,
      occasions: p.occasions, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount, popularity: p.popularity, publishedAt: new Date(p.publishedAt),
      shipMode: p.shipMode, madeDays: p.madeDays, shipNote: p.shipNote, isUnique: p.isUnique, handMade: p.handMade, needsSize: p.needsSize,
      sizeLabel: p.sizeLabel, sizeGuide: p.sizeGuide, studioGarment: p.studioGarment, studioSample: p.studioSample, petPhoto: p.petPhoto,
      personalisation: json(p.personalisation), livePreview: json(p.livePreview), details: p.details as never,
    };
    const saved = await db.$transaction(async (tx) => {
      const prod = await tx.product.upsert({ where: { code: p.code }, create: { code: p.code, ...fields }, update: fields });
      await tx.productImage.deleteMany({ where: { productId: prod.id } });
      await tx.productImage.createMany({ data: p.images.map((i) => ({ ...i, productId: prod.id, zoomPath: zoomOf(i.path) })) });
      await tx.productVariant.deleteMany({ where: { productId: prod.id, sku: { notIn: p.variants.map((v) => v.sku) } } });
      for (const v of p.variants) await tx.productVariant.upsert({ where: { sku: v.sku }, create: { ...v, productId: prod.id }, update: v });
      await tx.review.deleteMany({ where: { productId: prod.id, isSample: true } });
      await tx.review.createMany({ data: p.reviews.map((r) => ({ ...r, preview: json(r.preview), createdAt: new Date(r.createdAt), status: 'PUBLISHED' as const, productId: prod.id })) });
      return prod;
    });
    productId.set(p.code, saved.id);
  }
  for (const p of data.products) {
    const fromId = productId.get(p.code)!;
    await db.productRelation.deleteMany({ where: { fromId } });
    await db.productRelation.createMany({ data: p.related.map((code, i) => ({ fromId, toId: productId.get(code)!, sortOrder: i })) });
  }
  const counts = await Promise.all([db.category.count(), db.product.count(), db.productVariant.count(), db.review.count(), db.coupon.count()]);
  console.log(`seeded: ${counts[0]} categories, ${counts[1]} products, ${counts[2]} variants, ${counts[3]} reviews, ${counts[4]} coupons`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
