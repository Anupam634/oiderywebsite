import type { CategoryNode, Facets, ProductCard, ProductDetail } from '@store/shared';

/* Talks to the store API. Server components use API_URL; the browser uses NEXT_PUBLIC_API_URL. */
const base = () =>
  (typeof window === 'undefined' ? process.env.API_URL : process.env.NEXT_PUBLIC_API_URL) ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } }): Promise<T> {
  const res = await fetch(base() + path, { ...init, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(res.status, body?.error?.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

const CATALOG = { next: { revalidate: 60, tags: ['catalog'] } };

export interface Listing {
  items: ProductCard[];
  total: number;
  page: number;
  pageSize: number;
  facets: Facets;
}

export const api = {
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
  coupons: () => request<{ items: Offer[] }>('/v1/coupons', { next: { revalidate: 60 } }).then((r) => r.items),
  priceCart: (body: CartPriceRequest) => request<CartPriceResponse>('/v1/cart/price', { method: 'POST', body: JSON.stringify(body) }),
};

export interface CartPriceResponse {
  lines: { variantId: string; available: boolean; problems: string[]; qty: number; unitPricePaise: number; unitMrpPaise: number; custom: boolean }[];
  totals: import('@store/shared').Totals;
  coupon: { code: string; valid: boolean; applied: boolean; message: string } | null;
}

export interface CartPriceRequest {
  items: { variantId: string; qty: number; personalisation?: { text: string; font: string; thread: string; flowers?: number } | null; giftWrap?: boolean }[];
  coupon?: string;
  shipping?: 'standard' | 'express';
  payment?: 'upi' | 'card' | 'netbanking' | 'wallet' | 'cod';
}

export interface Offer {
  code: string;
  label: string;
  percent: number;
  maxDiscountPaise: number;
  minSubtotalPaise: number;
  firstOrderOnly: boolean;
}
