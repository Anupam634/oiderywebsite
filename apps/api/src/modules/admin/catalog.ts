import { z } from 'zod';
import {
  COLOUR_FAMILIES,
  FONT_KEYS,
  GST_RATES_BP,
  OCCASIONS,
  PRODUCT_TYPES,
  SIZE_GUIDES,
  THREAD_KEYS,
  type AdminCategory,
  type AdminCoupon,
  type AdminProduct,
  type AdminProductRow,
  type AdminReview,
  type ProductDetails,
} from '@store/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAdmin, requireOwner } from '../../lib/auth.ts';
import { audit } from '../../lib/audit.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import { Prisma } from '../../generated/prisma/client.ts';
import type { CatalogRepo } from '../catalog/repo.ts';
import type { Files } from '../files/service.ts';

/* Products, categories, coupons and reviews for the studio admin. Every change clears the catalogue cache
   and asks the storefront to refresh its copy. */

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => z.string().trim().max(max).nullable().transform((v) => v || null);
const keys = <T extends readonly { key: string }[]>(list: T) => list.map((x) => x.key) as [string, ...string[]];

const persoSchema = z.object({
  fee: z.number().int().min(0).max(100_000),
  maxLength: z.number().int().min(1).max(40),
  defaultText: text(40),
  required: z.boolean(),
  defaultOn: z.boolean(),
  font: z.enum(FONT_KEYS),
  thread: z.enum(THREAD_KEYS),
  flowerPresets: z.boolean(),
});
const detailsSchema = z.object({
  why: z.array(z.object({ title: text(40), text: text(200) })).max(6),
  spec: z.array(z.object({ label: text(40), value: text(200) })).max(14),
  care: z.array(text(200)).max(10),
  faq: z.array(z.object({ q: text(200), a: text(800) })).max(12),
  upClose: z.unknown().optional(),
});

export const productBody = z.object({
  code: z.string().regex(/^[a-z0-9]{2,20}$/, 'Code: 2–20 lowercase letters or digits'),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Link: lowercase words joined by dashes').max(80),
  name: text(80).min(2),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  type: z.enum(PRODUCT_TYPES),
  categoryId: z.string().max(40),
  pricePaise: z.number().int().min(100).max(10_000_000),
  mrpPaise: z.number().int().min(100).max(10_000_000).nullable(),
  badgeText: optText(24),
  badgeTone: optText(20),
  techLine: text(120),
  story: text(2000),
  colourFamily: z.enum(keys(COLOUR_FAMILIES)),
  occasions: z.array(z.enum(keys(OCCASIONS))).max(OCCASIONS.length),
  popularity: z.number().int().min(0).max(1_000_000),
  shipMode: z.enum(['READY', 'MADE', 'CUSTOM']),
  madeDays: z.number().int().min(1).max(60).nullable(),
  shipNote: optText(120),
  isUnique: z.boolean(),
  handMade: z.boolean(),
  needsSize: z.boolean(),
  sizeLabel: optText(40),
  sizeGuide: z.enum(Object.keys(SIZE_GUIDES) as [string, ...string[]]).nullable(),
  studioGarment: optText(20),
  studioSample: optText(20),
  petPhoto: z.boolean(),
  personalisation: persoSchema.nullable(),
  livePreview: z.record(z.string(), z.unknown()).nullable(),
  details: detailsSchema,
  seoTitle: optText(70),
  seoDescription: optText(170),
  hsnCode: z.string().regex(/^\d{4,8}$/, 'HSN: 4 to 8 digits'),
  gstRule: z.enum(['threshold', 'flat']),
  gstRateBp: z.number().int().refine((n) => (GST_RATES_BP as readonly number[]).includes(n), 'Choose a GST rate'),
  related: z.array(z.string().max(40)).max(8),
});

const variantBody = z.object({
  id: z.string().max(40).optional(),
  sku: z.string().trim().regex(/^[A-Z0-9][A-Z0-9-]{1,60}$/, 'SKU: capital letters, digits and dashes'),
  colourName: text(40).min(1),
  colourValue: text(40).min(1),
  colourHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: optText(30),
  sizeNote: optText(60),
  priceDeltaPaise: z.number().int().min(-1_000_000).max(10_000_000),
  stock: z.number().int().min(0).max(100_000),
  trackStock: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

const productInclude = {
  category: { include: { parent: true } },
  images: { orderBy: { sortOrder: 'asc' } },
  variants: { orderBy: { sortOrder: 'asc' } },
  relatedFrom: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductInclude;

function toAdminProduct(p: Prisma.ProductGetPayload<{ include: typeof productInclude }>): AdminProduct {
  return {
    id: p.id,
    code: p.code,
    slug: p.slug,
    name: p.name,
    status: p.status,
    type: p.type,
    categoryId: p.categoryId,
    pricePaise: p.pricePaise,
    mrpPaise: p.mrpPaise,
    badgeText: p.badgeText,
    badgeTone: p.badgeTone,
    techLine: p.techLine,
    story: p.story,
    colourFamily: p.colourFamily,
    occasions: p.occasions,
    popularity: p.popularity,
    shipMode: p.shipMode,
    madeDays: p.madeDays,
    shipNote: p.shipNote,
    isUnique: p.isUnique,
    handMade: p.handMade,
    needsSize: p.needsSize,
    sizeLabel: p.sizeLabel,
    sizeGuide: p.sizeGuide,
    studioGarment: p.studioGarment,
    studioSample: p.studioSample,
    petPhoto: p.petPhoto,
    personalisation: p.personalisation as AdminProduct['personalisation'],
    livePreview: p.livePreview as AdminProduct['livePreview'],
    details: { why: [], spec: [], care: [], faq: [], upClose: null, ...(p.details as Partial<ProductDetails>) },
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    hsnCode: p.hsnCode,
    gstRule: p.gstRule === 'flat' ? 'flat' : 'threshold',
    gstRateBp: p.gstRateBp,
    related: p.relatedFrom.map((r) => r.toId),
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, colourName: v.colourName, colourValue: v.colourValue, colourHex: v.colourHex, size: v.size, sizeNote: v.sizeNote, priceDeltaPaise: v.priceDeltaPaise, stock: v.stock, trackStock: v.trackStock, sortOrder: v.sortOrder })),
    images: p.images.map((i) => ({ id: i.id, role: i.role, path: i.path, zoomPath: i.zoomPath, alt: i.alt, caption: i.caption, sortOrder: i.sortOrder })),
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** rating shown on the product = published reviews */
export async function recomputeRating(db: Db | Prisma.TransactionClient, productId: string) {
  const agg = await db.review.aggregate({ where: { productId, status: 'PUBLISHED' }, _avg: { rating: true }, _count: true });
  await db.product.update({ where: { id: productId }, data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count } });
}

const uniqueClash = (e: unknown, what: string) => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError(409, 'taken', `That ${what} is already used by another product`);
  throw e;
};

export const adminCatalogRoutes =
  (db: Db, catalog: CatalogRepo, files: Files, refreshWeb: () => void): FastifyPluginAsyncZod =>
  async (app) => {
    app.addHook('preValidation', requireAdmin);
    app.addHook('onSend', async (_req, reply) => {
      reply.header('cache-control', 'private, no-store');
    });
    const changed = () => {
      catalog.clearCache();
      refreshWeb();
    };
    const load = async (id: string) => {
      const p = await db.product.findUnique({ where: { id }, include: productInclude });
      if (!p) throw notFound('Product');
      return toAdminProduct(p);
    };

    /* ---------------- products ---------------- */
    app.get(
      '/admin/products',
      {
        schema: {
          tags: ['admin'],
          summary: 'Products',
          querystring: z.object({ q: z.string().trim().max(60).optional(), status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(), lowStock: z.coerce.boolean().optional() }),
        },
      },
      async (req) => {
        const { q, status } = req.query;
        const rows = await db.product.findMany({
          where: {
            ...(status ? { status } : {}),
            ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q.toLowerCase() } }, { variants: { some: { sku: { contains: q.toUpperCase() } } } }] } : {}),
          },
          include: { category: true, images: { where: { role: 'MAIN' }, take: 1 }, variants: { select: { stock: true, trackStock: true } } },
          orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        });
        let items: AdminProductRow[] = rows.map((p) => ({
          id: p.id,
          code: p.code,
          slug: p.slug,
          name: p.name,
          status: p.status,
          type: p.type,
          category: p.category.name,
          pricePaise: p.pricePaise,
          mrpPaise: p.mrpPaise,
          stock: p.variants.filter((v) => v.trackStock).reduce((a, v) => a + v.stock, 0),
          tracked: p.variants.some((v) => v.trackStock),
          image: p.images[0]?.path ?? null,
          updatedAt: p.updatedAt.toISOString(),
        }));
        if (req.query.lowStock) items = items.filter((p) => p.tracked && p.stock <= 2);
        return { items };
      },
    );

    app.get('/admin/products/:id', { schema: { tags: ['admin'], summary: 'A product to edit', params: z.object({ id: z.string().max(40) }) } }, async (req) => ({
      product: await load(req.params.id),
    }));

    app.post(
      '/admin/products',
      { schema: { tags: ['admin'], summary: 'New product (starts as a draft)', body: z.object({ name: text(80).min(2), categoryId: z.string().max(40), type: z.enum(PRODUCT_TYPES), pricePaise: z.number().int().min(100) }) } },
      async (req, reply) => {
        const base = req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'product';
        let slug = base;
        for (let n = 2; await db.product.findUnique({ where: { slug } }); n++) slug = `${base}-${n}`;
        let code = base.replace(/-/g, '').slice(0, 14) || 'item';
        for (let n = 2; await db.product.findUnique({ where: { code } }); n++) code = `${base.replace(/-/g, '').slice(0, 12)}${n}`;
        const p = await db.product.create({
          data: {
            ...req.body,
            code,
            slug,
            status: 'DRAFT',
            techLine: '',
            story: '',
            colourFamily: 'multi',
            occasions: [],
            shipMode: req.body.type === 'READY' ? 'READY' : req.body.type === 'MADE_TO_ORDER' ? 'MADE' : 'CUSTOM',
            details: { why: [], spec: [], care: [], faq: [], upClose: null },
            variants: { create: [{ sku: code.toUpperCase(), colourName: 'Default', colourValue: '#ffffff', colourHex: '#ffffff', stock: 0, trackStock: true }] },
          },
        });
        await audit(db, req, 'product_created', 'product', p.id, { name: p.name });
        reply.code(201);
        return { product: await load(p.id) };
      },
    );

    app.patch(
      '/admin/products/:id',
      { schema: { tags: ['admin'], summary: 'Edit a product', params: z.object({ id: z.string().max(40) }), body: productBody.partial() } },
      async (req) => {
        const { related, personalisation, livePreview, details, ...fields } = req.body;
        if (fields.mrpPaise !== undefined && fields.mrpPaise !== null && fields.pricePaise !== undefined && fields.mrpPaise < fields.pricePaise)
          throw new AppError(400, 'bad_mrp', 'MRP must be at least the price');
        await db
          .$transaction(async (tx) => {
            await tx.product.update({
              where: { id: req.params.id },
              data: {
                ...fields,
                ...(personalisation !== undefined ? { personalisation: personalisation ?? Prisma.DbNull } : {}),
                ...(livePreview !== undefined ? { livePreview: (livePreview as Prisma.InputJsonValue) ?? Prisma.DbNull } : {}),
                ...(details ? { details: details as Prisma.InputJsonValue } : {}),
                ...(fields.status === 'ACTIVE' ? { publishedAt: undefined } : {}),
              },
            });
            if (related) {
              await tx.productRelation.deleteMany({ where: { fromId: req.params.id } });
              await tx.productRelation.createMany({ data: related.filter((r) => r !== req.params.id).map((toId, i) => ({ fromId: req.params.id, toId, sortOrder: i })) });
            }
          })
          .catch((e) => uniqueClash(e, 'link or code'));
        await audit(db, req, 'product_updated', 'product', req.params.id, { fields: Object.keys(req.body) });
        changed();
        return { product: await load(req.params.id) };
      },
    );

    app.put(
      '/admin/products/:id/variants',
      { schema: { tags: ['admin'], summary: 'Replace a product’s colours/sizes and stock', params: z.object({ id: z.string().max(40) }), body: z.object({ variants: z.array(variantBody).min(1).max(80) }) } },
      async (req) => {
        const productId = req.params.id;
        const current = await db.productVariant.findMany({ where: { productId } });
        const keep = new Set(req.body.variants.map((v) => v.id).filter(Boolean));
        await db
          .$transaction(async (tx) => {
            await tx.productVariant.deleteMany({ where: { productId, id: { notIn: [...keep] as string[] } } });
            for (const { id, ...v } of req.body.variants) {
              if (id && current.some((c) => c.id === id)) await tx.productVariant.update({ where: { id }, data: v });
              else await tx.productVariant.create({ data: { ...v, productId } });
            }
          })
          .catch((e) => uniqueClash(e, 'SKU'));
        await audit(db, req, 'variants_updated', 'product', productId, { count: req.body.variants.length });
        changed();
        return { product: await load(productId) };
      },
    );

    app.post(
      '/admin/products/:id/images',
      { schema: { tags: ['admin'], summary: 'Add a photo (multipart: file, role, alt)', params: z.object({ id: z.string().max(40) }), consumes: ['multipart/form-data'] } },
      async (req) => {
        if (!req.isMultipart()) throw new AppError(415, 'multipart_required', 'Send the photo as multipart/form-data');
        const p = await db.product.findUnique({ where: { id: req.params.id }, include: { images: true } });
        if (!p) throw notFound('Product');
        const part = await req.file({ limits: { fileSize: 25 << 20, files: 1, fields: 6 } });
        if (!part) throw new AppError(400, 'no_file', 'Choose a photo');
        const field = (k: string) => (part.fields[k] && 'value' in part.fields[k]! ? String((part.fields[k] as { value: unknown }).value) : '');
        const role = (['MAIN', 'HOVER', 'GALLERY'].includes(field('role')) ? field('role') : p.images.length ? 'GALLERY' : 'MAIN') as 'MAIN' | 'HOVER' | 'GALLERY';
        const buf = await part.toBuffer();
        if (part.file.truncated) throw new AppError(413, 'file_too_big', 'That photo is over 25 MB');
        const main = await files.save('PRODUCT_IMAGE', await files.processImage(buf, 'PRODUCT_IMAGE', { maxPx: 1600 }), { isPublic: true, originalName: part.filename });
        // a sharper copy for the zoom lens when the photo is bigger than the display size
        const big = Math.max(main.width ?? 0, main.height ?? 0) >= 1600 ? await files.save('PRODUCT_IMAGE', await files.processImage(buf, 'PRODUCT_IMAGE', { maxPx: 2600 }), { isPublic: true, originalName: part.filename }) : null;
        await db.$transaction(async (tx) => {
          if (role !== 'GALLERY') await tx.productImage.updateMany({ where: { productId: p.id, role }, data: { role: 'GALLERY' } });
          await tx.productImage.create({
            data: { productId: p.id, role, path: files.publicPath(main.key), zoomPath: big ? files.publicPath(big.key) : null, alt: field('alt').slice(0, 200) || p.name, caption: field('caption').slice(0, 60) || null, sortOrder: (Math.max(-1, ...p.images.map((i) => i.sortOrder)) + 1) },
          });
        });
        await audit(db, req, 'image_added', 'product', p.id);
        changed();
        return { product: await load(p.id) };
      },
    );

    app.patch(
      '/admin/products/:id/images',
      {
        schema: {
          tags: ['admin'],
          summary: 'Order, roles, alt text and captions of the photos',
          params: z.object({ id: z.string().max(40) }),
          body: z.object({ images: z.array(z.object({ id: z.string().max(40), role: z.enum(['MAIN', 'HOVER', 'GALLERY']), alt: text(200), caption: optText(60) })).max(30) }),
        },
      },
      async (req) => {
        const imgs = req.body.images;
        if (imgs.filter((i) => i.role === 'MAIN').length > 1 || imgs.filter((i) => i.role === 'HOVER').length > 1) throw new AppError(400, 'roles', 'Choose one main photo and at most one hover photo');
        await db.$transaction(imgs.map((i, n) => db.productImage.updateMany({ where: { id: i.id, productId: req.params.id }, data: { role: i.role, alt: i.alt, caption: i.caption, sortOrder: n } })));
        changed();
        return { product: await load(req.params.id) };
      },
    );

    app.delete('/admin/products/:id/images/:imageId', { schema: { tags: ['admin'], summary: 'Remove a photo', params: z.object({ id: z.string().max(40), imageId: z.string().max(40) }) } }, async (req) => {
      const img = await db.productImage.findFirst({ where: { id: req.params.imageId, productId: req.params.id } });
      if (!img) throw notFound('Photo');
      await db.productImage.delete({ where: { id: img.id } });
      for (const path of [img.path, img.zoomPath]) {
        const at = path?.indexOf('public/product-image/') ?? -1;
        if (path && at >= 0) {
          const up = await db.upload.findUnique({ where: { key: path.slice(at) } });
          if (up) await files.remove(up);
        }
      }
      await audit(db, req, 'image_removed', 'product', req.params.id);
      changed();
      return { product: await load(req.params.id) };
    });

    /* ---------------- categories ---------------- */
    const categoryBody = z.object({
      slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
      name: text(40).min(2),
      blurb: optText(200),
      image: optText(300),
      sortOrder: z.number().int().min(0).max(1000),
      parentId: z.string().max(40).nullable(),
    });
    const categories = async (): Promise<AdminCategory[]> =>
      (await db.category.findMany({ orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }], include: { _count: { select: { products: true } } } })).map((c) => ({
        id: c.id, slug: c.slug, name: c.name, blurb: c.blurb, image: c.image, sortOrder: c.sortOrder, parentId: c.parentId, productCount: c._count.products,
      }));
    app.get('/admin/categories', { schema: { tags: ['admin'], summary: 'Categories' } }, async () => ({ items: await categories() }));
    app.post('/admin/categories', { schema: { tags: ['admin'], summary: 'Add a category', body: categoryBody } }, async (req) => {
      await db.category.create({ data: req.body }).catch((e) => uniqueClash(e, 'link'));
      await audit(db, req, 'category_created', 'category', req.body.slug);
      changed();
      return { items: await categories() };
    });
    app.patch('/admin/categories/:id', { schema: { tags: ['admin'], summary: 'Edit a category', params: z.object({ id: z.string().max(40) }), body: categoryBody.partial() } }, async (req) => {
      if (req.body.parentId === req.params.id) throw new AppError(400, 'loop', 'A category can’t be inside itself');
      await db.category.update({ where: { id: req.params.id }, data: req.body }).catch((e) => uniqueClash(e, 'link'));
      await audit(db, req, 'category_updated', 'category', req.params.id);
      changed();
      return { items: await categories() };
    });
    app.delete('/admin/categories/:id', { schema: { tags: ['admin'], summary: 'Remove an empty category', params: z.object({ id: z.string().max(40) }) } }, async (req) => {
      const c = await db.category.findUnique({ where: { id: req.params.id }, include: { _count: { select: { products: true, children: true } } } });
      if (!c) throw notFound('Category');
      if (c._count.products || c._count.children) throw new AppError(409, 'not_empty', 'Move its products and sub-categories first');
      await db.category.delete({ where: { id: c.id } });
      await audit(db, req, 'category_deleted', 'category', c.slug);
      changed();
      return { items: await categories() };
    });

    /* ---------------- coupons ---------------- */
    const couponBody = z.object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, 'Code: 3–20 letters or digits'),
      label: text(60).min(3),
      percent: z.number().int().min(1).max(90),
      maxDiscountPaise: z.number().int().min(100).max(10_000_000),
      minSubtotalPaise: z.number().int().min(0).max(10_000_000),
      firstOrderOnly: z.boolean(),
      maxUses: z.number().int().min(1).max(1_000_000).nullable(),
      active: z.boolean(),
      startsAt: z.iso.datetime().nullable(),
      endsAt: z.iso.datetime().nullable(),
    });
    const toCoupon = (c: Prisma.CouponGetPayload<object>): AdminCoupon => ({
      code: c.code, label: c.label, percent: c.percent, maxDiscountPaise: c.maxDiscountPaise, minSubtotalPaise: c.minSubtotalPaise, firstOrderOnly: c.firstOrderOnly,
      maxUses: c.maxUses, usedCount: c.usedCount, active: c.active, startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null,
    });
    const coupons = async () => (await db.coupon.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] })).map(toCoupon);
    const dates = (b: { startsAt?: string | null; endsAt?: string | null }) => ({
      ...(b.startsAt !== undefined ? { startsAt: b.startsAt ? new Date(b.startsAt) : null } : {}),
      ...(b.endsAt !== undefined ? { endsAt: b.endsAt ? new Date(b.endsAt) : null } : {}),
    });
    app.get('/admin/coupons', { schema: { tags: ['admin'], summary: 'Coupons' } }, async () => ({ items: await coupons() }));
    app.post('/admin/coupons', { schema: { tags: ['admin'], summary: 'Add a coupon', body: couponBody } }, async (req) => {
      const { startsAt: _s, endsAt: _e, ...rest } = req.body;
      await db.coupon.create({ data: { ...rest, ...dates(req.body) } }).catch((e) => uniqueClash(e, 'code'));
      await audit(db, req, 'coupon_created', 'coupon', req.body.code);
      return { items: await coupons() };
    });
    app.patch('/admin/coupons/:code', { schema: { tags: ['admin'], summary: 'Edit a coupon', params: z.object({ code: z.string().max(20) }), body: couponBody.omit({ code: true }).partial() } }, async (req) => {
      const { startsAt: _s, endsAt: _e, ...rest } = req.body;
      await db.coupon.update({ where: { code: req.params.code }, data: { ...rest, ...dates(req.body) } }).catch(() => {
        throw notFound('Coupon');
      });
      await audit(db, req, 'coupon_updated', 'coupon', req.params.code, req.body);
      return { items: await coupons() };
    });
    app.delete('/admin/coupons/:code', { schema: { tags: ['admin'], summary: 'Remove an unused coupon (used ones are switched off)', params: z.object({ code: z.string().max(20) }) } }, async (req) => {
      const c = await db.coupon.findUnique({ where: { code: req.params.code } });
      if (!c) throw notFound('Coupon');
      if (c.usedCount > 0 || (await db.order.count({ where: { couponCode: c.code } }))) await db.coupon.update({ where: { code: c.code }, data: { active: false } });
      else await db.coupon.delete({ where: { code: c.code } });
      await audit(db, req, 'coupon_removed', 'coupon', c.code);
      return { items: await coupons() };
    });

    /* ---------------- reviews ---------------- */
    app.get(
      '/admin/reviews',
      { schema: { tags: ['admin'], summary: 'Reviews to check', querystring: z.object({ status: z.enum(['PENDING', 'PUBLISHED', 'HIDDEN']).default('PENDING'), page: z.coerce.number().int().min(1).default(1) }) } },
      async (req) => {
        const where = { status: req.query.status };
        const [rows, total, samples] = await Promise.all([
          db.review.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (req.query.page - 1) * 30, take: 30, include: { product: { select: { name: true } } } }),
          db.review.count({ where }),
          db.review.count({ where: { isSample: true } }),
        ]);
        const items: AdminReview[] = rows.map((r) => ({ id: r.id, productId: r.productId, productName: r.product.name, authorName: r.authorName, city: r.city, rating: r.rating, body: r.body, status: r.status, isSample: r.isSample, createdAt: r.createdAt.toISOString() }));
        return { items, total, samples };
      },
    );
    app.patch('/admin/reviews/:id', { schema: { tags: ['admin'], summary: 'Publish or hide a review', params: z.object({ id: z.string().max(40) }), body: z.object({ status: z.enum(['PUBLISHED', 'HIDDEN', 'PENDING']) }) } }, async (req) => {
      const r = await db.review.update({ where: { id: req.params.id }, data: { status: req.body.status } }).catch(() => null);
      if (!r) throw notFound('Review');
      await recomputeRating(db, r.productId);
      await audit(db, req, 'review_' + req.body.status.toLowerCase(), 'review', r.id);
      changed();
      return { ok: true };
    });
    app.post('/admin/reviews/remove-samples', { preValidation: requireOwner, schema: { tags: ['admin'], summary: 'Delete the demo reviews from the design phase and recount ratings (owner)' } }, async (req) => {
      const touched = await db.review.findMany({ where: { isSample: true }, select: { productId: true }, distinct: ['productId'] });
      const { count } = await db.review.deleteMany({ where: { isSample: true } });
      for (const t of touched) await recomputeRating(db, t.productId);
      await audit(db, req, 'sample_reviews_removed', 'review', null, { count });
      changed();
      return { removed: count };
    });
  };
