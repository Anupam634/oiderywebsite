import type { ProductType } from './constants';
import type { ListingQuery } from './query';

/* Shop URL helpers without zod, so browser bundles that only build links don't pull in the schema. */

/** URL-facing type keys (lower case, short) <-> database enum */
export const TYPE_PARAM: Record<string, ProductType> = {
  ready: 'READY',
  personalise: 'PERSONALISE',
  made: 'MADE_TO_ORDER',
  logo: 'LOGO',
};
export const TYPE_PARAM_OF: Record<ProductType, string> = Object.fromEntries(
  Object.entries(TYPE_PARAM).map(([k, v]) => [v, k]),
) as Record<ProductType, string>;

/** Inverse of the listing schema: a query object back to URL params (only non-default values). */
export function listingToParams(q: Partial<ListingQuery>): URLSearchParams {
  const p = new URLSearchParams();
  if (q.cat) p.set('cat', q.cat);
  for (const k of ['sub', 'type', 'price', 'occ', 'fam'] as const) {
    const v = q[k];
    if (v && v.length) p.set(k, v.join(','));
  }
  if (q.rating) p.set('rating', 'top');
  if (q.sort && q.sort !== 'popular') p.set('sort', q.sort);
  if (q.q) p.set('q', q.q);
  if (q.page && q.page > 1) p.set('page', String(q.page));
  return p;
}
