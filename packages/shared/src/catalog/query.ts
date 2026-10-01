import { z } from 'zod';
import { COLOUR_FAMILIES, OCCASIONS, PRICE_BUCKETS, SORTS, type ProductType } from './constants';

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

const csv = <T extends string>(allowed: readonly T[]) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      const raw = (Array.isArray(v) ? v.join(',') : (v ?? '')).split(',').map((s) => s.trim().toLowerCase());
      return [...new Set(raw.filter((s): s is T => (allowed as readonly string[]).includes(s)))];
    });

const slugList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) =>
    [...new Set((Array.isArray(v) ? v.join(',') : (v ?? '')).split(',').map((s) => s.trim().toLowerCase()))].filter((s) =>
      /^[a-z0-9-]{1,60}$/.test(s),
    ),
  );

/** Query for the shop listing. Unknown values are dropped rather than rejected, so old links keep working. */
export const listingQuerySchema = z.object({
  cat: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional()
    .catch(undefined),
  sub: slugList,
  type: csv(Object.keys(TYPE_PARAM)),
  price: csv(PRICE_BUCKETS.map((b) => b.key)),
  occ: csv(OCCASIONS.map((o) => o.key)),
  fam: csv(COLOUR_FAMILIES.map((f) => f.key)),
  rating: z
    .union([z.literal('top'), z.literal('1'), z.literal('true')])
    .optional()
    .transform((v) => !!v)
    .catch(false),
  sort: z
    .enum(SORTS.map((s) => s.key) as [string, ...string[]])
    .optional()
    .catch(undefined)
    .transform((v) => v ?? 'popular'),
  q: z.string().trim().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).optional().catch(undefined).transform((v) => v ?? 1),
  pageSize: z.coerce.number().int().min(1).max(60).optional().catch(undefined).transform((v) => v ?? 24),
});
export type ListingQuery = z.output<typeof listingQuerySchema>;

/** Inverse of the schema: a query object back to URL params (only non-default values). */
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
