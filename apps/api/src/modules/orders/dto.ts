import type { OrderDto, OrderItemDto, OrderSummaryDto, ProductionStatus } from '@store/shared';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { Files } from '../files/service.ts';

export const orderInclude = {
  items: {
    orderBy: { id: 'asc' },
    include: {
      uploads: { select: { id: true, kind: true, key: true, isPublic: true, mime: true, width: true, height: true, originalName: true, createdAt: true } },
      proofs: { orderBy: { version: 'desc' } },
      product: { select: { slug: true } },
    },
  },
  events: { orderBy: { createdAt: 'asc' } },
  invoice: true,
  payments: { orderBy: { createdAt: 'desc' } },
  refunds: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.OrderInclude;
export type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type FullItem = FullOrder['items'][number];

const LOCKED: ProductionStatus[] = ['APPROVED', 'IN_PRODUCTION', 'DONE'];

/** the picture for an order line: its preview render, else the catalogue photo */
export function itemImage(i: FullItem, files: Files): string | null {
  const preview = i.uploads.find((u) => u.kind === 'PREVIEW');
  if (preview) return files.signedPath(preview.id, 7);
  return i.imagePath;
}

export function toItemDto(i: FullItem, files: Files): OrderItemDto {
  const p = i.proofs.find((x) => x.status !== 'SUPERSEDED') ?? i.proofs[0];
  return {
    id: i.id,
    kind: i.kind,
    name: i.name,
    description: i.description,
    image: itemImage(i, files),
    productSlug: i.product?.slug ?? null,
    qty: i.qty,
    unitPricePaise: i.unitPricePaise,
    unitMrpPaise: i.unitMrpPaise,
    extraPaise: i.extraPaise,
    custom: i.custom,
    productionStatus: i.productionStatus,
    proof: p ? { status: p.status, token: p.token, version: p.version, sentAt: p.sentAt.toISOString() } : null,
  };
}

export const canCustomerCancel = (o: Pick<FullOrder, 'status'> & { items: Pick<FullItem, 'productionStatus'>[] }) =>
  (o.status === 'PLACED' || o.status === 'PENDING_PAYMENT') && !o.items.some((i) => LOCKED.includes(i.productionStatus));

export function toSummaryDto(o: Pick<FullOrder, 'number' | 'status' | 'paymentState' | 'paymentMethod' | 'totalPaise' | 'itemCount' | 'createdAt' | 'etaDate'> & { items: FullItem[] }, files: Files): OrderSummaryDto {
  return {
    number: o.number,
    status: o.status,
    paymentState: o.paymentState,
    paymentMethod: o.paymentMethod,
    totalPaise: o.totalPaise,
    itemCount: o.itemCount,
    createdAt: o.createdAt.toISOString(),
    etaDate: o.etaDate?.toISOString() ?? null,
    images: o.items.slice(0, 4).map((i) => itemImage(i, files)).filter((x): x is string => !!x),
  };
}

export function toOrderDto(o: FullOrder, files: Files, pendingMinutes: number): OrderDto {
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    ...toSummaryDto(o, files),
    items: o.items.map((i) => toItemDto(i, files)),
    events: o.events.filter((e) => e.visible).map((e) => ({ type: e.type, message: e.message, createdAt: e.createdAt.toISOString() })),
    subtotalPaise: o.subtotalPaise,
    mrpTotalPaise: o.mrpTotalPaise,
    discountPaise: o.discountPaise,
    discountLabel: o.discountLabel,
    shippingPaise: o.shippingPaise,
    upiDiscountPaise: o.upiDiscountPaise,
    codFeePaise: o.codFeePaise,
    refundedPaise: o.refundedPaise,
    shippingSpeed: o.shipping,
    couponCode: o.couponCode,
    phone: o.phone,
    email: o.email,
    ship: { name: o.shipName, phone: o.shipPhone, line1: o.shipLine1, line2: o.shipLine2, landmark: o.shipLandmark, city: o.shipCity, state: o.shipState, pincode: o.shipPincode },
    gst: o.gstin ? { gstin: o.gstin, business: o.gstBusiness ?? '' } : null,
    giftNote: o.giftNote,
    tracking: o.courier || o.awb || o.trackingUrl ? { courier: o.courier, awb: o.awb, url: o.trackingUrl } : null,
    invoice: o.invoice?.pdfUploadId ? { number: o.invoice.number, url: files.signedPath(o.invoice.pdfUploadId, 7) } : null,
    canCancel: canCustomerCancel(o),
    canPay: o.status === 'PENDING_PAYMENT' && Date.now() - o.createdAt.getTime() < pendingMinutes * 60_000,
    placedAt: iso(o.placedAt),
    paidAt: iso(o.paidAt),
    shippedAt: iso(o.shippedAt),
    deliveredAt: iso(o.deliveredAt),
    cancelledAt: iso(o.cancelledAt),
  };
}
