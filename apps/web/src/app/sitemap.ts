import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { getCategories } from '@/lib/catalog';
import { categoryHref, productHref } from '@/lib/links';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const url = (p: string) => `${site}${p}`;
  const fixed = ['/', '/shop', '/studio', '/about', '/contact', '/policies/shipping', '/policies/refunds', '/policies/terms', '/policies/privacy'].map((p) => ({ url: url(p) }));
  try {
    const [cats, list] = await Promise.all([getCategories(), api.products('pageSize=60')]);
    return [
      ...fixed,
      ...cats.flatMap((c) => [{ url: url(categoryHref(c.slug)) }, ...c.children.map((s) => ({ url: url(categoryHref(c.slug, s.slug)) }))]),
      ...list.items.filter((p) => !p.studio).map((p) => ({ url: url(productHref(p)), changeFrequency: 'weekly' as const })),
    ];
  } catch {
    return fixed;
  }
}
