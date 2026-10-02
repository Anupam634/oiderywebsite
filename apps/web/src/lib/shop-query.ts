import { listingQuerySchema, type ListingQuery } from '@store/shared';

/* Server side: /shop/<cat>/<sub>?<filters> to a listing query. Kept apart from lib/shop so zod stays out of the browser. */
export function parseShop(slug: string[] | undefined, search: Record<string, string | string[] | undefined>): ListingQuery {
  const [cat, sub] = slug ?? [];
  const flat = Object.fromEntries(Object.entries(search).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v]));
  return listingQuerySchema.parse({ ...flat, ...(cat ? { cat } : {}), ...(sub ? { sub: [sub, flat.sub].filter(Boolean).join(',') } : {}), pageSize: '60' });
}
