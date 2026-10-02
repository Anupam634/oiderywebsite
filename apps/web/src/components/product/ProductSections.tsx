'use client';
import { useRef, useState } from 'react';
import { SIZE_GUIDES, type ProductDetail } from '@store/shared';
import { photo as photoProps } from '@/lib/img';
import { media } from '@/lib/media';
import { ProductCard } from '../ProductCard';
import { Cash, Check, Close, Gift, Lens, Plus, Swap, Truck } from '../icons';
import { LiveCanvas } from './live';

const MACHINE = 'Every piece is digitized in-house, stitched on our embroidery machine, then trimmed, steamed and checked by hand.';
const HAND = 'Stitched by hand in our studio, then backed with felt and checked once more before it’s boxed.';
const TABS = [['desc', 'Description'], ['spec', 'Embroidery details'], ['care', 'Care'], ['ship', 'Shipping & returns']] as const;
const WHY_COLOURS = [['#FF2E93', '#C2006A'], ['#FF8A00', '#FF4B2B'], ['#00B3A6', '#3D2BD6']];

export function ProductSections({ p, reviewShots, liveClose }: { p: ProductDetail; reviewShots: Record<number, string>; liveClose: HTMLCanvasElement | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('desc');
  const [rf, setRf] = useState<'all' | 'photo' | '5'>('all');
  const [helpful, setHelpful] = useState<Record<string, boolean>>({});
  const [photo, setPhoto] = useState<number | null>(null);
  const custom = p.shipMode !== 'READY';
  const reviews = p.reviews.items;
  const photoOf = (i: number) => {
    const r = reviews[i];
    if (!r) return null;
    if (r.preview) return reviewShots[i] ?? p.image.path;
    return r.photoPath ?? null;
  };
  const withPhoto = reviews.map((_, i) => i).filter((i) => photoOf(i));
  const shown = reviews.map((r, i) => ({ r, i })).filter(({ r, i }) => rf === 'all' || (rf === 'photo' && photoOf(i)) || (rf === '5' && r.rating === 5));
  const variantOf = (i: number) => {
    const r = reviews[i]!;
    if (r.preview) return [p.variants.find((v) => v.colourValue === r.preview!.colour)?.colourName, r.preview.text ? `“${r.preview.text}”` : 'No name'].filter(Boolean).join(' · ');
    return [p.variants[0]?.colourName, p.variants.length > 1 ? p.variants[i % p.variants.length]?.size : ''].filter(Boolean).join(' · ');
  };
  const faq: [string, string][] = [
    ...p.details.faq.map((f) => [f.q, f.a] as [string, string]),
    p.livePreview
      ? ['Will it look exactly like the preview?', 'Very close. The preview is our stitch engine on a real photo of the blank piece, using the same thread colours we stitch with. Our digitizer may fine-tune small details, and you get a stitch proof on WhatsApp before we start.']
      : ['Can I see my design before it’s stitched?', custom || p.personalisation ? 'Yes. For personalised and made-to-order pieces we WhatsApp you a proof within 24 hours, and we only start once you approve it.' : 'This piece is ready-made, so what you see is what you get. For your own version, try the design studio and we’ll send you a stitch proof first.'],
    ['How long will it take to reach me?', 'Ready-to-ship pieces leave our studio in 1–2 days. Personalised and made-to-order pieces take 5–7 days to stitch (pet portraits about 10). Delivery then takes 2–5 days, depending on your pincode.'],
    ['Can I return or exchange it?', 'Ready-made pieces can be exchanged within 7 days if they’re unused. Personalised and made-to-order pieces can’t be returned, but we fix any stitching fault for free.'],
    ['How do I care for it?', p.details.care.join('. ') + '.'],
    ['Is cash on delivery available?', 'Yes, on ready-to-ship pieces. Personalised and made-to-order pieces are prepaid by UPI, card or net banking.'],
    ['Do you ship outside India?', 'Not yet. International shipping is coming soon. Join our WhatsApp list to hear first.'],
  ];
  return (
    <>
      <section className="sec" style={{ paddingTop: 70 }}>
        <div className="wrap details">
          <div>
            <span className="kicker">The details</span>
            <h2 className="h2">Made slowly, <em>stitched to last</em></h2>
            <div className="tabs dtabs" role="tablist">
              {TABS.map(([k, label]) => <button key={k} className="tab" role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}
            </div>
            <div className="dpanel" key={tab}>
              {tab === 'desc' && (
                <>
                  <p>{p.story}</p>
                  <p>{p.handMade ? HAND : MACHINE}</p>
                  <div className="why">{p.details.why.map((w, i) => <div key={w.title} style={{ ['--a' as string]: WHY_COLOURS[i]![0], ['--b' as string]: WHY_COLOURS[i]![1] }}><b>{w.title}</b>{w.text}</div>)}</div>
                </>
              )}
              {tab === 'spec' && <dl className="spec">{p.details.spec.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>}
              {tab === 'care' && <ul>{p.details.care.map((c) => <li key={c}><Check /><span>{c}</span></li>)}</ul>}
              {tab === 'ship' && (
                <ul>
                  <li><Truck /><span>{p.petPhoto ? `Made for you: once you approve the sketch, we stitch it in about ${p.madeDays} days. Delivery then takes 2–5 days.` : custom ? `${p.shipMode === 'MADE' ? 'Made to order' : 'Personalised'}: we stitch it in ${p.madeDays ?? '5–7'} days, then delivery takes 2–5 days.` : 'Ready to ship: leaves our studio in 1–2 days, then delivery takes 2–5 days. Personalised pieces take 5–7 days.'}</span></li>
                  <li><Cash /><span>{custom ? 'Prepaid only, by UPI, card or net banking.' : 'Cash on delivery is available on ready-made pieces.'}</span></li>
                  <li><Swap /><span>{custom ? 'Made just for you, so it can’t be returned. We fix any stitching fault for free.' : 'Exchange within 7 days if it’s unused and still has its tags.'}</span></li>
                  <li><Gift /><span>Free shipping on orders above ₹999. Gift wrap is available.</span></li>
                </ul>
              )}
            </div>
          </div>
          <UpClose p={p} liveClose={liveClose} />
        </div>
      </section>

      <section className="sec" id="reviews" style={{ paddingTop: 40 }}>
        <div className="wrap">
          <div className="head">
            <div><span className="kicker">Reviews</span><h2 className="h2">What people <em>are saying</em></h2></div>
            {reviews.some((r) => r.isSample) && <span className="sample dark">Sample reviews · replace with real ones</span>}
          </div>
          <div className="rsum">
            <div className="rscore">
              <div className="rbig">{p.reviews.avg.toFixed(1)}</div>
              <div className="stars" aria-label={`${p.reviews.avg} out of 5`}>★★★★★</div>
              <small>Based on {p.reviews.count} reviews</small>
              <div className="bars2">{p.reviews.distribution.map((v, i) => <div className="brow" key={i}><span>{5 - i}★</span><div className="bar"><i style={{ width: `${v}%` }} /></div><span>{v}%</span></div>)}</div>
            </div>
            <div>
              {withPhoto.length > 0 && (
                <>
                  <div className="olabel">Photos from customers</div>
                  <div className="photos">{withPhoto.map((i) => <button key={i} className="photo" type="button" aria-label={`Photo from ${reviews[i]!.authorName}`} onClick={() => setPhoto(i)}><img {...photoProps(photoOf(i)!, '', { sizes: 118 })} /><span>{reviews[i]!.authorName.split(' ')[0]}</span></button>)}</div>
                </>
              )}
              <div className="rfil">
                {([['all', 'All reviews'], ['photo', 'With photos'], ['5', '5 stars']] as const).map(([k, l]) => <button key={k} className="pill" type="button" aria-pressed={rf === k} onClick={() => setRf(k)}>{l}</button>)}
              </div>
              <div className="rlist">
                {shown.map(({ r, i }) => (
                  <article className="rcard" key={r.id}>
                    <div className="top"><span className="stars" aria-label={`${r.rating} out of 5 stars`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span><span className="who2">{r.authorName}<small>{r.city} · {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</small></span></div>
                    <div><span className="var">{variantOf(i)}</span></div>
                    <p>{r.body}</p>
                    {photoOf(i) && <button className="rph" type="button" aria-label={`See the photo from ${r.authorName}`} onClick={() => setPhoto(i)}><img {...photoProps(photoOf(i)!, '', { sizes: 84 })} /></button>}
                    <button className="help" type="button" aria-pressed={!!helpful[r.id]} onClick={() => setHelpful((h) => ({ ...h, [r.id]: !h[r.id] }))}><Check /><span>Helpful ({r.helpfulCount + (helpful[r.id] ? 1 : 0)})</span></button>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 40 }}>
        <div className="wrap faqwrap">
          <div><span className="kicker">Good to know</span><h2 className="h2">Questions, <em>answered</em></h2><p className="sub">Still wondering about something? The studio replies on WhatsApp within a few hours.</p></div>
          <div className="faq">{faq.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}<i><Plus /></i></summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      {p.related.length > 0 && (
        <section className="sec shop" style={{ paddingTop: 80 }}>
          <div className="wrap">
            <div className="head"><div><span className="kicker">Pairs well with</span><h2 className="h2">Complete the <em>look</em></h2></div></div>
            <div className="grid">{p.related.map((r, i) => <ProductCard key={r.id} p={r} index={i} />)}</div>
          </div>
        </section>
      )}

      {photo !== null && (
        <div className="modal on" role="dialog" aria-label="Customer photo">
          <div className="scrim on" onClick={() => setPhoto(null)} />
          <div className="box phbox">
            <div className="mh"><h3>Photo from {reviews[photo]!.authorName}</h3><button className="ib" type="button" aria-label="Close photo" onClick={() => setPhoto(null)}><Close /></button></div>
            <div className="phimg"><img {...photoProps(photoOf(photo)!, '', { sizes: '(max-width: 600px) 92vw, 520px', eager: true })} /></div>
            <p><b style={{ color: '#FFB300' }}>{'★'.repeat(reviews[photo]!.rating)}</b> {reviews[photo]!.body}</p>
            <p className="mut">{variantOf(photo)} · {reviews[photo]!.city}</p>
          </div>
        </div>
      )}
    </>
  );
}

function UpClose({ p, liveClose }: { p: ProductDetail; liveClose: HTMLCanvasElement | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [lens, setLens] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  if (p.livePreview)
    return (
      <figure className="upclose">
        <div className="upimg"><LiveCanvas src={liveClose} fallback={media(p.hoverImage?.path ?? p.image.path)} /></div>
        <figcaption><b>Up close</b><span>Your design, stitched. This close-up changes with every choice you make.</span></figcaption>
      </figure>
    );
  const up = p.upClose;
  if (!up) return null;
  const zoomSrc = media(p.gallery.find((g) => g.path === up.path)?.zoomPath ?? up.path);
  const Z = 2.4;
  return (
    <figure className="upclose">
      <div
        ref={box}
        className="upimg lensable"
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const r = box.current!.getBoundingClientRect();
          setLens({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height });
        }}
        onPointerLeave={() => setLens(null)}
      >
        <img {...photoProps(up.path, up.caption, { sizes: '(max-width: 1000px) 92vw, 500px' })} />
        <span className="lens" aria-hidden="true" style={lens ? { left: lens.x, top: lens.y, backgroundImage: `url("${zoomSrc}")`, backgroundSize: `${lens.w * Z}px ${lens.h * Z}px`, backgroundPosition: `${-lens.x * Z + 95}px ${-lens.y * Z + 95}px` } : undefined} />
        <span className="hint" aria-hidden="true"><Lens />Hover to look closer</span>
      </div>
      <figcaption><b>Up close</b><span>{up.caption}</span></figcaption>
    </figure>
  );
}

export function SizeGuideModal({ guide, current, onClose }: { guide: string; current: string | null; onClose: () => void }) {
  const [unit, setUnit] = useState<'in' | 'cm'>('in');
  const g = SIZE_GUIDES[guide];
  if (!g) return null;
  const conv = (v: string | number) => (typeof v === 'number' ? (unit === 'in' ? `${v}"` : Math.round(v * 2.54)) : v);
  return (
    <div className="modal on" role="dialog" aria-label="Size guide">
      <div className="scrim on" onClick={onClose} />
      <div className="box">
        <div className="mh"><h3>Size guide</h3><button className="ib" type="button" aria-label="Close size guide" onClick={onClose}><Close /></button></div>
        <div className="seg" style={{ marginBottom: 8 }}>
          <button type="button" aria-pressed={unit === 'in'} onClick={() => setUnit('in')}>Inches</button>
          <button type="button" aria-pressed={unit === 'cm'} onClick={() => setUnit('cm')}>cm</button>
        </div>
        <table className="sgt"><thead><tr>{g.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{g.rows.map((r) => <tr key={String(r[0])} className={r[0] === current ? 'me' : ''}>{r.map((v, i) => <td key={i}>{conv(v)}</td>)}</tr>)}</tbody>
        </table>
        <p className="sgnote">{g.note}</p>
      </div>
    </div>
  );
}
