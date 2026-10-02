/* Orders as the API returns them to the storefront and the admin. Money in paise, dates as ISO strings. */
import type { ReturnDto, ReturnOptions } from './returns';

export type OrderStatus = 'PENDING_PAYMENT' | 'PLACED' | 'IN_PRODUCTION' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentState = 'PENDING' | 'PAID' | 'COD_PENDING' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type PayMethod = 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET' | 'COD';
export type ProductionStatus = 'NOT_NEEDED' | 'AWAITING_PROOF' | 'PROOF_SENT' | 'CHANGES_REQUESTED' | 'APPROVED' | 'IN_PRODUCTION' | 'DONE';
export type ProofStatus = 'SENT' | 'APPROVED' | 'CHANGES_REQUESTED' | 'SUPERSEDED';
export type AddressKind = 'HOME' | 'WORK' | 'OTHER';

/** payment choices on the checkout page */
export type CheckoutPayment = 'upi' | 'card' | 'netbanking' | 'wallet' | 'cod';
export const PAY_METHOD: Record<CheckoutPayment, PayMethod> = { upi: 'UPI', card: 'CARD', netbanking: 'NETBANKING', wallet: 'WALLET', cod: 'COD' };
export const CHECKOUT_PAYMENT: Record<PayMethod, CheckoutPayment> = { UPI: 'upi', CARD: 'card', NETBANKING: 'netbanking', WALLET: 'wallet', COD: 'cod' };

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  PLACED: 'Order placed',
  IN_PRODUCTION: 'Being stitched',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};
export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  PENDING: 'Not paid yet',
  PAID: 'Paid',
  COD_PENDING: 'Pay on delivery',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partly refunded',
};
export const PAY_METHOD_LABEL: Record<PayMethod, string> = { UPI: 'UPI', CARD: 'Card', NETBANKING: 'Net banking', WALLET: 'Wallet', COD: 'Cash on delivery' };
export const PRODUCTION_LABEL: Record<ProductionStatus, string> = {
  NOT_NEEDED: 'Ready-made',
  AWAITING_PROOF: 'Proof being prepared',
  PROOF_SENT: 'Proof sent, waiting for approval',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Proof approved',
  IN_PRODUCTION: 'Being stitched',
  DONE: 'Stitched and checked',
};

/** unpaid prepaid orders are cancelled (and their stock released) after this long */
export const PENDING_ORDER_MINUTES = 30;
/** cash on delivery is offered up to this order value */
export const COD_MAX_PAISE = 1_000_000;

export interface Me {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  whatsappOptIn: boolean;
}

export interface AddressDto {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  type: AddressKind;
  isDefault: boolean;
}

export interface OrderItemDto {
  id: string;
  kind: 'CATALOGUE' | 'STUDIO';
  name: string;
  description: string;
  /** media path (photos/…) or an API file URL (/v1/files/…) */
  image: string | null;
  productSlug: string | null;
  qty: number;
  unitPricePaise: number;
  unitMrpPaise: number;
  extraPaise: number;
  custom: boolean;
  productionStatus: ProductionStatus;
  /** the latest stitch proof, if one was sent */
  proof: { status: ProofStatus; token: string; version: number; sentAt: string } | null;
  /** delivered catalogue pieces can be reviewed once */
  canReview: boolean;
  reviewed: boolean;
}

export interface OrderEventDto {
  type: string;
  message: string;
  createdAt: string;
}

export interface OrderSummaryDto {
  number: string;
  status: OrderStatus;
  paymentState: PaymentState;
  paymentMethod: PayMethod;
  totalPaise: number;
  itemCount: number;
  createdAt: string;
  etaDate: string | null;
  images: string[];
}

export interface OrderDto extends OrderSummaryDto {
  items: OrderItemDto[];
  events: OrderEventDto[];
  subtotalPaise: number;
  mrpTotalPaise: number;
  discountPaise: number;
  discountLabel: string | null;
  shippingPaise: number;
  upiDiscountPaise: number;
  codFeePaise: number;
  refundedPaise: number;
  shippingSpeed: 'STANDARD' | 'EXPRESS';
  couponCode: string | null;
  phone: string;
  email: string | null;
  ship: { name: string; phone: string; line1: string; line2: string; landmark: string; city: string; state: string; pincode: string };
  gst: { gstin: string; business: string } | null;
  giftNote: string | null;
  tracking: { courier: string | null; awb: string | null; url: string | null } | null;
  invoice: { number: string; url: string } | null;
  /** the customer may still cancel it themselves */
  canCancel: boolean;
  /** waiting for payment and still within the payment window */
  canPay: boolean;
  /** return and exchange requests, newest first */
  returns: ReturnDto[];
  /** delivered orders: what can still be returned or exchanged */
  returnOptions: ReturnOptions | null;
  placedAt: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

/** what the browser needs to open the payment window */
export interface PaymentStart {
  provider: 'razorpay' | 'fake';
  orderNumber: string;
  amountPaise: number;
  currency: 'INR';
  method: CheckoutPayment;
  /** Razorpay key id and order id (provider = razorpay) */
  keyId?: string;
  providerOrderId?: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
}

export interface PlaceOrderResult {
  order: OrderDto;
  /** null for cash on delivery */
  payment: PaymentStart | null;
}
