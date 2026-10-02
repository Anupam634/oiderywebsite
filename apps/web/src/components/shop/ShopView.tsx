'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import {
  COLOUR_FAMILIES,
  OCCASIONS,
  PRICE_BUCKETS,
  SORTS,
  TOP_RATED_MIN,
  TYPE_LABEL,
  TYPE_PARAM,
  activeFilterCount,
  type CategoryNode,
  type ListingQuery,
} from '@store/shared';
import type { Listing } from '@/lib/api';
import { photo, SIZES } from '@/lib/img';
import { shopHref } from '@/lib/shop';
import { ProductCard } from '../ProductCard';
import { ChevronDown, Close } from '../icons';

type Group = 'cat' | 'type' | 'price' | 'occ' | 'fam' | 'rating';
const LISTS = ['sub', 'type', 'price', 'occ', 'fam'] as const;
type ListKey = (typeof LISTS)[number];

export function ShopView({ q, tree, listing, title }: { q: ListingQuery; tree: CategoryNode[]; listing: Listing; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<'filters' | 'sort' | null>(null);
  const [open, setOpen] = useState<Set<Group>>(new Set(['cat', 'type', 'price']));
  const go = (next: Partial<ListingQuery>) => start(() => router.push(shopHref({ ...q, ...next, page: 1 }), { scroll: false }));
  const toggle = (k: ListKey, v: string) => go({ [k]: (q[k] as string[]).includes(v) ? (q[k] as string[]).filter((x) => x !== v) : [...q[k], v] } as Partial<ListingQuery>);
  const clearAll = () => go({ cat: undefined, sub: [], type: [], price: [], occ: [], fam: [], rating: false, q: undefined, sort: 'popular' });
  const f = listing.facets;
  const cat = tree.find((c) => c.slug === q.cat);
  const n = activeFilterCount(q);

  useEffect(() => {
    document.body.style.overflow = sheet ? 'hidden' : '';
    return () => void (document.body.style.overflow = '');
  }, [sheet]);
  useEffect(() => {
    const hh = () => document.documentElement.style.setProperty('--hh', (document.getElementById('nav')?.offsetHeight ?? 60) + 'px');
    hh();
    addEventListener('resize', hh);
    return () => removeEventListener('resize', hh);
  }, []);

  const opt = (key: string, label: ReactNode, count: number, on: boolean, onChange: () => void, radio = false, extra?: ReactNode) => (
    <label className={`fo${!count && !on ? ' zero' : ''}`} key={key}>
      <input type={radio ? 'radio' : 'checkbox'} checked={on} disabled={!count && !on} onChange={onChange} />
      {extra}
      <span>{label}</span>
      <small>{count}</small>
    </label>
  );
  const group = (id: Group, name: string, body: ReactNode) => (
    <details className="fg" key={id} open={open.has(id)} onToggle={(e) => {
      const isOpen = (e.currentTarget as HTMLDetailsElement).open;
      setOpen((s) => {
        const next = new Set(s);
        if (isOpen) next.add(id);
        else next.delete(id);
        return next;
      });
    }}>
      <summary>{name}<ChevronDown /></summary>
      <div className="fg-b">{body}</div>
    </details>
  );

  const chips: [string, () => void][] = [];
  if (q.q) chips.push([`“${q.q}”`, () => go({ q: undefined })]);
  if (cat && !q.sub.length) chips.push([cat.name, () => go({ cat: undefined, sub: [] })]);
  q.sub.forEach((s) => chips.push([cat?.children.find((c) => c.slug === s)?.name ?? s, () => toggle('sub', s)]));
  q.type.forEach((t) => chips.push([TYPE_LABEL[TYPE_PARAM[t]!], () => toggle('type', t)]));
  q.price.forEach((p) => chips.push([PRICE_BUCKETS.find((b) => b.key === p)!.label, () => toggle('price', p)]));
  q.occ.forEach((o) => chips.push([OCCASIONS.find((x) => x.key === o)!.label, () => toggle('occ', o)]));
  q.fam.forEach((fm) => chips.push([COLOUR_FAMILIES.find((x) => x.key === fm)!.label, () => toggle('fam', fm)]));
  if (q.rating) chips.push([`${TOP_RATED_MIN}★ & above`, () => go({ rating: false })]);

  const subChips = cat
    ? [
        ...(cat.children.length > 1 ? [{ href: shopHref({ cat: cat.slug }), label: `All ${cat.name.toLowerCase()}`, img: cat.children[0]?.image, on: !q.sub.length }] : []),
        ...cat.children.map((s) => ({ href: shopHref({ cat: cat.slug, sub: [s.slug] }), label: s.name, img: s.image, on: q.sub.length === 1 && q.sub[0] === s.slug })),
      ]
    : [
        ...tree.map((c) => ({ href: shopHref({ cat: c.slug }), label: c.name, img: c.children[0]?.image, on: false })),
        { href: '/shop?type=personalise', label: 'Personalise it', img: 'photos/r-model.jpg', on: q.type.length === 1 && q.type[0] === 'personalise' },
        { href: '/shop?sort=new', label: 'New arrivals', img: 'photos/cherry.jpg', on: q.sort === 'new' && !q.type.length },
      ];

  const cards = listing.items.map((p, i) => <ProductCard key={p.id} p={p} index={i} priority={i < 4} />);
  if (listing.items.length >= 7 && !q.q)
    cards.splice(5, 0,
      <Link key="promo" className="promo-tile" href="/studio">
        <span className="pt-k">Design studio</span>
        <b>Can’t find it? Design your own.</b>
        <span>Your logo, a motif or a name on a tee, hoodie, cap or tote. See it live first.</span>
        <img {...photo('photos/r-hoodie-d.jpg', '', { sizes: SIZES.card })} />
        <em>Open the studio →</em>
      </Link>,
    );

  return (
    <main id="top" className="plp">
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span aria-hidden="true">›</span>
          {cat ? (
            <>
              <Link href="/shop">Shop</Link><span aria-hidden="true">›</span>
              {q.sub.length === 1 ? (
                <><Link href={shopHref({ cat: cat.slug })}>{cat.name}</Link><span aria-hidden="true">›</span><span aria-current="page">{cat.children.find((c) => c.slug === q.sub[0])?.name}</span></>
              ) : <span aria-current="page">{cat.name}</span>}
            </>
          ) : <span aria-current="page">Shop</span>}
        </nav>
        <div className="plp-head">
          <h1>{title}</h1>
          <p>{q.q ? `${listing.total} piece${listing.total === 1 ? '' : 's'} match your search.` : cat && !q.sub.length && cat.blurb ? cat.blurb : `${listing.total} piece${listing.total === 1 ? '' : 's'}, stitched in our studio.`}</p>
        </div>
        <div className="subcats">
          {subChips.map((c) => (
            <Link key={c.href} className={`sc${c.on ? ' on' : ''}`} href={c.href} aria-current={c.on || undefined}>
              <span>{c.img && <img {...photo(c.img, '', { sizes: 48, width: 200, height: 250 })} />}</span>{c.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="wrap plp-body">
        <aside className={`filters${sheet === 'filters' ? ' on' : ''}`} aria-label="Filters">
          <div className="f-top">
            <b>Filters</b>
            <button type="button" className="link f-clr" onClick={clearAll}>Clear all</button>
            <button className="ib f-x" type="button" aria-label="Close filters" onClick={() => setSheet(null)}><Close /></button>
          </div>
          {group('cat', 'Category', <>
            {opt('all', 'All products', f.all, !q.cat, () => go({ cat: undefined, sub: [] }), true)}
            {tree.map((c) => (
              <div key={c.slug}>
                {opt(c.slug, c.name, f.cat[c.slug] ?? 0, q.cat === c.slug, () => go({ cat: c.slug, sub: [] }), true)}
                {q.cat === c.slug && <div className="fsub">{c.children.map((s) => opt(s.slug, s.name, f.sub[s.slug] ?? 0, q.sub.includes(s.slug), () => toggle('sub', s.slug)))}</div>}
              </div>
            ))}
          </>)}
          {group('type', 'Type', Object.entries(TYPE_PARAM).map(([k, t]) => opt(k, TYPE_LABEL[t], f.type[k] ?? 0, q.type.includes(k), () => toggle('type', k))))}
          {group('price', 'Price', PRICE_BUCKETS.map((b) => opt(b.key, b.label, f.price[b.key] ?? 0, q.price.includes(b.key), () => toggle('price', b.key))))}
          {group('occ', 'Occasion', OCCASIONS.map((o) => opt(o.key, o.label, f.occ[o.key] ?? 0, q.occ.includes(o.key), () => toggle('occ', o.key))))}
          {group('fam', 'Colour', COLOUR_FAMILIES.map((c) => opt(c.key, c.label, f.fam[c.key] ?? 0, q.fam.includes(c.key), () => toggle('fam', c.key), false, <i className="fsw" style={{ background: c.swatch }} />)))}
          {group('rating', 'Rating', opt('r', `${TOP_RATED_MIN}★ & above`, f.rating, q.rating, () => go({ rating: !q.rating })))}
          <div className="f-foot">
            <button className="btn btn-lite" type="button" onClick={clearAll}>Clear all</button>
            <button className="btn btn-grad" type="button" onClick={() => setSheet(null)}>Show {listing.total} result{listing.total === 1 ? '' : 's'}</button>
          </div>
        </aside>

        <section className="results" aria-label="Products" style={{ opacity: pending ? 0.55 : 1, transition: 'opacity .2s' }}>
          <div className="mfbar">
            <button type="button" onClick={() => setSheet('sort')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></svg>
              {q.sort === 'popular' ? 'Sort' : SORTS.find((s) => s.key === q.sort)?.label}
            </button>
            <button type="button" onClick={() => setSheet('filters')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              Filter{n > 0 && <b>{n}</b>}
            </button>
          </div>
          <h2 className="vh">Products</h2>
          <div className="toolbar">
            <span className="rcount" aria-live="polite">{listing.total} product{listing.total === 1 ? '' : 's'}</span>
            <div className="applied">
              {chips.map(([label, rm]) => (
                <button key={label} type="button" className="ach" aria-label={`Remove filter: ${label}`} onClick={rm}>{label}<Close /></button>
              ))}
              {chips.length > 0 && <button type="button" className="ach clr" onClick={clearAll}>Clear all</button>}
            </div>
            <label className="sortsel">
              <span>Sort by</span>
              <select value={q.sort} onChange={(e) => go({ sort: e.target.value })}>
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>
          {listing.items.length ? <div className="grid sgrid">{cards}</div> : (
            <div className="noresults">
              <h3>Nothing matches all of these</h3>
              <p>Try removing a filter, or tell us what you have in mind and we’ll stitch it for you.</p>
              <div className="nr-cta"><button className="btn btn-ink" type="button" onClick={clearAll}>Clear all filters</button><Link className="btn btn-lite" href="/studio">Design your own</Link></div>
            </div>
          )}
        </section>
      </div>

      {sheet && <div className="scrim on" style={{ zIndex: 91 }} onClick={() => setSheet(null)} />}
      <div className={`ssheet${sheet === 'sort' ? ' on' : ''}`} role="dialog" aria-label="Sort products">
        <div className="ss-h"><b>Sort by</b></div>
        {SORTS.map((s) => (
          <label className="so" key={s.key}>
            <input type="radio" name="msort" checked={q.sort === s.key} onChange={() => { go({ sort: s.key }); setTimeout(() => setSheet(null), 180); }} />
            <span>{s.label}</span>
          </label>
        ))}
      </div>
    </main>
  );
}
