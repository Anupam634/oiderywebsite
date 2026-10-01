import type {
  CatalogIndexItem,
  CategoryNode,
  ImageRef,
  LivePreviewConfig,
  PersonalisationConfig,
  ProductCard,
  ProductDetail,
  ReviewItem,
} from '@store/shared';
import type { Db } from '../../lib/prisma.ts';
import { TtlCache } from '../../lib/cache.ts';
import type { Prisma } from '../../generated/prisma/client.ts';

/* Reads the catalogue and shapes it for the storefront. Only ACTIVE products are visible. */

const cardInclude = {
  category: { include: { parent: true } },
  images: { where: { role: { in: ['MAIN', 'HOVER'] } }, orderBy: { sortOrder: 'asc' } },
  variants: { select: { colourHex: true, colourName: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductInclude;
type CardRow = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

const image = (i: { path: string; alt: string; zoomPath: string | null; caption: string | null }): ImageRef => ({
  path: i.path,
  alt: i.alt,
  zoomPath: i.zoomPath,
  caption: i.caption,
});

function toCard(p: CardRow): ProductCard {
  const main = p.images.find((i) => i.role === 'MAIN');
  const hover = p.images.find((i) => i.role === 'HOVER');
  const colours = [...new Map(p.variants.map((v) => [v.colourName, v.colourHex])).values()];
  const parent = p.category.parent ?? p.category;
  return {
    id: p.id,
    code: p.code,
    slug: p.slug,
    name: p.name,
    type: p.type,
    techLine: p.techLine,
    category: { slug: p.category.slug, name: p.category.name },
    parent: { slug: parent.slug, name: parent.name },
    pricePaise: p.pricePaise,
    mrpPaise: p.mrpPaise,
    badge: p.badgeText ? { text: p.badgeText, tone: p.badgeTone ?? 'rani' } : null,
    image: main ? image(main) : { path: 'photos/og-share.jpg', alt: p.name },
    hoverImage: hover ? image(hover) : null,
    rating: { avg: p.ratingAvg, count: p.ratingCount },
    swatches: colours.length > 1 ? colours.slice(0, 6) : [],
    shipNote: p.shipNote,
    needsSize: p.needsSize,
    personalisable: p.type === 'PERSONALISE',
    studio: p.studioGarment ? { garment: p.studioGarment, sample: p.studioSample } : null,
    isUnique: p.isUnique,
  };
}

/** Until a product has real reviews, the bar chart follows its rating (as in the approved design). */
export function ratingDistribution(avg: number): number[] {
  return avg >= 4.9 ? [88, 9, 2, 1, 0] : avg >= 4.7 ? [80, 14, 4, 1, 1] : [72, 18, 6, 2, 2];
}

export class CatalogRepo {
  private cache: TtlCache<unknown>;
  constructor(
    private db: Db,
    cacheSeconds: number,
  ) {
    this.cache = new TtlCache(cacheSeconds * 1000);
  }

  clearCache() {
    this.cache.clear();
  }

  /** Lightweight projection of every active product; filtering and facets run on this in memory. */
  index(): Promise<CatalogIndexItem[]> {
    return this.cache.get('index', async () => {
      const rows = await this.db.product.findMany({
        where: { status: 'ACTIVE' },
        include: { category: { include: { parent: true } }, images: { where: { role: 'MAIN' }, take: 1 } },
      });
      return rows.map((p) => {
        const parent = p.category.parent ?? p.category;
        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          techLine: p.techLine,
          alt: p.images[0]?.alt ?? '',
          category: p.category.slug,
          categoryName: p.category.name,
          parent: parent.slug,
          parentName: parent.name,
          type: p.type,
          pricePaise: p.pricePaise,
          ratingAvg: p.ratingAvg,
          ratingCount: p.ratingCount,
          occasions: p.occasions,
          colourFamily: p.colourFamily,
          popularity: p.popularity,
          publishedAt: p.publishedAt.toISOString(),
        } satisfies CatalogIndexItem;
      });
    }) as Promise<CatalogIndexItem[]>;
  }

  /** Cards for the given ids, in that order. */
  async cards(ids: string[]): Promise<ProductCard[]> {
    if (!ids.length) return [];
    const rows = await this.db.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, include: cardInclude });
    const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
    return ids.map((id) => byId.get(id)).filter((c): c is ProductCard => !!c);
  }

  categories(): Promise<CategoryNode[]> {
    return this.cache.get('categories', async () => {
      const [cats, counts] = await Promise.all([
        this.db.category.findMany({ orderBy: { sortOrder: 'asc' } }),
        this.db.product.groupBy({ by: ['categoryId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
      ]);
      const countOf = new Map(counts.map((c) => [c.categoryId, c._count._all]));
      const node = (c: (typeof cats)[number]): CategoryNode => {
        const children = cats.filter((x) => x.parentId === c.id).map(node);
        return {
          slug: c.slug,
          name: c.name,
          blurb: c.blurb,
          image: c.image,
          productCount: (countOf.get(c.id) ?? 0) + children.reduce((a, ch) => a + ch.productCount, 0),
          children,
        };
      };
      return cats.filter((c) => !c.parentId).map(node);
    }) as Promise<CategoryNode[]>;
  }

  product(slug: string): Promise<ProductDetail | null> {
    return this.cache.get('product:' + slug, async () => {
      const p = await this.db.product.findFirst({
        where: { slug, status: 'ACTIVE' },
        include: {
          category: { include: { parent: true } },
          images: { orderBy: { sortOrder: 'asc' } },
          variants: { orderBy: { sortOrder: 'asc' } },
          reviews: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 20 },
          relatedFrom: { orderBy: { sortOrder: 'asc' }, select: { toId: true } },
        },
      });
      if (!p) return null;
      const card = toCard({ ...p, images: p.images.filter((i) => i.role !== 'GALLERY'), variants: p.variants });
      const details = p.details as ProductDetail['details'] & { upClose: ProductDetail['upClose'] };
      const gallery = p.images.filter((i) => i.role !== 'HOVER').map(image);
      const reviews: ReviewItem[] = p.reviews.map((r) => ({
        id: r.id,
        authorName: r.authorName,
        city: r.city,
        rating: r.rating,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        helpfulCount: r.helpfulCount,
        photoPath: r.photoPath,
        preview: (r.preview as ReviewItem['preview']) ?? null,
        isSample: r.isSample,
      }));
      const perso = p.personalisation as (Omit<PersonalisationConfig, 'feePaise'> & { fee: number }) | null;
      return {
        ...card,
        story: p.story,
        shipMode: p.shipMode,
        madeDays: p.madeDays,
        sizeLabel: p.sizeLabel ?? 'Size',
        sizeGuide: p.sizeGuide,
        handMade: p.handMade,
        petPhoto: p.petPhoto,
        variants: p.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          colourName: v.colourName,
          colourValue: v.colourValue,
          colourHex: v.colourHex,
          size: v.size,
          sizeNote: v.sizeNote,
          priceDeltaPaise: v.priceDeltaPaise,
          stock: v.stock,
          trackStock: v.trackStock,
        })),
        gallery,
        upClose: details.upClose ?? null,
        details: { why: details.why ?? [], spec: details.spec ?? [], care: details.care ?? [], faq: details.faq ?? [] },
        personalisation: perso
          ? { feePaise: perso.fee, maxLength: perso.maxLength, defaultText: perso.defaultText, required: perso.required, defaultOn: perso.defaultOn, font: perso.font, thread: perso.thread, flowerPresets: perso.flowerPresets }
          : null,
        livePreview: (p.livePreview as LivePreviewConfig | null) ?? null,
        reviews: { avg: p.ratingAvg, count: p.ratingCount, distribution: ratingDistribution(p.ratingAvg), items: reviews },
        related: await this.cards(p.relatedFrom.map((r) => r.toId)),
      } satisfies ProductDetail;
    }) as Promise<ProductDetail | null>;
  }
}
