'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ProductCard as Card } from '@store/shared';
import { SIZES } from '@/lib/img';
import { ProductCard } from '../ProductCard';
import { Arrow, ChevronLeft, ChevronRight } from '../icons';

/** A horizontal product row with arrows on desktop and swipe on phones. */
export function Rail({ title, sub, href, items }: { title: string; sub: string; href?: string; items: Card[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  useEffect(() => {
    const r = ref.current!;
    const upd = () => setEdge({ start: r.scrollLeft < 8, end: r.scrollLeft + r.clientWidth >= r.scrollWidth - 8 });
    upd();
    r.addEventListener('scroll', upd, { passive: true });
    addEventListener('resize', upd);
    return () => {
      r.removeEventListener('scroll', upd);
      removeEventListener('resize', upd);
    };
  }, []);
  const by = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.9, behavior: 'smooth' });
  return (
    <section className="sx">
      <div className="wrap">
        <div className="rh">
          <div><h2>{title}</h2><p>{sub}</p></div>
          {href && <Link className="all" href={href}>View all <Arrow /></Link>}
          <div className="rnav">
            <button type="button" aria-label="Scroll left" disabled={edge.start} onClick={() => by(-1)}><ChevronLeft /></button>
            <button type="button" aria-label="Scroll right" disabled={edge.end} onClick={() => by(1)}><ChevronRight /></button>
          </div>
        </div>
        <div className="rail" ref={ref}>
          {items.map((p, i) => <ProductCard key={p.id} p={p} index={i} sizes={SIZES.rail} />)}
        </div>
      </div>
    </section>
  );
}
