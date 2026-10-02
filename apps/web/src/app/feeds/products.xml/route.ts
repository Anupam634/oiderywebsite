import { BRAND, type ProductCard, type ProductDetail } from '@store/shared';
import { api } from '@/lib/api';
import { productHref } from '@/lib/links';
import { media } from '@/lib/media';

/* Product feed for Google Merchant Center (free listings, Shopping ads) and Meta Commerce Manager (Instagram
   Shopping tags, catalogue ads). Both read RSS 2.0 with Google's g: fields. One item per product, with the
   product slug as its id: the same id the Meta Pixel and GA4 send, so ads and the catalogue line up.
   Logo merch is left out (its price depends on the quantity, chosen in the studio). Built on request (catalogue
   calls are cached) and cached by the CDN for an hour; never prerendered at build time, when the API may be away. */

export const dynamic = 'force-dynamic';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const abs = (path: string) => {
  const u = media(path);
  return /^https?:/.test(u) ? u : `${SITE}${u.startsWith('/') ? '' : '/'}${u}`;
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const price = (paise: number) => `${(paise / 100).toFixed(2)} INR`;
/** Google's product taxonomy for the shop's top-level categories (left out where it's a guess: Google infers it) */
const GOOGLE_CATEGORY: Record<string, string> = { clothing: 'Apparel & Accessories > Clothing', home: 'Home & Garden > Decor' };
const SHIPS: Record<ProductDetail['shipMode'], string> = { READY: 'Ready to ship', MADE: 'Made to order', CUSTOM: 'Personalised' };

async function allCards(): Promise<ProductCard[]> {
  const out: ProductCard[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await api.products(`pageSize=60&page=${page}`);
    out.push(...r.items);
    if (out.length >= r.total || !r.items.length) break;
  }
  return out;
}

/** details for each card, a few at a time */
async function details(cards: ProductCard[]): Promise<ProductDetail[]> {
  const out: ProductDetail[] = [];
  for (let i = 0; i < cards.length; i += 6) {
    const batch = await Promise.all(cards.slice(i, i + 6).map((c) => api.product(c.slug)));
    out.push(...batch.filter((p): p is ProductDetail => !!p));
  }
  return out;
}

function item(p: ProductDetail): string {
  const inStock = p.variants.some((v) => !v.trackStock || v.stock > 0);
  const onSale = p.mrpPaise !== null && p.mrpPaise > p.pricePaise;
  const extra = [...new Set([p.hoverImage?.path, ...p.gallery.map((g) => g.path)].filter((x): x is string => !!x && x !== p.image.path))].slice(0, 10);
  const colours = [...new Set(p.variants.map((v) => v.colourName).filter(Boolean))];
  const tag = (k: string, v: string | null | undefined) => (v ? `<g:${k}>${esc(v)}</g:${k}>` : '');
  return [
    '<item>',
    tag('id', p.slug),
    tag('title', p.name.slice(0, 150)),
    tag('description', (p.story || p.techLine).slice(0, 5000)),
    tag('link', `${SITE}${productHref(p)}`),
    tag('image_link', abs(p.image.path)),
    ...extra.map((x) => tag('additional_image_link', abs(x))),
    tag('availability', inStock ? 'in_stock' : 'out_of_stock'),
    tag('price', price(onSale ? p.mrpPaise! : p.pricePaise)),
    onSale ? tag('sale_price', price(p.pricePaise)) : '',
    tag('brand', BRAND.name),
    tag('condition', 'new'),
    tag('identifier_exists', 'no'),
    tag('google_product_category', GOOGLE_CATEGORY[p.parent.slug]),
    tag('product_type', `${p.parent.name} > ${p.category.name}`),
    colours.length === 1 ? tag('color', colours[0]) : '',
    tag('custom_label_0', SHIPS[p.shipMode]),
    tag('custom_label_1', p.badge?.text),
    '</item>',
  ].join('');
}

export async function GET() {
  let items: string[];
  try {
    const cards = (await allCards()).filter((c) => !c.studio);
    items = (await details(cards)).map(item);
  } catch {
    // never hand Google or Meta an empty feed (they would drop every product): ask them to come back later
    return new Response('The catalogue is unavailable right now. Please try again shortly.', { status: 503, headers: { 'retry-after': '600', 'cache-control': 'no-store' } });
  }
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>' +
    `<title>${esc(BRAND.name)}</title><link>${esc(SITE)}</link><description>${esc(BRAND.tagline)}</description>` +
    items.join('\n') +
    '</channel></rss>\n';
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=3600' } });
}
