'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatINR, type ProductCard } from '@store/shared';
import { api } from '@/lib/api';
import { productHref } from '@/lib/links';
import { photo } from '@/lib/img';
import { useMe } from '@/lib/session';
import { ui, useCart, useWishlist } from '@/lib/store';
import { Bag, Heart, Menu, Search, User } from './icons';

export function MenuButton() {
  return (
    <button className="ib burger" type="button" aria-label="Open menu" onClick={() => ui.open('menu')}>
      <Menu />
    </button>
  );
}

export function MobileSearchButton() {
  return (
    <button className="msearch" type="button" onClick={() => ui.open('search')}>
      <Search />
      Search kurtas, cushions, name gifts…
    </button>
  );
}

export function SearchRow({ p, onPick }: { p: ProductCard; onPick?: () => void }) {
  return (
    <Link className="srow" href={productHref(p)} onClick={onPick}>
      <span className="th"><img {...photo(p.image.path, '', { sizes: 44 })} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></span>
      <span><b>{p.name}</b><small>{p.category.name}</small></span>
      <b>{p.mrpPaise ? formatINR(p.pricePaise) : `From ${formatINR(p.pricePaise)}`}</b>
    </Link>
  );
}

/** debounced search suggestions; empty query shows bestsellers */
export function useSuggestions(q: string) {
  const [state, setState] = useState<{ items: ProductCard[]; total: number; loading: boolean }>({ items: [], total: 0, loading: false });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      try {
        const r = q.trim() ? await api.search(q.trim(), 6) : await api.products('pageSize=4').then((l) => ({ items: l.items, total: l.total }));
        if (alive) setState({ ...r, loading: false });
      } catch {
        if (alive) setState({ items: [], total: 0, loading: false });
      }
    }, 160);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);
  return state;
}

export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  const { items, total } = useSuggestions(open ? q : '');
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  return (
    <form
      className="hsearch"
      role="search"
      ref={box}
      onSubmit={(e) => {
        e.preventDefault();
        if (!q.trim()) return;
        setOpen(false);
        router.push(`/shop?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search />
      <input
        type="search"
        value={q}
        placeholder="Search kurtas, hoops, gifts…"
        aria-label="Search products"
        enterKeyHint="search"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      />
      {open && (
        <div className="hsres">
          <div className="s-h">{q.trim() ? `${total} match${total === 1 ? '' : 'es'}` : 'Trending now'}</div>
          {items.length ? items.map((p) => <SearchRow key={p.id} p={p} onPick={() => setOpen(false)} />) : q.trim() && <div className="s-none">No match for “{q}”. Try “kurta”, “hoop” or “gift”.</div>}
          {q.trim() && total > 0 && <Link className="s-all" href={`/shop?q=${encodeURIComponent(q.trim())}`} onClick={() => setOpen(false)}>See all results →</Link>}
        </div>
      )}
    </form>
  );
}

export function useCounts() {
  const lines = useCart();
  const wish = useWishlist();
  return { bag: lines.reduce((a, l) => a + l.qty, 0), wish: wish.length };
}

/** "Account" in the header: the login page when logged out, the account page (with the shopper's initial) when in */
function AccountLink() {
  const me = useMe();
  const initial = me?.name?.trim()[0]?.toUpperCase();
  return (
    <Link className="ib lab acc" href={me ? '/account' : '/login'} aria-label={me ? 'My account' : 'Log in'}>
      {initial ? <b className="avatar" aria-hidden="true">{initial}</b> : <User />}
      <span>{me ? 'Account' : 'Log in'}</span>
    </Link>
  );
}

export function HeaderIcons() {
  const { bag, wish } = useCounts();
  useEffect(() => {
    const nav = document.getElementById('nav');
    const on = () => nav?.classList.toggle('scrolled', scrollY > 30);
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);
  return (
    <div className="icons">
      <button className="ib lab sbtn" type="button" aria-label="Search" onClick={() => ui.open('search')}><Search /></button>
      <AccountLink />
      <button className="ib lab" type="button" aria-label={wish ? `Wishlist, ${wish} saved` : 'Wishlist'} onClick={() => ui.open('wish')}>
        <Heart /><span>Wishlist</span>{wish > 0 && <b className="count" aria-hidden="true">{wish}</b>}
      </button>
      <button className="ib lab" type="button" aria-label={`Bag, ${bag} item${bag === 1 ? '' : 's'}`} onClick={() => ui.open('cart')}>
        <Bag /><span>Bag</span><b className="count" aria-hidden="true">{bag}</b>
      </button>
    </div>
  );
}
