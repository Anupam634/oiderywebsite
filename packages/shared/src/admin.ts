import type { OrderDto, OrderItemDto, OrderStatus, PaymentState, PayMethod, ProductionStatus, ProofStatus } from './orders';

/* What the studio admin API returns. Money in paise, dates as ISO strings, files as signed links. */

export type AdminRole = 'OWNER' | 'STAFF';
export interface AdminMe {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

export interface AdminFile {
  id: string;
  kind: string;
  /** API-relative signed link (/v1/files/…) */
  url: string;
  name: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  bytes: number;
}

export interface AdminProof {
  id: string;
  version: number;
  status: ProofStatus;
  imageUrl: string;
  note: string;
  customerComment: string | null;
  sentAt: string;
  respondedAt: string | null;
  token: string;
}

export interface StitchThread {
  hex: string;
  name: string;
  code?: string;
}

export interface AdminStitchFile {
  id: string;
  label: string;
  format: string;
  stitches: number;
  colourChanges: number;
  widthMm: number;
  heightMm: number;
  threads: StitchThread[];
  sourceUrl: string;
  pesUrl: string | null;
  previewUrl: string | null;
  createdAt: string;
}

export interface AdminOrderItem extends OrderItemDto {
  sku: string;
  variantId: string | null;
  hsnCode: string;
  gstRule: string;
  gstRateBp: number;
  personalisation: { text: string; font: string; thread: string; flowers?: number } | null;
  studio: Record<string, unknown> | null;
  petName: string | null;
  giftWrap: boolean;
  files: AdminFile[];
  proofs: AdminProof[];
  stitchFiles: AdminStitchFile[];
}

export interface AdminOrderDetail extends Omit<OrderDto, 'items'> {
  id: string;
  items: AdminOrderItem[];
  customer: { id: string; phone: string; name: string | null; email: string | null; codBlocked: boolean; orders: number; notes: string | null };
  adminNotes: string | null;
  cancelReason: string | null;
  allEvents: { type: string; message: string; actor: string; visible: boolean; createdAt: string }[];
  payments: { provider: string; providerOrderId: string | null; providerPaymentId: string | null; status: string; method: string | null; amountPaise: number; errorReason: string | null; createdAt: string }[];
  refunds: { amountPaise: number; reason: string; status: string; createdAt: string }[];
  /** the next steps the studio can take */
  next: OrderStatus[];
}

export interface AdminOrderRow {
  number: string;
  createdAt: string;
  status: OrderStatus;
  paymentState: PaymentState;
  paymentMethod: PayMethod;
  totalPaise: number;
  itemCount: number;
  customerName: string;
  phone: string;
  city: string;
  express: boolean;
  /** items waiting on the studio or the customer for proofs */
  proofs: { toMake: number; sent: number; changes: number };
  images: string[];
}

export interface AdminDashboard {
  today: { orders: number; revenuePaise: number };
  week: { orders: number; revenuePaise: number };
  month: { orders: number; revenuePaise: number };
  days: { day: string; orders: number; revenuePaise: number }[];
  todo: { toShip: number; proofsToMake: number; changesRequested: number; awaitingCustomer: number; unpaid: number; reviewsToCheck: number };
  lowStock: { productId: string; name: string; sku: string; stock: number }[];
  recent: AdminOrderRow[];
}

export interface ProductionRow {
  itemId: string;
  orderNumber: string;
  orderDate: string;
  express: boolean;
  etaDate: string | null;
  customerName: string;
  name: string;
  description: string;
  qty: number;
  status: ProductionStatus;
  image: string | null;
  proofVersion: number | null;
  stitchFiles: number;
}

export interface AdminProductRow {
  id: string;
  code: string;
  slug: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  type: string;
  category: string;
  pricePaise: number;
  mrpPaise: number | null;
  stock: number;
  tracked: boolean;
  image: string | null;
  updatedAt: string;
}

export interface AdminVariant {
  id?: string;
  sku: string;
  colourName: string;
  colourValue: string;
  colourHex: string;
  size: string | null;
  sizeNote: string | null;
  priceDeltaPaise: number;
  stock: number;
  trackStock: boolean;
  sortOrder: number;
}

export interface AdminImage {
  id: string;
  role: 'MAIN' | 'HOVER' | 'GALLERY';
  path: string;
  zoomPath: string | null;
  alt: string;
  caption: string | null;
  sortOrder: number;
}

export interface ProductDetails {
  why: { title: string; text: string }[];
  spec: { label: string; value: string }[];
  care: string[];
  faq: { q: string; a: string }[];
  upClose: unknown;
}

export interface AdminProduct {
  id: string;
  code: string;
  slug: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  type: 'READY' | 'PERSONALISE' | 'MADE_TO_ORDER' | 'LOGO';
  categoryId: string;
  pricePaise: number;
  mrpPaise: number | null;
  badgeText: string | null;
  badgeTone: string | null;
  techLine: string;
  story: string;
  colourFamily: string;
  occasions: string[];
  popularity: number;
  shipMode: 'READY' | 'MADE' | 'CUSTOM';
  madeDays: number | null;
  shipNote: string | null;
  isUnique: boolean;
  handMade: boolean;
  needsSize: boolean;
  sizeLabel: string | null;
  sizeGuide: string | null;
  studioGarment: string | null;
  studioSample: string | null;
  petPhoto: boolean;
  personalisation: { fee: number; maxLength: number; defaultText: string; required: boolean; defaultOn: boolean; font: string; thread: string; flowerPresets: boolean } | null;
  livePreview: Record<string, unknown> | null;
  details: ProductDetails;
  seoTitle: string | null;
  seoDescription: string | null;
  hsnCode: string;
  gstRule: 'threshold' | 'flat';
  gstRateBp: number;
  related: string[];
  variants: AdminVariant[];
  images: AdminImage[];
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  blurb: string | null;
  image: string | null;
  sortOrder: number;
  parentId: string | null;
  productCount: number;
}

export interface AdminCoupon {
  code: string;
  label: string;
  percent: number;
  maxDiscountPaise: number;
  minSubtotalPaise: number;
  firstOrderOnly: boolean;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export interface AdminReview {
  id: string;
  productId: string;
  productName: string;
  authorName: string;
  city: string | null;
  rating: number;
  body: string;
  status: 'PENDING' | 'PUBLISHED' | 'HIDDEN';
  isSample: boolean;
  createdAt: string;
}

export interface AdminCustomerRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  orders: number;
  spentPaise: number;
  lastOrderAt: string | null;
  codBlocked: boolean;
  createdAt: string;
}

/** couriers the studio ships with; {awb} in the link is replaced by the tracking number */
export const COURIERS = [
  { id: 'shiprocket', name: 'Shiprocket', track: 'https://shiprocket.co/tracking/{awb}' },
  { id: 'delhivery', name: 'Delhivery', track: 'https://www.delhivery.com/track/package/{awb}' },
  { id: 'bluedart', name: 'Blue Dart', track: '' },
  { id: 'dtdc', name: 'DTDC', track: '' },
  { id: 'indiapost', name: 'India Post', track: '' },
  { id: 'other', name: 'Other', track: '' },
] as const;
