'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ui } from '@/lib/store';
import { useCounts } from './HeaderClient';
import { Bag, Grid, Heart, Home, SparkFill } from './icons';

/** Phone tab bar (home and shop pages). */
export function BottomNav() {
  const path = usePathname();
  const { bag, wish } = useCounts();
  return (
    <nav className="bnav" aria-label="Quick links">
      <Link href="/" className={path === '/' ? 'on' : ''}><Home />Home</Link>
      <button type="button" onClick={() => ui.open('menu')}><Grid />Categories</button>
      <Link href="/studio" className="mid"><i><SparkFill /></i>Studio</Link>
      <button type="button" onClick={() => ui.open('wish')}><Heart />Wishlist{wish > 0 && <b className="count">{wish}</b>}</button>
      <button type="button" onClick={() => ui.open('cart')}><Bag />Bag<b className="count">{bag}</b></button>
    </nav>
  );
}
