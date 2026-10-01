'use client';
import { useSyncExternalStore } from 'react';
import type { StudioLineSpec } from '@store/shared';

/* Bag and wishlist, kept in localStorage and shared across tabs and pages.
   Prices here are for display; the API re-prices the bag before payment. */

export interface CartLine {
  key: string;
  variantId: string;
  slug: string;
  name: string;
  image: string;
  qty: number;
  unitPricePaise: number;
  unitMrpPaise: number;
  desc: string;
  custom: boolean;
  personalisation?: { text: string; font: string; thread: string; flowers?: number } | null;
  giftWrap?: boolean;
  /** one-time charge on the line (logo digitizing) */
  extraPaise?: number;
  /** a design-studio piece: priced by the API from this spec instead of a catalogue variant */
  studio?: StudioLineSpec;
}

export const lineTotal = (l: CartLine) => l.qty * l.unitPricePaise + (l.extraPaise ?? 0);

function persisted<T>(key: string, fallback: T) {
  let value = fallback;
  let loaded = false;
  const listeners = new Set<() => void>();
  const load = () => {
    if (loaded || typeof window === 'undefined') return;
    loaded = true;
    try {
      const raw = localStorage.getItem(key);
      if (raw) value = JSON.parse(raw) as T;
    } catch {
      /* private mode or bad JSON: start empty */
    }
    window.addEventListener('storage', (e) => {
      if (e.key !== key) return;
      try {
        value = e.newValue ? (JSON.parse(e.newValue) as T) : fallback;
      } catch {
        value = fallback;
      }
      listeners.forEach((l) => l());
    });
  };
  return {
    get: () => (load(), value),
    set(next: T) {
      value = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage full or blocked */
      }
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      load();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    server: () => fallback,
  };
}

const cartStore = persisted<CartLine[]>('store-cart-v1', []);
const wishStore = persisted<string[]>('store-wish-v1', []);
const EMPTY_CART: CartLine[] = [];
const EMPTY_WISH: string[] = [];

export const useCart = () => useSyncExternalStore(cartStore.subscribe, cartStore.get, () => EMPTY_CART);
export const useWishlist = () => useSyncExternalStore(wishStore.subscribe, wishStore.get, () => EMPTY_WISH);

export const cart = {
  add(line: CartLine) {
    const lines = cartStore.get();
    const same = !line.custom && lines.find((l) => l.key === line.key);
    cartStore.set(same ? lines.map((l) => (l === same ? { ...l, qty: l.qty + line.qty } : l)) : [...lines, line]);
  },
  setQty(key: string, qty: number) {
    cartStore.set(qty < 1 ? cartStore.get().filter((l) => l.key !== key) : cartStore.get().map((l) => (l.key === key ? { ...l, qty } : l)));
  },
  remove(key: string) {
    cartStore.set(cartStore.get().filter((l) => l.key !== key));
  },
  clear() {
    cartStore.set([]);
  },
};

export const wishlist = {
  has: (slug: string) => wishStore.get().includes(slug),
  toggle(slug: string, force?: boolean) {
    const on = force ?? !wishStore.get().includes(slug);
    wishStore.set(on ? [...new Set([...wishStore.get(), slug])] : wishStore.get().filter((s) => s !== slug));
    return on;
  },
};

/* ---------- small UI event bus: toasts and drawers ---------- */
type UiEvent = { type: 'toast'; message: string } | { type: 'open'; panel: 'cart' | 'wish' | 'search' | 'menu' } | { type: 'close' };
const uiListeners = new Set<(e: UiEvent) => void>();
export const ui = {
  emit: (e: UiEvent) => uiListeners.forEach((l) => l(e)),
  on(l: (e: UiEvent) => void) {
    uiListeners.add(l);
    return () => {
      uiListeners.delete(l);
    };
  },
  toast: (message: string) => ui.emit({ type: 'toast', message }),
  open: (panel: 'cart' | 'wish' | 'search' | 'menu') => ui.emit({ type: 'open', panel }),
};
