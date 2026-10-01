import { z } from 'zod';
import {
  FLOWER_PRESETS,
  FONT_KEYS,
  MAKE_DAYS,
  STUDIO_MAX_QTY,
  STUDIO_PLACEMENTS,
  STUDIO_SIZES,
  THREAD_KEYS,
  checkName,
  computeTotals,
  formatINR,
  studioGarment,
  studioPrice,
  unitPrice,
  type Coupon,
  type PersonalisationConfig,
  type Totals,
} from '@store/shared';
import type { Db } from '../../lib/prisma.ts';

/* Prices a bag on the server. Used by POST /v1/cart/price (shown at checkout) and by order creation
   (the amount we charge), so both always agree. */

export const catalogLineSchema = z.object({
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
  /** pet portraits: the name stitched below */
  petName: z.string().trim().max(20).optional(),
  /** uploads made at add-to-bag time (preview render, pet photo) */
  uploads: z.array(z.string().max(40)).max(4).optional(),
});
export const studioLineSchema = z.object({
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
  uploads: z.array(z.string().max(40)).max(4).optional(),
});
export const lineSchema = z.union([catalogLineSchema, studioLineSchema]);
export const cartBodySchema = z.object({
  items: z.array(lineSchema).max(50),
  coupon: z.string().trim().toUpperCase().max(30).optional(),
  shipping: z.enum(['standard', 'express']).optional(),
  payment: z.enum(['upi', 'card', 'netbanking', 'wallet', 'cod']).optional(),
});
export type CartBody = z.infer<typeof cartBodySchema>;
export type CartLineInput = z.infer<typeof lineSchema>;

/** what an order line needs beyond the price */
export interface LineFacts {
  kind: 'CATALOGUE' | 'STUDIO';
  productId: string | null;
  variantId: string | null;
  slug: string | null;
  sku: string;
  name: string;
  description: string;
  imagePath: string | null;
  hsnCode: string;
  gstRule: string;
  gstRateBp: number;
  trackStock: boolean;
  /** making time before it can ship */
  makeDays: number;
  /** a stitch proof is sent before making it */
  needsProof: boolean;
}

export interface PricedLine {
  variantId: string;
  available: boolean;
  problems: string[];
  qty: number;
  unitPricePaise: number;
  unitMrpPaise: number;
  extraPaise: number;
  custom: boolean;
  product: { id: string; slug: string; name: string; sku: string; colour: string; size: string | null } | null;
  /** server-side details for order creation (not sent to the browser) */
  facts: LineFacts | null;
  input: CartLineInput;
}

export interface CouponStatus {
  code: string;
  valid: boolean;
  applied: boolean;
  message: string;
}

export interface PricedCart {
  lines: PricedLine[];
  totals: Totals;
  coupon: Coupon | null;
  couponStatus: CouponStatus | null;
}

const FONT_NAME: Record<string, string> = { script: 'Script', classic: 'Classic', bold: 'Bold', hindi: 'हिंदी' };
const THREAD_NAME: Record<string, string> = {
  rani: 'Rani', haldi: 'Haldi', mor: 'Mor', neel: 'Neel', sindoor: 'Sindoor', mehendi: 'Mehendi', kesar: 'Kesar', jamun: 'Jamun',
  gulaab: 'Gulaab', moti: 'Moti', kajal: 'Kajal', sona: 'Sona',
};
const GARMENT_COLOUR: Record<string, string> = {
  white: 'White', natural: 'Natural canvas', kajal: 'Kajal black', neel: 'Neel navy', maroon: 'Maroon', bottle: 'Bottle green',
  haldi: 'Haldi yellow', gulaab: 'Gulaab pink', chandi: 'Chandi grey', sky: 'Sky blue',
};

export async function priceCart(db: Db, body: CartBody, ctx: { customerId?: string | null } = {}): Promise<PricedCart> {
  const { items, coupon: code, shipping, payment } = body;
  const variants = await db.productVariant.findMany({
    where: { id: { in: items.flatMap((i) => ('variantId' in i ? [i.variantId] : [])) } },
    include: { product: { include: { images: { where: { role: 'MAIN' }, take: 1 } } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  // the same variant can appear on several lines (e.g. two names); stock must cover them together
  const wanted = new Map<string, number>();
  for (const it of items) if ('variantId' in it) wanted.set(it.variantId, (wanted.get(it.variantId) ?? 0) + it.qty);

  const lines = items.map((it): PricedLine => {
    if ('studio' in it) return priceStudioLine(it);
    const v = byId.get(it.variantId);
    if (!v || v.product.status !== 'ACTIVE') {
      return { variantId: it.variantId, available: false, problems: ['This piece is no longer available'], qty: it.qty, unitPricePaise: 0, unitMrpPaise: 0, extraPaise: 0, custom: false, product: null, facts: null, input: it };
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
    const inStock = v.trackStock ? v.stock : 50;
    const maxQty = p.isUnique ? Math.min(1, inStock) : inStock;
    const total = wanted.get(v.id) ?? it.qty;
    if (total > maxQty) problems.push(maxQty === 0 ? 'Sold out' : `Only ${maxQty} available`);
    const price = unitPrice({
      basePaise: p.pricePaise,
      mrpPaise: p.mrpPaise,
      variantDeltaPaise: v.priceDeltaPaise,
      personalisationFeePaise: personalised && perso ? perso.fee : 0,
      giftWrap: !!it.giftWrap,
    });
    const custom = p.shipMode !== 'READY' || personalised || v.size === 'Custom' || p.petPhoto;
    const desc = [
      v.colourName,
      v.size ?? '',
      it.personalisation && personalised
        ? `“${it.personalisation.text.trim()}” in ${FONT_NAME[it.personalisation.font] ?? it.personalisation.font}, ${THREAD_NAME[it.personalisation.thread] ?? it.personalisation.thread} thread`
        : '',
      it.personalisation?.flowers !== undefined ? `${FLOWER_PRESETS[it.personalisation.flowers]?.name ?? ''} flowers` : '',
      p.petPhoto && it.petName ? `“${it.petName}” stitched below` : '',
      it.giftWrap ? 'Gift wrapped' : '',
    ].filter(Boolean);
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
      facts: {
        kind: 'CATALOGUE',
        productId: p.id,
        variantId: v.id,
        slug: p.slug,
        sku: v.sku,
        name: p.name,
        description: desc.join(' · '),
        imagePath: p.images[0]?.path ?? null,
        hsnCode: p.hsnCode,
        gstRule: p.gstRule,
        gstRateBp: p.gstRateBp,
        trackStock: v.trackStock,
        makeDays: p.madeDays ?? (custom ? MAKE_DAYS.custom : MAKE_DAYS.ready),
        needsProof: personalised || p.petPhoto,
      },
      input: it,
    };
  });

  let coupon: Coupon | null = null;
  let couponProblem: string | null = null;
  if (code) {
    const now = new Date();
    const c = await db.coupon.findUnique({ where: { code } });
    const live = !!(c && c.active && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt >= now));
    if (c && live) {
      if (c.maxUses !== null && c.usedCount >= c.maxUses) couponProblem = 'This offer has run out';
      else if (c.firstOrderOnly && ctx.customerId && (await hasPlacedOrder(db, ctx.customerId))) couponProblem = `${c.code} is for your first order`;
      else coupon = { code: c.code, percent: c.percent, maxDiscountPaise: c.maxDiscountPaise, minSubtotalPaise: c.minSubtotalPaise, label: c.label };
    }
  }
  const ok = lines.filter((l) => l.available);
  const totals = computeTotals(
    ok.map((l) => ({ qty: l.qty, pricePaise: l.unitPricePaise, mrpPaise: l.unitMrpPaise, custom: l.custom, extraPaise: l.extraPaise })),
    { coupon, ...(shipping ? { shipping } : {}), ...(payment ? { payment } : {}) },
  );
  return { lines, totals, coupon, couponStatus: code ? couponStatus(code, coupon, couponProblem, totals) : null };
}

export const hasPlacedOrder = async (db: Db, customerId: string) =>
  (await db.order.count({ where: { customerId, status: { notIn: ['PENDING_PAYMENT', 'CANCELLED'] } } })) > 0;

/** A studio piece: a blank garment with the customer's design. The stitch count comes from the preview;
    the digitizer confirms it on the proof before anything is made. */
function priceStudioLine(it: z.infer<typeof studioLineSchema>): PricedLine {
  const s = it.studio;
  const g = studioGarment(s.garment);
  const problems: string[] = [];
  if (!g) problems.push('This garment is no longer available');
  else {
    if (!g.colours.includes(s.colour)) problems.push('This colour is no longer available');
    if (!g.views.some(([v]) => v === s.view)) problems.push('Choose the garment again');
    const area = STUDIO_PLACEMENTS[s.view]?.[s.placement];
    if (!area) problems.push('Choose where to stitch it again');
    else if (s.widthCm < area.min - 0.25 || s.widthCm > area.max + 0.25) problems.push(`${area.name} designs can be ${area.min}–${area.max} cm wide`);
    const sized = s.sizes ? Object.values(s.sizes).reduce((a, n) => a + (n ?? 0), 0) : null;
    if (g.sizes && sized !== it.qty) problems.push('Choose your sizes again');
    if (!g.sizes && s.sizes) problems.push('This piece comes in one size');
  }
  const price = g ? studioPrice(g, it.qty, s.stitches, s.source === 'upload') : null;
  const mix = s.sizes ? STUDIO_SIZES.filter((k) => s.sizes![k]).map((k) => `${k}×${s.sizes![k]}`).join(', ') : `${it.qty} pcs`;
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
    facts: g
      ? {
          kind: 'STUDIO',
          productId: null,
          variantId: null,
          slug: null,
          sku: `STUDIO-${g.id.toUpperCase()}-${s.colour.toUpperCase()}`,
          name: `${g.name} with ${s.source === 'upload' ? 'your logo' : 'your design'}`,
          description: [GARMENT_COLOUR[s.colour] ?? s.colour, `${STUDIO_PLACEMENTS[s.view]?.[s.placement]?.name ?? s.placement}, ${s.widthCm} cm`, s.label, mix].filter(Boolean).join(' · '),
          imagePath: null,
          hsnCode: g.hsn,
          gstRule: g.gstRule,
          gstRateBp: g.gstRateBp,
          trackStock: false,
          makeDays: MAKE_DAYS.custom,
          needsProof: true,
        }
      : null,
    input: it,
  };
}

function couponStatus(code: string, coupon: Coupon | null, problem: string | null, totals: Totals): CouponStatus {
  if (problem) return { code, valid: false, applied: false, message: problem };
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
