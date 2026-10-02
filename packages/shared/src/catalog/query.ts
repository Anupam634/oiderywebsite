import { z } from 'zod';
import { COLOUR_FAMILIES, OCCASIONS, PRICE_BUCKETS, SORTS } from './constants';
import { TYPE_PARAM } from './params';

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
