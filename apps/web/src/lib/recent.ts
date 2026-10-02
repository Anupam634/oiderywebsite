'use client';
import { useEffect, useState } from 'react';
import type { ProductCard } from '@store/shared';
import { api } from './api';

/* Recently viewed products: kept in this browser only, newest first. Stored as product cards so a rail can show
   them at once; prices and stock are refreshed from the catalogue before they're shown. */

const KEY = 'store-recent-v1';
const MAX = 12;
const MAX_AGE_DAYS = 45;

type Seen = ProductCard & { seenAt: number };

function read(): Seen[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Seen[];
    const fresh = Date.now() - MAX_AGE_DAYS * 86_400_000;
    return Array.isArray(v) ? v.filter((c) => c && c.slug && c.seenAt > fresh) : [];
  } catch {
    return [];
  }
}

/** remember a product page view (just the card fields) */
export function rememberViewed(p: ProductCard) {
  try {
    const card: Seen = {
      id: p.id, code: p.code, slug: p.slug, name: p.name, type: p.type, techLine: p.techLine, category: p.category, parent: p.parent,
      pricePaise: p.pricePaise, mrpPaise: p.mrpPaise, badge: p.badge, image: p.image, hoverImage: p.hoverImage, rating: p.rating,
      swatches: p.swatches, shipNote: p.shipNote, needsSize: p.needsSize, personalisable: p.personalisable, studio: p.studio,
      isUnique: p.isUnique, defaultVariantId: p.defaultVariantId, seenAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify([card, ...read().filter((c) => c.slug !== p.slug)].slice(0, MAX)));
  } catch {
    /* storage full or blocked: nothing to remember */
  }
}

/** this browser's recently viewed products (not `exclude`), with today's prices; empty until mounted */
export function useRecentlyViewed(exclude?: string): ProductCard[] {
  const [items, setItems] = useState<ProductCard[]>([]);
  useEffect(() => {
    const seen = read().filter((c) => c.slug !== exclude);
    if (!seen.length) return setItems([]);
    setItems(seen);
    let live = true;
    // swap in today's cards; pieces no longer in the shop drop out
    api.products('pageSize=60')
      .then((r) => {
        if (!live) return;
        const now = new Map(r.items.map((c) => [c.slug, c]));
        setItems(seen.map((c) => now.get(c.slug)).filter((c): c is ProductCard => !!c));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [exclude]);
  return items;
}
