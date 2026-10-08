import type {
  AddressDto,
  CategoryNode,
  CheckoutDetails,
  Facets,
  Me,
  OrderDto,
  OrderSummaryDto,
  PaymentStart,
  PincodeInfo,
  ReturnKind,
  ReturnReason,
  PlaceOrderResult,
  ProductCard,
  ProductDetail,
  StudioLineSpec,
  Totals,
} from '@store/shared';
import { TOO_BIG, UPLOAD_MAX_BYTES } from './upload-limit';

/* Talks to the store API. Server components call API_URL directly; the browser goes through this site's
   /api proxy (same origin, so the login cookie travels with it). */
const base = () => (typeof window === 'undefined' ? (process.env.API_URL ?? 'http://localhost:4000') : '/api');

/** a return or exchange request (see the API's returnRequestSchema) */
export interface ReturnRequestBody {
  kind: ReturnKind;
  reason: ReturnReason;
  details?: string;
  items: { orderItemId: string; qty: number; exchangeVariantId?: string }[];
  photos?: string[];
  refundUpi?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
    public details?: unknown,
  ) {
    super(message);
  }
}

type Init = RequestInit & { next?: { revalidate?: number | false; tags?: string[] } };

async function request<T>(path: string, init?: Init): Promise<T> {
  let res: Response;
  try {
    const json = init?.body && typeof init.body === 'string';
    res = await fetch(base() + path, { ...init, headers: { accept: 'application/json', ...(json ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
  } catch {
    throw new ApiError(0, 'You seem to be offline. Please check your connection.', 'offline');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string; details?: unknown } } | null;
    throw new ApiError(res.status, body?.error?.message ?? res.statusText, body?.error?.code, body?.error?.details);
  }
  return res.json() as Promise<T>;
}
const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body), cache: 'no-store' });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body), cache: 'no-store' });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE', cache: 'no-store' });
const priv = <T>(path: string) => request<T>(path, { cache: 'no-store' });

const CATALOG = { next: { revalidate: 60, tags: ['catalog'] } };

export interface Listing {
  items: ProductCard[];
  total: number;
  page: number;
  pageSize: number;
  facets: Facets;
}

export interface CartPriceLine {
  variantId: string;
  available: boolean;
  problems: string[];
  qty: number;
  unitPricePaise: number;
  unitMrpPaise: number;
  extraPaise: number;
  custom: boolean;
}
export interface CartPriceResponse {
  lines: CartPriceLine[];
  totals: Totals;
  coupon: { code: string; valid: boolean; applied: boolean; message: string } | null;
}

export type CartItemRequest =
  | { variantId: string; qty: number; personalisation?: { text: string; font: string; thread: string; flowers?: number } | null; giftWrap?: boolean; petName?: string; uploads?: string[] }
  | { qty: number; studio: StudioLineSpec; uploads?: string[] };

export interface CartPriceRequest {
  items: CartItemRequest[];
  coupon?: string;
  shipping?: 'standard' | 'express';
  payment?: 'upi' | 'card' | 'netbanking' | 'wallet' | 'cod';
}

export interface PlaceOrderRequest extends CartPriceRequest {
  shipping: 'standard' | 'express';
  payment: 'upi' | 'card' | 'netbanking' | 'wallet' | 'cod';
  details: CheckoutDetails;
  saveAddress: boolean;
  clientKey: string;
  expectedTotalPaise?: number;
}

export interface Offer {
  code: string;
  label: string;
  percent: number;
  maxDiscountPaise: number;
  minSubtotalPaise: number;
  firstOrderOnly: boolean;
}

export const api = {
  /* catalogue */
  categories: () => request<{ items: CategoryNode[] }>('/v1/categories', CATALOG).then((r) => r.items),
  products: (params: URLSearchParams | string = '') => request<Listing>(`/v1/products?${params.toString()}`, CATALOG),
  product: async (slug: string) => {
    try {
      return await request<ProductDetail>(`/v1/products/${encodeURIComponent(slug)}`, CATALOG);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
      throw e;
    }
  },
  search: (q: string, limit = 6) => request<{ items: ProductCard[]; total: number }>(`/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  /** city and state of a pincode; null when India Post's directory doesn't have it */
  pincode: async (pin: string) => {
    try {
      return await request<PincodeInfo>(`/v1/pincodes/${pin}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  coupons: () => request<{ items: Offer[] }>('/v1/coupons', { next: { revalidate: 60 } }).then((r) => r.items),
  priceCart: (body: CartPriceRequest) => post<CartPriceResponse>('/v1/cart/price', body),

  /* login */
  sendOtp: (phone: string) => post<{ ok: true; length: number; resendInSeconds: number; devCode?: string }>('/v1/auth/otp', { phone }),
  verifyOtp: (phone: string, code: string) => post<{ me: Me; isNew: boolean }>('/v1/auth/verify', { phone, code }),
  logout: () => post<{ ok: true }>('/v1/auth/logout'),
  me: () => priv<{ me: Me | null }>('/v1/me').then((r) => r.me),
  updateMe: (body: Partial<Pick<Me, 'name' | 'email' | 'whatsappOptIn'>>) => patch<{ me: Me }>('/v1/me', body).then((r) => r.me),

  /* account */
  addresses: () => priv<{ items: AddressDto[] }>('/v1/me/addresses').then((r) => r.items),
  addAddress: (a: Omit<AddressDto, 'id' | 'isDefault'> & { isDefault?: boolean }) => post<{ address: AddressDto }>('/v1/me/addresses', a).then((r) => r.address),
  updateAddress: (id: string, a: Partial<Omit<AddressDto, 'id'>>) => patch<{ address: AddressDto }>(`/v1/me/addresses/${id}`, a).then((r) => r.address),
  deleteAddress: (id: string) => del<{ ok: true }>(`/v1/me/addresses/${id}`),
  myOrders: (page = 1) => priv<{ items: OrderSummaryDto[]; total: number; page: number; pageSize: number }>(`/v1/me/orders?page=${page}`),
  myOrder: (number: string) => priv<{ order: OrderDto }>(`/v1/me/orders/${encodeURIComponent(number)}`).then((r) => r.order),
  addReview: (itemId: string, rating: number, body: string) => post<{ ok: true }>('/v1/me/reviews', { itemId, rating, body }),
  cancelOrder: (number: string, reason?: string) => post<{ order: OrderDto }>(`/v1/me/orders/${encodeURIComponent(number)}/cancel`, reason ? { reason } : {}).then((r) => r.order),
  requestReturn: (number: string, body: ReturnRequestBody) => post<{ request: string; order: OrderDto }>(`/v1/me/orders/${encodeURIComponent(number)}/returns`, body),
  cancelReturn: (number: string) => post<{ order: OrderDto }>(`/v1/me/returns/${encodeURIComponent(number)}/cancel`).then((r) => r.order),

  /* checkout */
  placeOrder: (body: PlaceOrderRequest) => post<PlaceOrderResult>('/v1/orders', body),
  payAgain: (number: string) => post<{ payment: PaymentStart }>(`/v1/orders/${encodeURIComponent(number)}/pay`).then((r) => r.payment),
  confirmRazorpay: (number: string, body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    post<{ order: OrderDto }>(`/v1/orders/${encodeURIComponent(number)}/razorpay`, body).then((r) => r.order),
  /** after Cashfree's window closes: the server asks Cashfree whether the order was paid */
  confirmCashfree: (number: string) => post<{ order: OrderDto }>(`/v1/orders/${encodeURIComponent(number)}/cashfree`).then((r) => r.order),
  fakePayment: (number: string, ok: boolean) => post<{ order: OrderDto }>(`/v1/orders/${encodeURIComponent(number)}/fake-payment`, { ok }).then((r) => r.order),
  paymentFailed: (number: string, reason?: string) => post<{ ok: true }>(`/v1/orders/${encodeURIComponent(number)}/payment-failed`, reason ? { reason } : {}),

  /** upload a logo, pet photo, preview render or a photo for a return request (multipart); fit photos first (lib/shrink) */
  upload: async (kind: 'logo' | 'pet' | 'preview' | 'return', file: Blob, name = 'upload') => {
    if (file.size > UPLOAD_MAX_BYTES) throw new ApiError(413, TOO_BIG, 'too_large');
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file, name);
    let res: Response;
    try {
      res = await fetch(`${base()}/v1/uploads`, { method: 'POST', body: fd });
    } catch {
      throw new ApiError(0, 'You seem to be offline. Please check your connection.', 'offline');
    }
    const body = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string; code?: string } } | null;
    if (res.status === 413) throw new ApiError(413, TOO_BIG, 'too_large'); // the host's own limit answers without JSON
    if (!res.ok || !body?.id) throw new ApiError(res.status, body?.error?.message ?? 'Upload failed', body?.error?.code);
    return body as { id: string; kind: string; width: number | null; height: number | null; bytes: number };
  },
};
