import type { CategoryNode, ProductCard } from '@store/shared';

/* One place for storefront URLs. */
export const productHref = (p: Pick<ProductCard, 'slug' | 'studio'>) =>
  p.studio ? `/studio?g=${p.studio.garment}${p.studio.sample ? `&s=${p.studio.sample}` : ''}` : `/p/${p.slug}`;

export const categoryHref = (cat: string, sub?: string) => (sub ? `/shop/${cat}/${sub}` : `/shop/${cat}`);

export function subHref(tree: CategoryNode[], sub: string) {
  const parent = tree.find((c) => c.children.some((ch) => ch.slug === sub));
  return parent ? categoryHref(parent.slug, sub) : '/shop';
}

/** shortcut links used across the site */
export const SHOP_LINKS = {
  all: '/shop',
  personalised: '/shop?type=personalise',
  new: '/shop?sort=new',
  under999: '/shop?price=u999&type=ready,personalise,made',
  under1999: '/shop?price=u999,u1999&type=ready,personalise,made',
  under4999: '/shop?price=u999,u1999,u4999&type=ready,personalise,made',
  luxe: '/shop?price=o5000',
  occasion: (key: string) => `/shop?occ=${key}`,
};
