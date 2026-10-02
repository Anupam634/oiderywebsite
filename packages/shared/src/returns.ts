/* Returns and exchanges of delivered pieces, as the API returns them to the storefront and the admin.
   Money in paise, dates as ISO strings. */

export type ReturnKind = 'EXCHANGE' | 'REFUND';
export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'RECEIVED' | 'EXCHANGED' | 'REFUNDED' | 'REJECTED' | 'CANCELLED';

/** why a piece comes back. Made-for-you pieces can only come back when something is wrong with them. */
export const RETURN_REASONS = [
  { key: 'WRONG_SIZE', label: 'It doesn’t fit', customOk: false, photo: false, customerChoice: true },
  { key: 'DAMAGED', label: 'Arrived damaged, or a stitching fault', customOk: true, photo: true, customerChoice: false },
  { key: 'NOT_AS_SHOWN', label: 'Looks different from the photos', customOk: false, photo: true, customerChoice: false },
  { key: 'WRONG_ITEM', label: 'We sent the wrong piece', customOk: true, photo: true, customerChoice: false },
  { key: 'CHANGED_MIND', label: 'I changed my mind', customOk: false, photo: false, customerChoice: true },
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number]['key'];
export const RETURN_REASON_KEYS = RETURN_REASONS.map((r) => r.key) as [ReturnReason, ...ReturnReason[]];
export const returnReason = (key: string) => RETURN_REASONS.find((r) => r.key === key);

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  RECEIVED: 'Received by the studio',
  EXCHANGED: 'Replacement sent',
  REFUNDED: 'Refunded',
  REJECTED: 'Not accepted',
  CANCELLED: 'Withdrawn',
};
export const RETURN_KIND_LABEL: Record<ReturnKind, string> = { EXCHANGE: 'Exchange', REFUND: 'Refund' };

/** a request still being worked on (counts against what can be returned, shows in the studio's queue) */
export const RETURN_OPEN: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'RECEIVED'];
/** requests that took pieces back (or are about to) */
export const RETURN_ACTIVE: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'RECEIVED', 'EXCHANGED', 'REFUNDED'];

/** a UPI ID like name@okbank, for refunds of cash-on-delivery orders */
export const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{2,64}$/;

export interface ReturnItemDto {
  orderItemId: string;
  name: string;
  description: string;
  image: string | null;
  qty: number;
  /** exchanges: what is sent instead, e.g. "Size L" */
  exchangeLabel: string | null;
}

export interface ReturnDto {
  number: string;
  kind: ReturnKind;
  status: ReturnStatus;
  reason: ReturnReason;
  details: string;
  items: ReturnItemDto[];
  photos: string[];
  /** from the studio: what happens next, or why it was declined */
  studioNote: string | null;
  pickup: { courier: string | null; awb: string | null } | null;
  replacement: { courier: string | null; awb: string | null } | null;
  refundPaise: number;
  refundReference: string | null;
  refundUpi: string | null;
  createdAt: string;
  approvedAt: string | null;
  receivedAt: string | null;
  closedAt: string | null;
  /** the customer can still withdraw it */
  canCancel: boolean;
}

/** what a customer may send back from a delivered order */
export interface ReturnOptions {
  /** inside the return window and something can still go back */
  open: boolean;
  /** last day to ask (ISO) */
  until: string;
  windowDays: number;
  allowRefund: boolean;
  allowExchange: boolean;
  /** taken off refunds when the customer simply changed their mind or the size didn't fit */
  feePaise: number;
  /** paid in cash: refunds go to a UPI ID */
  cod: boolean;
  items: {
    orderItemId: string;
    name: string;
    description: string;
    image: string | null;
    /** pieces that can still go back */
    qty: number;
    custom: boolean;
    /** what one piece cost after the order's discounts (the most a refund pays per piece) */
    unitRefundPaise: number;
    /** exchanges: same-price variants in stock; the current one means a replacement */
    exchange: { variantId: string; label: string; current: boolean }[];
  }[];
}

/** the amount a refund would pay for some pieces, before the studio checks them */
export function suggestedRefund(options: Pick<ReturnOptions, 'items' | 'feePaise'>, lines: { orderItemId: string; qty: number }[], reason: ReturnReason): number {
  const value = lines.reduce((sum, l) => sum + (options.items.find((i) => i.orderItemId === l.orderItemId)?.unitRefundPaise ?? 0) * l.qty, 0);
  const fee = returnReason(reason)?.customerChoice ? options.feePaise : 0;
  return Math.max(0, value - fee);
}

/** studio list row */
export interface AdminReturnRow {
  number: string;
  orderNumber: string;
  kind: ReturnKind;
  status: ReturnStatus;
  reason: ReturnReason;
  customerName: string;
  city: string;
  paymentMethod: string;
  pieces: number;
  images: string[];
  createdAt: string;
}

export interface AdminReturnDetail extends ReturnDto {
  orderNumber: string;
  orderTotalPaise: number;
  orderRefundedPaise: number;
  paymentMethod: string;
  /** an online payment exists, so the refund can go back through the gateway */
  paidOnline: boolean;
  customer: { name: string; phone: string; email: string | null; city: string; address: string };
  /** what the refund would be: pieces' value after discounts, minus the return fee where it applies */
  suggestedRefundPaise: number;
  restocked: boolean;
  items: (ReturnItemDto & { sku: string; unitRefundPaise: number; exchangeVariantId: string | null; stockReserved: number })[];
}
