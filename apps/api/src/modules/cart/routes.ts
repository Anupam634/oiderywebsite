import { z } from 'zod';
import {
  FLOWER_PRESETS,
  FONT_KEYS,
  STUDIO_MAX_QTY,
  STUDIO_SIZES,
  THREAD_KEYS,
  checkName,
  studioGarment,
  studioPrice,
  computeTotals,
  formatINR,
  unitPrice,
  type Coupon,
  type PersonalisationConfig,
  type Totals,
} from '@store/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '../../lib/prisma.ts';

const catalogLineSchema = z.object({
  variantId: z.string().min(1).max(40),
  qty: z.number().int().min(1).max(50),
  personalisation: z
    .object({
      text: z.string().max(60),
      font: z.enum(FONT_KEYS),
      thread: z.enum(THREAD_KEYS),
      flowers: z.number().int().min(0).max(FLOWER_PRESETS.length - 1).optional(),
    })
    .nullish(),
  giftWrap: z.boolean().optional(),
});
const studioLineSchema = z.object({
  qty: z.number().int().min(1).max(STUDIO_MAX_QTY),
  studio: z.object({
    garment: z.string().max(20),
    colour: z.string().max(20),
    view: z.string().max(20),
    placement: z.string().regex(/^[a-z]{1,8}$/),
    widthCm: z.number().min(2).max(40),
    stitches: z.number().int().min(0).max(200_000),
    source: z.enum(['upload', 'make']),
    sizes: z.partialRecord(z.enum(STUDIO_SIZES), z.number().int().min(0).max(STUDIO_MAX_QTY)).optional(),
    label: z.string().trim().max(120),
  }),
});
const lineSchema = z.union([catalogLineSchema, studioLineSchema]);
const bodySchema = z.object({
  items: z.array(lineSchema).max(50),
  coupon: z.string().trim().toUpperCase().max(30).optional(),
  shipping: z.enum(['standard', 'express']).optional(),
  payment: z.enum(['upi', 'card', 'netbanking', 'wallet', 'cod']).optional(),
});

/** Server-side prices for a bag. The browser shows its own estimate; this is the number we charge. */
export const cartRoutes =
  (db: Db): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/cart/price',
      { schema: { tags: ['cart'], summary: 'Price a bag (validates stock, names and coupon)', body: bodySchema }, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
      async (req) => {
        const { items, coupon: code, shipping, payment } = req.body;
        const variants = await db.productVariant.findMany({
          where: { id: { in: items.flatMap((i) => ('variantId' in i ? [i.variantId] : [])) } },
          include: { product: true },
        });
        const byId = new Map(variants.map((v) => [v.id, v]));
        const lines = items.map((it) => {
          if ('studio' in it) return priceStudioLine(it);
          const v = byId.get(it.variantId);
          if (!v || v.product.status !== 'ACTIVE') {
            return { variantId: it.variantId, available: false, problems: ['This piece is no longer available'], qty: it.qty, unitPricePaise: 0, unitMrpPaise: 0, extraPaise: 0, custom: false, product: null };
          }
          const p = v.product;
          const perso = p.personalisation as (Omit<PersonalisationConfig, 'feePaise'> & { fee: number }) | null;
          const problems: string[] = [];
          let personalised = false;
          if (perso) {
            if (it.personalisation) {
              const check = checkName(it.personalisation.text, perso.maxLength);
              if (!check.ok) problems.push(check.reason === 'too_long' ? `Names can be up to ${perso.maxLength} letters` : 'Type the name you want stitched');
              if (it.personalisation.flowers !== undefined && !perso.flowerPresets) problems.push('This piece has no flower options');
              personalised = check.ok;
            } else if (perso.required) problems.push('This piece needs a name or initials');
          } else if (it.personalisation) problems.push('This piece cannot be personalised');
          const maxQty = p.isUnique ? 1 : v.trackStock ? v.stock : 50;
          if (it.qty > maxQty) problems.push(maxQty === 0 ? 'Sold out' : `Only ${maxQty} available`);
          const price = unitPrice({
            basePaise: p.pricePaise,
            mrpPaise: p.mrpPaise,
            variantDeltaPaise: v.priceDeltaPaise,
            personalisationFeePaise: personalised && perso ? perso.fee : 0,
            giftWrap: !!it.giftWrap,
          });
          const custom = p.shipMode !== 'READY' || personalised || v.size === 'Custom';
          return {
            variantId: v.id,
            available: problems.length === 0,
            problems,
            qty: it.qty,
            unitPricePaise: price.pricePaise,
            unitMrpPaise: price.mrpPaise,
            extraPaise: 0,
            custom,
            product: { id: p.id, slug: p.slug, name: p.name, sku: v.sku, colour: v.colourName, size: v.size },
          };
        });

        let coupon: Coupon | null = null;
        let found = false;
        if (code) {
          const now = new Date();
          const c = await db.coupon.findUnique({ where: { code } });
          found = !!(c && c.active && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt >= now));
          if (found && c) coupon = { code: c.code, percent: c.percent, maxDiscountPaise: c.maxDiscountPaise, minSubtotalPaise: c.minSubtotalPaise, label: c.label };
        }
        const ok = lines.filter((l) => l.available);
        const totals = computeTotals(
          ok.map((l) => ({ qty: l.qty, pricePaise: l.unitPricePaise, mrpPaise: l.unitMrpPaise, custom: l.custom, extraPaise: l.extraPaise })),
          { coupon, ...(shipping ? { shipping } : {}), ...(payment ? { payment } : {}) },
        );
        return { lines, totals, coupon: code ? couponStatus(code, coupon, totals) : null };
      },
    );

    app.get(
      '/coupons',
      { schema: { tags: ['cart'], summary: 'Offers a shopper can apply at checkout' } },
      async (_req, reply) => {
        const now = new Date();
        const rows = await db.coupon.findMany({
          where: { active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
          orderBy: { minSubtotalPaise: 'asc' },
        });
        reply.header('cache-control', 'public, max-age=60');
        return { items: rows.map((c) => ({ code: c.code, label: c.label, percent: c.percent, maxDiscountPaise: c.maxDiscountPaise, minSubtotalPaise: c.minSubtotalPaise, firstOrderOnly: c.firstOrderOnly })) };
      },
    );
  };

/** A studio piece: a blank garment with the customer's design. The stitch count comes from the preview;
    the digitizer confirms it on the proof before anything is made. */
function priceStudioLine(it: z.infer<typeof studioLineSchema>) {
  const s = it.studio;
  const g = studioGarment(s.garment);
  const problems: string[] = [];
  if (!g) problems.push('This garment is no longer available');
  else {
    if (!g.colours.includes(s.colour)) problems.push('This colour is no longer available');
    if (!g.views.some(([v]) => v === s.view)) problems.push('Choose the garment again');
    const sized = s.sizes ? Object.values(s.sizes).reduce((a, n) => a + (n ?? 0), 0) : null;
    if (g.sizes && sized !== it.qty) problems.push('Choose your sizes again');
    if (!g.sizes && s.sizes) problems.push('This piece comes in one size');
  }
  const price = g ? studioPrice(g, it.qty, s.stitches, s.source === 'upload') : null;
  return {
    variantId: `studio:${s.garment}`,
    available: problems.length === 0,
    problems,
    qty: it.qty,
    unitPricePaise: price?.unitPaise ?? 0,
    unitMrpPaise: price?.unitMrpPaise ?? 0,
    extraPaise: price?.digitizePaise ?? 0,
    custom: true,
    product: null,
  };
}

/** What to tell the shopper about the code they typed. */
function couponStatus(code: string, coupon: Coupon | null, totals: Totals) {
  if (!coupon) return { code, valid: false, applied: false, message: 'This code is not valid' };
  if (totals.subtotalPaise < coupon.minSubtotalPaise)
    return { code, valid: false, applied: false, message: `${code} needs a bag of ${formatINR(coupon.minSubtotalPaise)} or more` };
  const applied = totals.discountLabel === `Coupon ${code}`;
  return {
    code,
    valid: true,
    applied,
    message: applied ? `${code} applied. You save ${formatINR(totals.discountPaise)}` : 'Your Buy 2 offer saves you more, so we kept that',
  };
}
