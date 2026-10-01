import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listingToParams } from '@store/shared';
import { ShopView } from '@/components/shop/ShopView';
import { api } from '@/lib/api';
import { getCategories } from '@/lib/catalog';
import { parseShop, shopTitle } from '@/lib/shop';
import '@/styles/shop.css';

type Props = { params: Promise<{ slug?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(props: Props) {
  const [{ slug }, search, tree] = await Promise.all([props.params, props.searchParams, getCategories()]);
  if (slug && slug.length > 2) notFound();
  const q = parseShop(slug, search);
  if (q.cat && tree.length && !tree.some((c) => c.slug === q.cat)) notFound();
  return { q, tree };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { q, tree } = await load(props);
  const title = shopTitle(q, tree);
  const cat = tree.find((c) => c.slug === q.cat);
  return { title, description: cat?.blurb ?? `${title}: embroidered clothing, décor and gifts, stitched in our studio.` };
}

export default async function ShopPage(props: Props) {
  const { q, tree } = await load(props);
  const listing = await api.products(listingToParams({ ...q, pageSize: 60 }).toString() + '&pageSize=60');
  return <ShopView q={q} tree={tree} listing={listing} title={shopTitle(q, tree)} />;
}
