'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BRAND, FREE_SHIPPING_MIN_PAISE, formatINR, type CategoryNode, type ProductCard } from '@store/shared';
import { api } from '@/lib/api';
import { categoryHref, productHref, SHOP_LINKS } from '@/lib/links';
import { photo, SIZES } from '@/lib/img';
import { useMe } from '@/lib/session';
import { cart, lineTotal, ui, useCart, useWishlist, wishlist } from '@/lib/store';
import { addCardToBag } from './ProductCard';
import { SearchRow, useSuggestions } from './HeaderClient';
import { Bag, Chat, Check, Close, Search } from './icons';

type Panel = 'cart' | 'wish' | 'search' | 'menu' | null;

export function Overlays({ categories }: { categories: CategoryNode[] }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<{ msg: string; n: number } | null>(null);
  const path = usePathname();
  useEffect(() => setPanel(null), [path]);
  useEffect(
    () =>
      ui.on((e) => {
        if (e.type === 'toast') setToast((t) => ({ msg: e.message, n: (t?.n ?? 0) + 1 }));
        else if (e.type === 'open') setPanel(e.panel);
        else setPanel(null);
      }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPanel(null);
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, []);
  const close = () => setPanel(null);
  return (
    <>
      <div className={`scrim${panel === 'cart' || panel === 'wish' ? ' on' : ''}`} onClick={close} />
      <CartDrawer open={panel === 'cart'} onClose={close} />
      <WishDrawer open={panel === 'wish'} onClose={close} />
      {panel === 'search' && <SearchOverlay onClose={close} />}
      {panel === 'menu' && <MobileMenu categories={categories} onClose={close} />}
      <div className={`toast${toast ? ' on' : ''}`} role="status" aria-live="polite">
        <i><Check stroke="#fff" strokeWidth={3} /></i>
        <span>{toast?.msg}</span>
      </div>
    </>
  );
}

function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lines = useCart();
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const sub = lines.reduce((a, l) => a + lineTotal(l), 0);
  const left = Math.max(0, FREE_SHIPPING_MIN_PAISE - sub);
  const hasCustom = lines.some((l) => l.custom);
  return (
    <aside className={`drawer${open ? ' on' : ''}`} aria-label="Shopping bag" aria-hidden={!open}>
      <div className="dh"><h3>Your bag</h3><button className="ib" type="button" aria-label="Close bag" onClick={onClose}><Close /></button></div>
      <div className="ship">
        {count ? left ? <>You&apos;re <b>{formatINR(left)}</b> away from free shipping</> : <b>Free shipping unlocked!</b> : 'Free shipping on orders above ₹999'}
        <div className="bar"><i style={{ width: `${Math.min(100, (sub / FREE_SHIPPING_MIN_PAISE) * 100)}%` }} /></div>
      </div>
      <div className="items">
        {count ? (
          lines.map((l) => (
            <div className="it" key={l.key}>
              <div className="th"><img {...photo(l.image, '', { sizes: SIZES.thumb })} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
              <div>
                <b>{l.name}</b>
                <small>{l.desc}</small>
                {l.studio ? (
                  // the price depends on the size mix, so studio quantities are changed in the studio
                  <small><b>{l.qty} piece{l.qty === 1 ? '' : 's'}</b>{l.extraPaise ? ` · incl. ${formatINR(l.extraPaise)} digitizing` : ''}</small>
                ) : (
                  <div className="qty">
                    <button type="button" aria-label="Decrease" onClick={() => cart.setQty(l.key, l.qty - 1)}>−</button>
                    {l.qty}
                    <button type="button" aria-label="Increase" onClick={() => cart.setQty(l.key, l.qty + 1)}>+</button>
                  </div>
                )}
              </div>
              <div><div className="pp">{formatINR(lineTotal(l))}</div><button className="rm" type="button" onClick={() => cart.remove(l.key)}>Remove</button></div>
            </div>
          ))
        ) : (
          <div className="empty">Your bag is empty. Let’s find something colourful.</div>
        )}
      </div>
      <div className="df">
        {count ? (
          <>
            <div className="row"><span>Subtotal</span><b>{formatINR(sub)}</b></div>
            <div className="cod">{hasCustom ? 'Custom pieces are prepaid: UPI or card. COD is not available for this order.' : 'Cash on delivery available · incl. of all taxes'}</div>
            <Link className="btn btn-grad" href="/checkout" onClick={onClose}>Checkout securely <Bag /></Link>
            <div className="payrow"><span>UPI</span><span>Cards</span><span>Net banking</span>{!hasCustom && <span>COD</span>}</div>
          </>
        ) : (
          <Link className="btn btn-ink" href={SHOP_LINKS.all} onClick={onClose} style={{ width: '100%' }}>Start shopping</Link>
        )}
      </div>
    </aside>
  );
}

function WishDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const slugs = useWishlist();
  const [cards, setCards] = useState<ProductCard[]>([]);
  useEffect(() => {
    if (!open || !slugs.length) return;
    api.products('pageSize=60').then((r) => setCards(r.items)).catch(() => undefined);
  }, [open, slugs.length]);
  const saved = useMemo(() => slugs.map((s) => cards.find((c) => c.slug === s)).filter((c): c is ProductCard => !!c), [slugs, cards]);
  return (
    <aside className={`drawer${open ? ' on' : ''}`} aria-label="Wishlist" aria-hidden={!open}>
      <div className="dh"><h3>Wishlist</h3><button className="ib" type="button" aria-label="Close wishlist" onClick={onClose}><Close /></button></div>
      <div className="items">
        {saved.length ? (
          saved.map((p) => {
            const act = p.studio ? 'Add your logo' : p.personalisable ? 'Personalise' : p.needsSize ? 'Choose size' : '';
            return (
              <div className="it" key={p.slug}>
                <Link className="th" href={productHref(p)} onClick={onClose}><img {...photo(p.image.path, '', { sizes: SIZES.thumb })} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></Link>
                <div>
                  <b>{p.name}</b><small>{p.techLine}</small>
                  <div className="wact">
                    {act ? <Link className="pill" href={productHref(p)} onClick={onClose}>{act}</Link> : (
                      <button className="pill" type="button" onClick={() => { addCardToBag(p); wishlist.toggle(p.slug, false); }}>Move to bag</button>
                    )}
                  </div>
                </div>
                <div><div className="pp">{p.mrpPaise ? formatINR(p.pricePaise) : `From ${formatINR(p.pricePaise)}`}</div><button className="rm" type="button" onClick={() => wishlist.toggle(p.slug, false)}>Remove</button></div>
              </div>
            );
          })
        ) : (
          <div className="empty">
            Nothing saved yet. Tap the ♡ on anything you love and it waits here for you.
            <Link className="btn btn-ink" href={SHOP_LINKS.all} onClick={onClose} style={{ marginTop: 16, width: '100%' }}>Browse the shop</Link>
          </div>
        )}
      </div>
    </aside>
  );
}

const POPULAR = ['Name tote', 'Kurta', 'Hoop art', 'Cushion', 'Lehenga', 'Pet portrait'];

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const { items, total } = useSuggestions(q);
  return (
    <div className="overlay on" role="dialog" aria-label="Search">
      <div className="scrim on" onClick={onClose} />
      <div className="sbox">
        <label className="sfield">
          <Search />
          <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search kurtas, name hoops, totes…" />
          <button className="ib" type="button" aria-label="Close search" onClick={onClose}><Close /></button>
        </label>
        <div className="pop">{POPULAR.map((p) => <button key={p} type="button" onClick={() => setQ(p)}>{p}</button>)}</div>
        <div className="res">
          {!q.trim() && <div className="s-h">Trending now</div>}
          {items.length ? items.map((p) => <SearchRow key={p.id} p={p} onPick={onClose} />) : q.trim() && <div className="empty" style={{ padding: 24 }}>No match for “{q}”. Try “hoop”, “kurta” or “gift”.</div>}
          {q.trim() && total > 0 && <Link className="s-all" href={`/shop?q=${encodeURIComponent(q.trim())}`} onClick={onClose}>See all {total} result{total > 1 ? 's' : ''} →</Link>}
        </div>
      </div>
    </div>
  );
}

function MenuAccountLink() {
  const me = useMe();
  return <Link href={me ? '/account' : '/login'}><b>{me ? 'My account & orders' : 'Log in / sign up'}</b></Link>;
}

function MobileMenu({ categories, onClose }: { categories: CategoryNode[]; onClose: () => void }) {
  const subs = categories.flatMap((c) => c.children.map((s) => ({ ...s, parent: c.slug })));
  return (
    <div className="overlay on" role="dialog" aria-label="Menu">
      <div className="scrim on" onClick={onClose} />
      <div className="mpanel">
        <div className="mp-top"><Link className="logo" href="/">taanka</Link><button className="ib" type="button" aria-label="Close menu" onClick={onClose}><Close /></button></div>
        <Link className="mp-studio" href="/studio"><b>Design studio</b><span>Your logo, a motif or a name, on real fabric</span></Link>
        <h6>Shop by category</h6>
        <div className="mp-cats">
          {subs.map((s) => (
            <Link key={s.slug} href={categoryHref(s.parent, s.slug)}>
              <span>{s.image && <img {...photo(s.image, '', { sizes: 72, width: 200, height: 250 })} />}</span>
              {s.name}
            </Link>
          ))}
        </div>
        <nav className="mp-links">
          <MenuAccountLink />
          <Link href={SHOP_LINKS.all}>All products</Link>
          <Link href={SHOP_LINKS.new}>New arrivals</Link>
          <Link href={SHOP_LINKS.personalised}>Personalise with a name</Link>
          <Link href={SHOP_LINKS.under999}>Gifts under ₹999</Link>
          <Link href={categoryHref('corporate')}>Corporate &amp; bulk orders</Link>
        </nav>
        <a className="btn btn-wa mp-wa" href={`https://wa.me/${BRAND.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener"><Chat />Chat with the studio</a>
      </div>
    </div>
  );
}
