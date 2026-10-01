import type { ProductType } from './constants';

export interface ImageRef {
  /** path under the media root, e.g. "photos/kurta.jpg" */
  path: string;
  alt: string;
  /** sharper copy for click-to-zoom, when there is one */
  zoomPath?: string | null;
  caption?: string | null;
}

export interface CategoryRef {
  slug: string;
  name: string;
}

export interface CategoryNode extends CategoryRef {
  blurb: string | null;
  image: string | null;
  productCount: number;
  children: CategoryNode[];
}

export interface ProductCard {
  id: string;
  code: string;
  slug: string;
  name: string;
  type: ProductType;
  techLine: string;
  category: CategoryRef;
  parent: CategoryRef;
  pricePaise: number;
  /** struck-through price; null for "from" prices (logo merch) */
  mrpPaise: number | null;
  badge: { text: string; tone: string } | null;
  image: ImageRef;
  hoverImage: ImageRef | null;
  rating: { avg: number; count: number };
  /** colour dots when the piece comes in several colours */
  swatches: string[];
  /** lead time / note for made-for-you pieces; null means it ships in 1–2 days */
  shipNote: string | null;
  needsSize: boolean;
  personalisable: boolean;
  /** logo merch is designed in the studio instead of a product page */
  studio: { garment: string; sample: string | null } | null;
  isUnique: boolean;
}

export interface Variant {
  id: string;
  sku: string;
  colourName: string;
  /** hex for photo products, garment key (e.g. "kajal") for live-preview products */
  colourValue: string;
  colourHex: string;
  size: string | null;
  sizeNote: string | null;
  priceDeltaPaise: number;
  stock: number;
  trackStock: boolean;
}

export interface PersonalisationConfig {
  feePaise: number;
  maxLength: number;
  defaultText: string;
  required: boolean;
  defaultOn: boolean;
  font: string;
  thread: string;
  flowerPresets: boolean;
}

export interface LivePreviewConfig {
  view: string;
  place: string;
  /** max design size in cm: [width, height] */
  box: [number, number];
  motif: string;
  motifColours: string[] | null;
  maxTextWidth: number | null;
  /** close-up crop width as a multiple of the design width */
  closeCrop: number;
}

export interface ReviewItem {
  id: string;
  authorName: string;
  city: string | null;
  rating: number;
  body: string;
  createdAt: string;
  helpfulCount: number;
  photoPath: string | null;
  /** for live-preview products: the customer's version, rendered by the stitch engine */
  preview: { colour: string; palette: number; text: string; font: string | null; thread: string | null } | null;
  isSample: boolean;
}

export interface ProductDetail extends ProductCard {
  story: string;
  shipMode: 'READY' | 'MADE' | 'CUSTOM';
  madeDays: number | null;
  sizeLabel: string;
  sizeGuide: string | null;
  handMade: boolean;
  petPhoto: boolean;
  variants: Variant[];
  gallery: ImageRef[];
  upClose: { path: string; caption: string } | null;
  details: {
    why: { title: string; text: string }[];
    spec: { label: string; value: string }[];
    care: string[];
    faq: { q: string; a: string }[];
  };
  personalisation: PersonalisationConfig | null;
  livePreview: LivePreviewConfig | null;
  reviews: { avg: number; count: number; distribution: number[]; items: ReviewItem[] };
  related: ProductCard[];
}

/** The small projection the shop filters run on (kept in memory by the API). */
export interface CatalogIndexItem {
  id: string;
  slug: string;
  name: string;
  techLine: string;
  alt: string;
  category: string;
  categoryName: string;
  parent: string;
  parentName: string;
  type: ProductType;
  pricePaise: number;
  ratingAvg: number;
  ratingCount: number;
  occasions: string[];
  colourFamily: string;
  popularity: number;
  publishedAt: string;
}
