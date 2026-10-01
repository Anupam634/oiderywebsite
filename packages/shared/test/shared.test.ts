import { describe, expect, it } from 'vitest';
import {
  studioGarment,
  studioPrice,
  checkoutErrors,
  applyListing,
  checkName,
  cleanName,
  computeTotals,
  facetCounts,
  formatINR,
  listingQuerySchema,
  listingToParams,
  matchesSearch,
  percentOff,
  unitPrice,
  type CatalogIndexItem,
} from '../src';

const item = (o: Partial<CatalogIndexItem>): CatalogIndexItem => ({
  id: o.slug ?? 'x', slug: 'x', name: 'X', techLine: '', alt: '', category: 'kurtas', categoryName: 'Kurtas & sets',
  parent: 'clothing', parentName: 'Clothing', type: 'READY', pricePaise: 100_000, ratingAvg: 4.7, ratingCount: 10,
  occasions: [], colourFamily: 'red', popularity: 1, publishedAt: '2026-09-01T00:00:00.000Z', ...o,
});
const ITEMS = [
  item({ slug: 'kurta', name: 'Lal Yoke Embroidered Kurta', pricePaise: 249_900, popularity: 93, occasions: ['diwali'], ratingAvg: 4.8 }),
  item({ slug: 'tote', name: 'Phoolwari Name Tote', category: 'namegifts', parent: 'gifts', parentName: 'Gifts', type: 'PERSONALISE', pricePaise: 119_900, popularity: 99, colourFamily: 'multi', ratingAvg: 4.9 }),
  item({ slug: 'wreath', name: 'Gulaab Wreath Hoop Art', category: 'hoops', parent: 'home', categoryName: 'Hoop art', parentName: 'Home décor', pricePaise: 189_900, popularity: 86, colourFamily: 'neutral', ratingAvg: 5, publishedAt: '2026-09-20T00:00:00.000Z' }),
  item({ slug: 'kit', name: 'Poppy Field DIY Kit', category: 'kits', parent: 'gifts', parentName: 'Gifts', pricePaise: 99_900, popularity: 63, occasions: ['diwali'], ratingAvg: 4.6 }),
  item({ slug: 'polo', name: 'Logo Polo', category: 'logo', parent: 'corporate', parentName: 'Corporate', type: 'LOGO', pricePaise: 57_900, popularity: 56, colourFamily: 'neutral' }),
];
const q = (o: Record<string, string>) => listingQuerySchema.parse(o);

describe('money', () => {
  it('formats paise as whole rupees, Indian grouping', () => {
    expect(formatINR(119_900)).toBe('₹1,199');
    expect(formatINR(1_499_900)).toBe('₹14,999');
    expect(percentOff(119_900, 149_900)).toBe(20);
    expect(percentOff(57_900, null)).toBe(0);
  });
});

describe('listing query', () => {
  it('drops unknown values instead of failing', () => {
    const r = q({ type: 'ready,bogus', price: 'u999', fam: 'nope', sort: 'weird', page: '-3' });
    expect(r.type).toEqual(['ready']);
    expect(r.price).toEqual(['u999']);
    expect(r.fam).toEqual([]);
    expect(r.sort).toBe('popular');
    expect(r.page).toBe(1);
  });
  it('round-trips to URL params', () => {
    const r = q({ cat: 'gifts', type: 'personalise', sort: 'new', rating: 'top' });
    expect(listingToParams(r).toString()).toBe('cat=gifts&type=personalise&rating=top&sort=new');
  });
});

describe('filters, facets, sort', () => {
  it('filters by category and type, sorted by popularity', () => {
    expect(applyListing(ITEMS, q({ cat: 'gifts' })).map((p) => p.slug)).toEqual(['tote', 'kit']);
    expect(applyListing(ITEMS, q({ type: 'personalise,logo' })).map((p) => p.slug)).toEqual(['tote', 'polo']);
  });
  it('price buckets use rupee boundaries (₹999 is "under ₹999", ₹1,000 is not)', () => {
    expect(applyListing(ITEMS, q({ price: 'u999' })).map((p) => p.slug)).toEqual(['kit', 'polo']);
    expect(applyListing(ITEMS, q({ price: 'u1999' })).map((p) => p.slug)).toEqual(['tote', 'wreath']);
  });
  it('sorts by price, newness and rating', () => {
    expect(applyListing(ITEMS, q({ sort: 'price-asc' }))[0]!.slug).toBe('polo');
    expect(applyListing(ITEMS, q({ sort: 'price-desc' }))[0]!.slug).toBe('kurta');
    expect(applyListing(ITEMS, q({ sort: 'new' }))[0]!.slug).toBe('wreath');
    expect(applyListing(ITEMS, q({ sort: 'rating' }))[0]!.slug).toBe('wreath');
  });
  it('facet counts ignore their own group', () => {
    const f = facetCounts(ITEMS, q({ cat: 'gifts', occ: 'diwali' }));
    expect(f.cat).toEqual({ clothing: 1, gifts: 1 }); // diwali kurta + diwali kit
    expect(f.occ).toEqual({ diwali: 1 }); // within gifts
    expect(f.all).toBe(2);
    expect(f.rating).toBe(0);
  });
  it('search needs every word and tolerates plurals', () => {
    expect(matchesSearch(ITEMS[2]!, 'hoops')).toBe(true);
    expect(matchesSearch(ITEMS[2]!, 'hoop rose')).toBe(false);
    expect(applyListing(ITEMS, q({ q: 'name tote' })).map((p) => p.slug)).toEqual(['tote']);
  });
});

describe('names', () => {
  it('keeps Hindi and letters, drops emoji', () => {
    expect(cleanName('Priya 💖!')).toBe('Priya !');
    expect(checkName('  मीरा  ', 12)).toEqual({ ok: true, text: 'मीरा' });
    expect(checkName('🎉', 12)).toEqual({ ok: false, reason: 'empty', text: '' });
    expect(checkName('Abcdefghijklmno', 14).ok).toBe(false);
  });
});

describe('pricing', () => {
  it('adds variant, name fee and gift wrap to price and MRP', () => {
    expect(unitPrice({ basePaise: 189_900, mrpPaise: 229_900, variantDeltaPaise: 0, personalisationFeePaise: 14_900, giftWrap: true })).toEqual({ pricePaise: 209_700, mrpPaise: 249_700 });
  });
  it('picks the better of coupon and buy-2, then shipping, UPI and COD rules', () => {
    const lines = [{ qty: 1, pricePaise: 119_900, mrpPaise: 149_900, custom: true }, { qty: 1, pricePaise: 249_900, mrpPaise: 319_900, custom: false }];
    const coupon = { code: 'TAANKA10', percent: 10, maxDiscountPaise: 30_000, minSubtotalPaise: 0, label: '10% off' };
    const t = computeTotals(lines, { coupon, payment: 'upi' });
    expect(t.subtotalPaise).toBe(369_800);
    expect(t.discountPaise).toBe(36_980); // buy-2 10% beats the ₹300-capped coupon
    expect(t.discountLabel).toBe('Buy 2, get 10% off');
    expect(t.shippingPaise).toBe(0);
    expect(t.upiDiscountPaise).toBe(5_000);
    expect(t.totalPaise).toBe(369_800 - 36_980 - 5_000);
    expect(t.codAllowed).toBe(false);
    expect(computeTotals(lines, { payment: 'cod' }).codFeePaise).toBe(0); // COD silently not used for custom pieces
    expect(computeTotals([{ qty: 1, pricePaise: 89_900, mrpPaise: 99_900, custom: false }], { payment: 'cod' })).toMatchObject({ shippingPaise: 7_900, codFeePaise: 4_900, totalPaise: 89_900 + 7_900 + 4_900 });
  });
});

describe('checkout details', () => {
  const good = {
    phone: '9876543210', email: '', whatsappUpdates: true, pincode: '400050', name: 'Priya Sharma', line1: 'Flat 402',
    line2: 'Linking Road', landmark: '', city: 'Mumbai', state: 'Maharashtra', addressType: 'home', gst: null, giftNote: null,
  };
  it('accepts a complete address', () => expect(checkoutErrors(good)).toEqual({}));
  it('names each bad field once', () => {
    expect(checkoutErrors({ ...good, phone: '12345', pincode: '012345', state: '', gst: { gstin: 'abc', business: '' } })).toEqual({
      phone: 'Enter a 10-digit mobile number',
      pincode: 'Enter a 6-digit pincode',
      state: 'Choose your state',
      gstin: 'Enter a valid 15-character GSTIN',
      business: 'Enter your business name',
    });
  });
  it('takes a lower-case GSTIN', () => expect(checkoutErrors({ ...good, gst: { gstin: '27abcde1234f1z5', business: 'Chai Co' } })).toEqual({}));
});

describe('studio pricing', () => {
  const tee = studioGarment('tee')!;
  it('matches the design prototype', () => {
    // 1 tee, 5,200 stitches: ₹449 + ₹(79 + 21.6 → 101) embroidery, digitizing for an upload
    expect(studioPrice(tee, 1, 5200, true)).toMatchObject({ unitPaise: 55_000, embroideryPaise: 10_100, digitizePaise: 39_900 });
    // 30 tees: 15% off the tee, 7.5% off embroidery, free digitizing
    expect(studioPrice(tee, 30, 5200, true)).toMatchObject({ garmentPaise: 38_200, embroideryPaise: 9_300, digitizePaise: 0 });
    expect(studioPrice(tee, 1, 3000, false).digitizePaise).toBe(0);
  });
  it('adds one-time charges once', () => {
    const t = computeTotals([{ qty: 3, pricePaise: 10_000, mrpPaise: 10_000, custom: true, extraPaise: 39_900 }]);
    expect(t.subtotalPaise).toBe(69_900);
  });
});
