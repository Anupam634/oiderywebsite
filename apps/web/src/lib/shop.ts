import { listingToParams, OCCASIONS, PRICE_BUCKETS, type CategoryNode, type ListingQuery } from '@store/shared';

/* Shop URLs: /shop/<cat>/<sub>?<filters>. A single sub-category lives in the path (good for SEO), the rest in the query. */

export function shopHref(q: Partial<ListingQuery>): string {
  const { cat, sub = [], ...rest } = q;
  const path = cat ? (sub.length === 1 ? `/shop/${cat}/${sub[0]}` : `/shop/${cat}`) : '/shop';
  const params = listingToParams({ ...rest, ...(cat && sub.length > 1 ? { sub } : {}), ...(!cat && sub.length ? { sub } : {}) });
  params.delete('page');
  const s = params.toString().replace(/%2C/g, ',');
  return s ? `${path}?${s}` : path;
}

const BUDGET_TYPES = ['ready', 'personalise', 'made'];

export function shopTitle(q: ListingQuery, tree: CategoryNode[]): string {
  const subNode = q.sub.length === 1 ? tree.flatMap((c) => c.children).find((c) => c.slug === q.sub[0]) : undefined;
  const catNode = tree.find((c) => c.slug === q.cat);
  if (q.q) return `Results for “${q.q}”`;
  if (subNode) return subNode.name;
  if (catNode) return catNode.name;
  if (q.price.length && q.type.length === 3 && BUDGET_TYPES.every((t) => q.type.includes(t))) {
    const top = PRICE_BUCKETS.filter((b) => q.price.includes(b.key)).pop();
    return top && top.key !== 'o5000' ? `Gifts under ₹${(top.max / 100 - 1).toLocaleString('en-IN')}` : 'Gifts';
  }
  if (q.price.length === 1 && q.price[0] === 'o5000') return 'Luxe pieces';
  if (q.type.length === 1 && q.type[0] === 'personalise') return 'Personalise it';
  if (q.occ.length === 1) return `${OCCASIONS.find((o) => o.key === q.occ[0])?.label} picks`;
  if (q.sort === 'new') return 'New arrivals';
  return 'All products';
}
