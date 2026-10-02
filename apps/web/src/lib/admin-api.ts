'use client';
import { useEffect, useSyncExternalStore } from 'react';
import type {
  AdminCategory,
  AdminCoupon,
  AdminCustomerRow,
  AdminDashboard,
  AdminMe,
  AdminOrderDetail,
  AdminOrderRow,
  AdminProduct,
  AdminProductRow,
  AdminReturnDetail,
  AdminReturnRow,
  AdminReview,
  AdminVariant,
  AddressDto,
  ProductionRow,
} from '@store/shared';
import { ApiError } from './api';

/* The studio admin API, called through this site's /api proxy (the staff cookie travels with it). */

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    res = await fetch(`/api/v1/admin${path}`, {
      method,
      cache: 'no-store',
      headers: { accept: 'application/json', ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'You seem to be offline', 'offline');
  }
  if (res.status === 401 && typeof window !== 'undefined' && !location.pathname.startsWith('/admin/login')) {
    setAdmin(null);
  }
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string; details?: unknown } } | null;
    throw new ApiError(res.status, b?.error?.message ?? res.statusText, b?.error?.code, b?.error?.details);
  }
  return res.json() as Promise<T>;
}
const get = <T>(p: string) => call<T>('GET', p);

export interface Settings {
  legalName: string; tradeName: string; gstin: string; addressLine1: string; addressLine2: string; city: string; state: string;
  pincode: string; phone: string; email: string; invoicePrefix: string; invoiceNote: string; grievanceOfficer: string; jurisdictionCity: string;
  /** days after delivery for return / exchange requests (0 = off) */
  returnWindowDays: number; returnRefunds: boolean; returnExchanges: boolean; returnFeePaise: number; returnInstructions: string;
}

export const adminApi = {
  login: (email: string, password: string) => call<{ me: AdminMe }>('POST', '/login', { email, password }),
  logout: () => call<{ ok: true }>('POST', '/logout'),
  me: () => get<{ me: AdminMe | null }>('/me').then((r) => r.me),
  changePassword: (current: string, next: string) => call<{ ok: true }>('POST', '/password', { current, next }),
  users: () => get<{ items: (AdminMe & { active: boolean; lastLoginAt: string | null })[] }>('/users').then((r) => r.items),
  addUser: (b: { email: string; name: string; role: 'OWNER' | 'STAFF' }) => call<{ user: AdminMe; password: string }>('POST', '/users', b),
  updateUser: (id: string, b: { active?: boolean; role?: 'OWNER' | 'STAFF'; resetPassword?: boolean }) => call<{ user: AdminMe; password?: string }>('PATCH', `/users/${id}`, b),

  dashboard: () => get<AdminDashboard>('/dashboard'),
  orders: (q: URLSearchParams) => get<{ items: AdminOrderRow[]; total: number; page: number; pageSize: number }>(`/orders?${q}`),
  order: (n: string) => get<{ order: AdminOrderDetail }>(`/orders/${encodeURIComponent(n)}`).then((r) => r.order),
  advance: (n: string, b: { to: 'IN_PRODUCTION' | 'SHIPPED' | 'DELIVERED'; courier?: string; awb?: string; trackingUrl?: string; force?: boolean }) =>
    call<{ order: AdminOrderDetail }>('POST', `/orders/${encodeURIComponent(n)}/status`, b).then((r) => r.order),
  cancel: (n: string, reason: string, notify = true) => call<{ order: AdminOrderDetail }>('POST', `/orders/${encodeURIComponent(n)}/cancel`, { reason, notify }).then((r) => r.order),
  refund: (n: string, amountPaise: number, reason: string) => call<{ order: AdminOrderDetail }>('POST', `/orders/${encodeURIComponent(n)}/refund`, { amountPaise, reason }).then((r) => r.order),
  notes: (n: string, notes: string) => call<{ order: AdminOrderDetail }>('POST', `/orders/${encodeURIComponent(n)}/notes`, { notes }).then((r) => r.order),
  message: (n: string, message: string) => call<{ order: AdminOrderDetail }>('POST', `/orders/${encodeURIComponent(n)}/message`, { message }).then((r) => r.order),
  invoice: (n: string) => call<{ order: AdminOrderDetail }>('POST', `/orders/${encodeURIComponent(n)}/invoice`).then((r) => r.order),
  production: (status?: string) => get<{ items: ProductionRow[] }>(`/production${status ? `?status=${status}` : ''}`).then((r) => r.items),
  itemStatus: (id: string, status: string) => call<{ order: AdminOrderDetail }>('POST', `/items/${id}/status`, { status }).then((r) => r.order),
  sendProof: (id: string, file: File, note: string) => {
    const fd = new FormData();
    fd.append('note', note);
    fd.append('file', file, file.name);
    return call<{ order: AdminOrderDetail }>('POST', `/items/${id}/proofs`, fd).then((r) => r.order);
  },
  addStitchFile: (id: string, file: File, label: string) => {
    const fd = new FormData();
    fd.append('label', label);
    fd.append('file', file, file.name);
    return call<{ order: AdminOrderDetail }>('POST', `/items/${id}/stitch-files`, fd).then((r) => r.order);
  },

  products: (q: URLSearchParams) => get<{ items: AdminProductRow[] }>(`/products?${q}`).then((r) => r.items),
  product: (id: string) => get<{ product: AdminProduct }>(`/products/${id}`).then((r) => r.product),
  createProduct: (b: { name: string; categoryId: string; type: string; pricePaise: number }) => call<{ product: AdminProduct }>('POST', '/products', b).then((r) => r.product),
  updateProduct: (id: string, b: Partial<AdminProduct>) => call<{ product: AdminProduct }>('PATCH', `/products/${id}`, b).then((r) => r.product),
  saveVariants: (id: string, variants: AdminVariant[]) => call<{ product: AdminProduct }>('PUT', `/products/${id}/variants`, { variants }).then((r) => r.product),
  addImage: (id: string, file: File, role: string, alt: string) => {
    const fd = new FormData();
    fd.append('role', role);
    fd.append('alt', alt);
    fd.append('file', file, file.name);
    return call<{ product: AdminProduct }>('POST', `/products/${id}/images`, fd).then((r) => r.product);
  },
  saveImages: (id: string, images: { id: string; role: string; alt: string; caption: string | null }[]) => call<{ product: AdminProduct }>('PATCH', `/products/${id}/images`, { images }).then((r) => r.product),
  removeImage: (id: string, imageId: string) => call<{ product: AdminProduct }>('DELETE', `/products/${id}/images/${imageId}`).then((r) => r.product),

  categories: () => get<{ items: AdminCategory[] }>('/categories').then((r) => r.items),
  addCategory: (b: Omit<AdminCategory, 'id' | 'productCount'>) => call<{ items: AdminCategory[] }>('POST', '/categories', b).then((r) => r.items),
  updateCategory: (id: string, b: Partial<Omit<AdminCategory, 'id' | 'productCount'>>) => call<{ items: AdminCategory[] }>('PATCH', `/categories/${id}`, b).then((r) => r.items),
  removeCategory: (id: string) => call<{ items: AdminCategory[] }>('DELETE', `/categories/${id}`).then((r) => r.items),

  coupons: () => get<{ items: AdminCoupon[] }>('/coupons').then((r) => r.items),
  addCoupon: (b: Omit<AdminCoupon, 'usedCount'>) => call<{ items: AdminCoupon[] }>('POST', '/coupons', b).then((r) => r.items),
  updateCoupon: (code: string, b: Partial<Omit<AdminCoupon, 'code' | 'usedCount'>>) => call<{ items: AdminCoupon[] }>('PATCH', `/coupons/${code}`, b).then((r) => r.items),
  removeCoupon: (code: string) => call<{ items: AdminCoupon[] }>('DELETE', `/coupons/${code}`).then((r) => r.items),

  reviews: (status: string, page = 1) => get<{ items: AdminReview[]; total: number; samples: number }>(`/reviews?status=${status}&page=${page}`),
  returns: (status: 'open' | 'done' | 'all') => get<{ items: AdminReturnRow[] }>(`/returns?status=${status}`).then((r) => r.items),
  returnRequest: (n: string) => get<{ return: AdminReturnDetail }>(`/returns/${encodeURIComponent(n)}`).then((r) => r.return),
  returnAction: (n: string, action: 'approve' | 'reject' | 'pickup' | 'receive' | 'exchange' | 'refund', body: object) =>
    call<{ return: AdminReturnDetail }>('POST', `/returns/${encodeURIComponent(n)}/${action}`, body).then((r) => r.return),
  setReview: (id: string, status: string) => call<{ ok: true }>('PATCH', `/reviews/${id}`, { status }),
  removeSampleReviews: () => call<{ removed: number }>('POST', '/reviews/remove-samples'),

  customers: (q: URLSearchParams) => get<{ items: AdminCustomerRow[]; total: number; page: number; pageSize: number }>(`/customers?${q}`),
  customer: (id: string) =>
    get<{
      customer: { id: string; phone: string; name: string | null; email: string | null; whatsappOptIn: boolean; codBlocked: boolean; notes: string | null; createdAt: string; lastLoginAt: string | null };
      addresses: AddressDto[];
      orders: AdminOrderRow[];
    }>(`/customers/${id}`),
  updateCustomer: (id: string, b: { codBlocked?: boolean; notes?: string }) => call<{ ok: true }>('PATCH', `/customers/${id}`, b),

  settings: () => get<{ settings: Settings }>('/settings').then((r) => r.settings),
  saveSettings: (s: Settings) => call<{ settings: Settings }>('PUT', '/settings', s).then((r) => r.settings),
  audit: (page = 1) => get<{ items: { id: string; who: string; action: string; entity: string; entityId: string | null; data: unknown; createdAt: string }[] }>(`/audit?page=${page}`).then((r) => r.items),
};

/* ---- the logged-in staff member ---- */
let admin: AdminMe | null | undefined;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
export function setAdmin(next: AdminMe | null) {
  admin = next;
  listeners.forEach((l) => l());
}
export function useAdmin() {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => admin,
    () => undefined,
  );
  useEffect(() => {
    if (admin === undefined)
      loading ??= adminApi
        .me()
        .then(setAdmin, () => setAdmin(null))
        .finally(() => {
          loading = null;
        });
  }, []);
  return v;
}
