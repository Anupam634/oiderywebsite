import { PRICE_BUCKETS, TOP_RATED_MIN, TYPE_LABEL } from './constants';
import { TYPE_PARAM, type ListingQuery } from './query';
import type { CatalogIndexItem } from './types';

export type FacetKey = 'cat' | 'sub' | 'type' | 'price' | 'occ' | 'fam' | 'rating';

export interface Facets {
  cat: Record<string, number>;
  sub: Record<string, number>;
  type: Record<string, number>;
  price: Record<string, number>;
  occ: Record<string, number>;
  fam: Record<string, number>;
  rating: number;
  /** everything matching the other filters, ignoring the category (the "All products" count) */
  all: number;
}

const haystack = (p: CatalogIndexItem) =>
  [p.name, p.techLine, p.categoryName, p.parentName, p.occasions.join(' '), TYPE_LABEL[p.type], p.alt].join(' ').toLowerCase();

/** Every word must appear somewhere ("hoops" also finds "hoop"). */
export function matchesSearch(p: CatalogIndexItem, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = haystack(p);
  return words.every((w) => hay.includes(w) || (w.length > 3 && w.endsWith('s') && hay.includes(w.slice(0, -1))));
}

const inBucket = (p: CatalogIndexItem, key: string) => {
  const b = PRICE_BUCKETS.find((x) => x.key === key);
  return !!b && p.pricePaise >= b.min && p.pricePaise < b.max;
};

/** Does p pass every filter in q? `skip` ignores one group, which is how option counts are computed. */
export function matches(p: CatalogIndexItem, q: ListingQuery, skip?: FacetKey): boolean {
  if (skip !== 'cat' && q.cat && p.parent !== q.cat) return false;
  if (skip !== 'cat' && skip !== 'sub' && q.sub.length && !q.sub.includes(p.category)) return false;
  if (skip !== 'type' && q.type.length && !q.type.some((t) => TYPE_PARAM[t] === p.type)) return false;
  if (skip !== 'price' && q.price.length && !q.price.some((k) => inBucket(p, k))) return false;
  if (skip !== 'occ' && q.occ.length && !p.occasions.some((o) => (q.occ as string[]).includes(o))) return false;
  if (skip !== 'fam' && q.fam.length && !(q.fam as string[]).includes(p.colourFamily)) return false;
  if (skip !== 'rating' && q.rating && p.ratingAvg < TOP_RATED_MIN) return false;
  if (q.q && !matchesSearch(p, q.q)) return false;
  return true;
}

const SORTERS: Record<string, (a: CatalogIndexItem, b: CatalogIndexItem) => number> = {
  popular: (a, b) => b.popularity - a.popularity,
  new: (a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.popularity - a.popularity,
  'price-asc': (a, b) => a.pricePaise - b.pricePaise || b.popularity - a.popularity,
  'price-desc': (a, b) => b.pricePaise - a.pricePaise || b.popularity - a.popularity,
  rating: (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount,
};

function count(items: CatalogIndexItem[], key: (p: CatalogIndexItem) => string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of items) for (const k of key(p)) out[k] = (out[k] ?? 0) + 1;
  return out;
}

/** Option counts: for each group, products matching every *other* filter. */
export function facetCounts(items: CatalogIndexItem[], q: ListingQuery): Facets {
  const without = (skip: FacetKey) => items.filter((p) => matches(p, q, skip));
  const forCat = without('cat');
  const priceKeys = (p: CatalogIndexItem) => PRICE_BUCKETS.filter((b) => inBucket(p, b.key)).map((b) => b.key);
  return {
    cat: count(forCat, (p) => [p.parent]),
    sub: count(without('sub'), (p) => [p.category]),
    type: count(without('type'), (p) => [Object.keys(TYPE_PARAM).find((k) => TYPE_PARAM[k] === p.type)!]),
    price: count(without('price'), priceKeys),
    occ: count(without('occ'), (p) => p.occasions),
    fam: count(without('fam'), (p) => [p.colourFamily]),
    rating: without('rating').filter((p) => p.ratingAvg >= TOP_RATED_MIN).length,
    all: forCat.length,
  };
}

/** Filter + sort (pagination is up to the caller). */
export function applyListing(items: CatalogIndexItem[], q: ListingQuery): CatalogIndexItem[] {
  return items.filter((p) => matches(p, q)).sort(SORTERS[q.sort] ?? SORTERS.popular);
}

/** How many filters are active (for the "Filter (3)" badge on phones). */
export function activeFilterCount(q: ListingQuery): number {
  return (q.cat ? 1 : 0) + q.sub.length + q.type.length + q.price.length + q.occ.length + q.fam.length + (q.rating ? 1 : 0) + (q.q ? 1 : 0);
}
