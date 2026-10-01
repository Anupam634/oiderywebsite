import { FREE_SHIPPING_MIN_PAISE, GIFT_WRAP_PAISE } from '../catalog/constants';

/* Pricing rules shared by the API (source of truth) and the web app (instant display).
   Everything is integer paise. */

export interface UnitPriceInput {
  basePaise: number;
  mrpPaise: number | null;
  variantDeltaPaise: number;
  /** personalisation fee when the customer adds a name (0 when included or not chosen) */
  personalisationFeePaise: number;
  giftWrap: boolean;
}

export function unitPrice(i: UnitPriceInput): { pricePaise: number; mrpPaise: number } {
  const extras = i.variantDeltaPaise + i.personalisationFeePaise + (i.giftWrap ? GIFT_WRAP_PAISE : 0);
  return { pricePaise: i.basePaise + extras, mrpPaise: (i.mrpPaise ?? i.basePaise) + extras };
}

export interface Coupon {
  code: string;
  percent: number;
  maxDiscountPaise: number;
  minSubtotalPaise: number;
  label: string;
}

export type ShippingMethod = 'standard' | 'express';
export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet' | 'cod';

export const RULES = {
  buyTwoPercent: 10,
  standardShippingPaise: 7_900,
  expressShippingPaise: 14_900,
  upiDiscountPaise: 5_000,
  upiDiscountMinPaise: 49_900,
  codFeePaise: 4_900,
} as const;

export interface TotalsLine {
  qty: number;
  pricePaise: number;
  mrpPaise: number;
  /** made-for-you pieces: prepaid only */
  custom: boolean;
}

export interface Totals {
  itemCount: number;
  subtotalPaise: number;
  mrpTotalPaise: number;
  discountPaise: number;
  discountLabel: string | null;
  afterDiscountPaise: number;
  shippingPaise: number;
  upiDiscountPaise: number;
  codFeePaise: number;
  totalPaise: number;
  savedPaise: number;
  hasCustom: boolean;
  codAllowed: boolean;
  freeShippingLeftPaise: number;
}

/** Order totals. The better of the coupon and "buy 2, get 10% off" applies (they don't stack). */
export function computeTotals(
  lines: TotalsLine[],
  opts: { coupon?: Coupon | null; shipping?: ShippingMethod; payment?: PaymentMethod } = {},
): Totals {
  const itemCount = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.pricePaise, 0);
  const mrpTotal = lines.reduce((a, l) => a + l.qty * l.mrpPaise, 0);
  const hasCustom = lines.some((l) => l.custom);
  const payment = opts.payment === 'cod' && hasCustom ? 'upi' : opts.payment;

  const c = opts.coupon;
  const couponOff = c && subtotal >= c.minSubtotalPaise ? Math.min(Math.round((subtotal * c.percent) / 100), c.maxDiscountPaise) : 0;
  const autoOff = itemCount >= 2 ? Math.round((subtotal * RULES.buyTwoPercent) / 100) : 0;
  let discount = 0;
  let discountLabel: string | null = null;
  if (couponOff > 0 && couponOff >= autoOff) {
    discount = couponOff;
    discountLabel = `Coupon ${c!.code}`;
  } else if (autoOff > 0) {
    discount = autoOff;
    discountLabel = 'Buy 2, get 10% off';
  }

  const after = subtotal - discount;
  const shipping = opts.shipping === 'express' ? RULES.expressShippingPaise : after >= FREE_SHIPPING_MIN_PAISE || itemCount === 0 ? 0 : RULES.standardShippingPaise;
  const upiOff = payment === 'upi' && after >= RULES.upiDiscountMinPaise ? RULES.upiDiscountPaise : 0;
  const cod = payment === 'cod' ? RULES.codFeePaise : 0;
  const total = Math.max(0, after + shipping - upiOff + cod);

  return {
    itemCount,
    subtotalPaise: subtotal,
    mrpTotalPaise: mrpTotal,
    discountPaise: discount,
    discountLabel,
    afterDiscountPaise: after,
    shippingPaise: shipping,
    upiDiscountPaise: upiOff,
    codFeePaise: cod,
    totalPaise: total,
    savedPaise: mrpTotal - subtotal + discount + upiOff,
    hasCustom,
    codAllowed: !hasCustom,
    freeShippingLeftPaise: Math.max(0, FREE_SHIPPING_MIN_PAISE - subtotal),
  };
}
