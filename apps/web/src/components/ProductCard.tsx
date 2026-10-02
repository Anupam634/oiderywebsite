'use client';
import Link from 'next/link';
import { useState } from 'react';
import { formatINR, percentOff, type ProductCard as Card } from '@store/shared';
import { productHref } from '@/lib/links';
import { photo, SIZES } from '@/lib/img';
import { cart, ui, useWishlist, wishlist } from '@/lib/store';
import { Bag, Heart, Lens, Plus, Spark } from './icons';

export function addCardToBag(p: Card) {
  if (!p.defaultVariantId) return;
  cart.add({
    key: p.defaultVariantId,
    variantId: p.defaultVariantId,
    slug: p.slug,
    name: p.name,
    image: p.image.path,
    qty: 1,
    unitPricePaise: p.pricePaise,
    unitMrpPaise: p.mrpPaise ?? p.pricePaise,
    desc: `${p.techLine} · ${p.badge?.text ?? 'Ready to ship'}`,
    custom: false,
  });
  ui.toast(`${p.name} added to your bag`);
  ui.open('cart');
}

// the label is hidden on small cards, so the name says what the icon does and to which product
function Quick({ p, href }: { p: Card; href: string }) {
  if (p.studio) return <Link className="quick cz" href={href} aria-label={`Add your logo: ${p.name}`}><Spark /><span>Add your logo</span></Link>;
  if (p.personalisable) return <Link className="quick cz" href={href} aria-label={`Personalise it: ${p.name}`}><Spark /><span>Personalise it</span></Link>;
  if (p.needsSize) return <Link className="quick" href={href} aria-label={`Choose size: ${p.name}`}><Plus /><span>Choose size</span></Link>;
  return <button className="quick" type="button" aria-label={`Add to bag: ${p.name}`} onClick={() => addCardToBag(p)}><Bag /><span>Add to bag</span></button>;
}

export function ProductCard({ p, index = 0, priority = false, sizes = SIZES.card }: { p: Card; index?: number; priority?: boolean; sizes?: string }) {
  const href = productHref(p);
  const saved = useWishlist().includes(p.slug);
  const [zoomed, setZoomed] = useState(false);
  const off = percentOff(p.pricePaise, p.mrpPaise);
  const reviews = p.rating.count > 999 ? (p.rating.count / 1000).toFixed(1) + 'k' : p.rating.count;
  return (
    <article className={`card in${zoomed ? ' zoomed' : ''}`} data-id={p.slug} style={{ ['--rd' as string]: `${(index % 5) * 0.05}s` }}>
      <div className="art">
        <Link className="artlink" href={href} aria-label={p.name}>
          <img className="ph1" {...photo(p.image.path, p.image.alt, { sizes, priority })} />
          {p.hoverImage && <img className="ph2" {...photo(p.hoverImage.path, '', { sizes })} />}
        </Link>
        {p.badge && <span className={`badge bg-${p.badge.tone}`}>{p.badge.text}</span>}
        <button
          className={`fav${saved ? ' on' : ''}`}
          type="button"
          aria-pressed={saved}
          aria-label={`Save ${p.name} to wishlist`}
          onClick={() => ui.toast(wishlist.toggle(p.slug) ? 'Saved to your wishlist' : 'Removed from your wishlist')}
        >
          <Heart />
        </button>
        {p.hoverImage && (
          <button className="zbtn" type="button" aria-label="See the embroidery up close" aria-pressed={zoomed} onClick={() => setZoomed((z) => !z)}>
            <Lens />
          </button>
        )}
        <span className="rpill" aria-label={`Rated ${p.rating.avg} from ${p.rating.count} reviews`}>
          {p.rating.avg.toFixed(1)}<i>★</i><span>{reviews}</span>
        </span>
        <Quick p={p} href={href} />
      </div>
      <div className="info">
        <h3 className="pname"><Link href={href}>{p.name}</Link></h3>
        <div className="tech">{p.techLine}</div>
        {p.mrpPaise ? (
          <div className="price"><b>{formatINR(p.pricePaise)}</b><s>{formatINR(p.mrpPaise)}</s>{off > 0 && <em>{off}% off</em>}</div>
        ) : (
          <div className="price"><b><small>From</small> {formatINR(p.pricePaise)}</b><span className="per">/pc at 50+</span></div>
        )}
        <div className="meta">
          {p.swatches.length ? (
            <span className="dots" role="img" aria-label={`${p.swatches.length} colours`}>{p.swatches.map((c) => <i key={c} style={{ background: c }} />)}</span>
          ) : (
            <span className={`ship1${p.shipNote ? ' slow' : ''}`}>{p.shipNote ?? 'Ships in 1–2 days'}</span>
          )}
        </div>
      </div>
    </article>
  );
}
