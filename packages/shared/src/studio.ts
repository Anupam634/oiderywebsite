/* Design studio: blank garments we embroider a customer's logo, motif or name on, and how they're priced.
   Shared by the studio page (instant price) and the cart API (the price we charge).
   Phase 3 moves the garment list and prices into the admin panel. */

export interface StudioGarment {
  id: string;
  name: string;
  /** photo views from @store/stitch: [view, label] */
  views: readonly (readonly [string, string])[];
  pricePaise: number;
  mrpPaise: number;
  /** sold in S–XXL (otherwise one size) */
  sizes: boolean;
  /** garment colours from @store/stitch GC */
  colours: readonly string[];
}

export const STUDIO_GARMENTS: readonly StudioGarment[] = [
  { id: 'tee', name: 'T-shirt', views: [['tee', 'On hanger'], ['model', 'On model']], pricePaise: 44_900, mrpPaise: 59_900, sizes: true, colours: ['white', 'kajal', 'neel', 'maroon', 'bottle', 'haldi', 'gulaab', 'chandi'] },
  { id: 'polo', name: 'Polo', views: [['polo', 'On hanger']], pricePaise: 64_900, mrpPaise: 84_900, sizes: true, colours: ['white', 'kajal', 'neel', 'maroon', 'bottle', 'sky', 'chandi'] },
  { id: 'shirt', name: 'Shirt', views: [['shirt', 'On hanger']], pricePaise: 89_900, mrpPaise: 119_900, sizes: true, colours: ['white', 'sky', 'neel', 'kajal', 'chandi', 'gulaab'] },
  { id: 'hoodie', name: 'Hoodie', views: [['hoodie', 'On hanger']], pricePaise: 119_900, mrpPaise: 149_900, sizes: true, colours: ['white', 'kajal', 'neel', 'maroon', 'bottle', 'chandi', 'gulaab'] },
  { id: 'cap', name: 'Cap', views: [['cap', 'Worn']], pricePaise: 34_900, mrpPaise: 44_900, sizes: false, colours: ['white', 'kajal', 'neel', 'maroon', 'bottle', 'haldi'] },
  { id: 'tote', name: 'Tote bag', views: [['tote', 'Flat lay']], pricePaise: 24_900, mrpPaise: 34_900, sizes: false, colours: ['natural', 'kajal', 'neel', 'maroon', 'bottle', 'haldi'] },
];
export const studioGarment = (id: string) => STUDIO_GARMENTS.find((g) => g.id === id);

export const STUDIO_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;
export type StudioSize = (typeof STUDIO_SIZES)[number];
export const STUDIO_MAX_QTY = 999;

/** quantity tiers: the garment gets the full discount, the embroidery half of it */
export const STUDIO_TIERS = [
  { min: 1, max: 9, off: 0 },
  { min: 10, max: 24, off: 0.08 },
  { min: 25, max: 49, off: 0.15 },
  { min: 50, max: Infinity, off: 0.22 },
] as const;
export type StudioTier = (typeof STUDIO_TIERS)[number];

/** one-time fee to turn an uploaded logo into a stitch file (our motifs and names don't need it) */
export const DIGITIZE_PAISE = 39_900;
export const DIGITIZE_FREE_FROM = 25;

export const studioTier = (qty: number): StudioTier => STUDIO_TIERS.find((t) => qty >= t.min && qty <= t.max) ?? STUDIO_TIERS[0];

/** embroidery per piece, by stitch count: ₹79 up to 4,000 stitches, then ₹18 per 1,000 */
const embroideryRupees = (stitches: number) => 79 + (Math.max(0, stitches - 4000) / 1000) * 18;

export interface StudioPrice {
  tier: StudioTier;
  garmentPaise: number;
  embroideryPaise: number;
  /** per piece */
  unitPaise: number;
  unitMrpPaise: number;
  /** one-time, for the whole line */
  digitizePaise: number;
}

/** Price of a studio piece. Whole rupees, like the shelf prices. */
export function studioPrice(g: StudioGarment, qty: number, stitches: number, uploaded: boolean): StudioPrice {
  const tier = studioTier(Math.max(1, qty));
  const garment = Math.round((g.pricePaise / 100) * (1 - tier.off)) * 100;
  const embroidery = Math.round(Math.round(embroideryRupees(stitches)) * (1 - tier.off / 2)) * 100;
  return {
    tier,
    garmentPaise: garment,
    embroideryPaise: embroidery,
    unitPaise: garment + embroidery,
    unitMrpPaise: g.mrpPaise + embroidery,
    digitizePaise: uploaded && qty < DIGITIZE_FREE_FROM ? DIGITIZE_PAISE : 0,
  };
}

/** what the cart sends for a studio piece */
export interface StudioLineSpec {
  garment: string;
  colour: string;
  view: string;
  placement: string;
  widthCm: number;
  stitches: number;
  /** 'upload' = the customer's logo (needs digitizing); 'make' = our motif and/or a name */
  source: 'upload' | 'make';
  /** size → count for garments with sizes; omitted for one-size pieces */
  sizes?: Partial<Record<StudioSize, number>>;
  /** what the design is, for the proof: file name or motif + name */
  label: string;
}
