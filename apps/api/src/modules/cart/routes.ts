import { z } from 'zod';
import {
  FLOWER_PRESETS,
  FONT_KEYS,
  THREAD_KEYS,
  checkName,
  computeTotals,
  unitPrice,
  type PersonalisationConfig,
} from '@store/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '../../lib/prisma.ts';

const lineSchema = z.object({
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
          where: { id: { in: items.map((i) => i.variantId) } },
          include: { product: true },
        });
        const byId = new Map(variants.map((v) => [v.id, v]));
        const lines = items.map((it) => {
          const v = byId.get(it.variantId);
          if (!v || v.product.status !== 'ACTIVE') {
            return { variantId: it.variantId, available: false, problems: ['This piece is no longer available'], qty: it.qty, unitPricePaise: 0, unitMrpPaise: 0, custom: false, product: null };
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
            custom,
            product: { id: p.id, slug: p.slug, name: p.name, sku: v.sku, colour: v.colourName, size: v.size },
          };
        });

        let couponInfo: { code: string; valid: boolean; message: string } | null = null;
        let coupon = null;
        if (code) {
          const now = new Date();
          const c = await db.coupon.findUnique({ where: { code } });
          const live = c && c.active && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt >= now);
          coupon = live ? { code: c.code, percent: c.percent, maxDiscountPaise: c.maxDiscountPaise, minSubtotalPaise: c.minSubtotalPaise, label: c.label } : null;
          couponInfo = { code, valid: !!live, message: live ? c.label : 'This code is not valid' };
        }
        const ok = lines.filter((l) => l.available);
        const totals = computeTotals(
          ok.map((l) => ({ qty: l.qty, pricePaise: l.unitPricePaise, mrpPaise: l.unitMrpPaise, custom: l.custom })),
          { coupon, ...(shipping ? { shipping } : {}), ...(payment ? { payment } : {}) },
        );
        return { lines, totals, coupon: couponInfo };
      },
    );
  };
