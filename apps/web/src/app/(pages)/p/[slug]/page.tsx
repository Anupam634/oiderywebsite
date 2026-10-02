import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { BRAND } from '@store/shared';
import { ProductView } from '@/components/product/ProductView';
import { RecentlyViewed } from '@/components/RecentlyViewed';
import { api } from '@/lib/api';
import { productHref } from '@/lib/links';
import { media } from '@/lib/media';
import '@/styles/product.css';

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 60;
// no pages at build time (builds don't need the API): each product renders on its first visit, is then served from
// the cache and refreshed every minute or when the catalogue changes. Links to it prefetch the whole page.
export const generateStaticParams = async () => [];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await api.product((await params).slug);
  if (!p) notFound();
  return {
    title: p.name,
    description: p.story.slice(0, 155),
    openGraph: { title: p.name, description: p.story.slice(0, 155), images: [media(p.image.path)] },
    alternates: { canonical: `/p/${p.slug}` },
  };
}

export default async function ProductPage({ params }: Props) {
  const p = await api.product((await params).slug);
  if (!p) notFound();
  if (p.studio) redirect(productHref(p));
  const inStock = p.variants.some((v) => !v.trackStock || v.stock > 0);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: p.code,
    description: p.story,
    image: p.gallery.map((g) => media(g.path)),
    brand: { '@type': 'Brand', name: BRAND.name },
    aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating.avg, reviewCount: p.rating.count },
    offers: { '@type': 'Offer', priceCurrency: 'INR', price: (p.pricePaise / 100).toFixed(0), availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <ProductView p={p} />
      <RecentlyViewed exclude={p.slug} />
    </>
  );
}
