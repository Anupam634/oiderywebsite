'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  FLOWER_PRESETS,
  FONT_KEYS,
  THREAD_KEYS,
  checkName,
  cleanName,
  formatINR,
  hasDevanagari,
  percentOff,
  unitPrice,
  type ProductDetail,
  type Variant,
} from '@store/shared';
import { relLum, lab, hexRgb, TH, TNAME, type ThreadKey } from '@store/stitch';
import { fitForUpload } from '@/lib/shrink';
import { api, ApiError } from '@/lib/api';
import { photo } from '@/lib/img';
import { media } from '@/lib/media';
import { NAME_FONT_CSS } from '@/lib/stitch';
import { cart, ui, useWishlist, wishlist } from '@/lib/store';
import { track } from '@/lib/track';
import { Bag, Check, Eye, Heart, Info, Spark } from '../icons';
import { Gallery, type GalleryItem } from './Gallery';
import { LiveCanvas, thumbOf, useLivePreview, useVariantRenders, type LiveInput } from './live';
import { ProductSections, SizeGuideModal } from './ProductSections';
import { DeliveryCheck, Offers, Trust } from './BuyExtras';

const FONT_LABEL: Record<string, [string, string]> = { script: ['Aa', 'Script'], classic: ['Aa', 'Classic'], bold: ['AA', 'Bold'], hindi: ['अआ', 'हिंदी'] };
const LIGHT_FABRIC: Record<string, string> = { natural: '#EFE6D6', white: '#F4F4F2' };

export function ProductView({ p }: { p: ProductDetail }) {
  const colours = useMemo(() => [...new Map(p.variants.map((v) => [v.colourName, v])).values()], [p.variants]);
  const [ci, setCi] = useState(0);
  const sizes = p.variants.filter((v) => v.colourName === colours[ci]!.colourName);
  const firstSize = Math.max(0, sizes.findIndex((v) => v.size === 'M' && (v.stock > 0 || !v.trackStock)) >= 0 ? sizes.findIndex((v) => v.size === 'M') : sizes.findIndex((v) => (v.stock > 0 || !v.trackStock) && v.size !== 'Custom'));
  const [si, setSi] = useState(firstSize);
  const variant: Variant = sizes[Math.min(si, sizes.length - 1)]!;
  const [qty, setQty] = useState(1);
  const perso = p.personalisation;
  const [persoOn, setPersoOn] = useState(!!perso?.defaultOn);
  const [text, setText] = useState(perso?.defaultText ?? '');
  const [font, setFont] = useState(perso?.font ?? 'script');
  const [thread, setThread] = useState(perso?.thread ?? 'rani');
  const [pal, setPal] = useState(0);
  const [agree, setAgree] = useState(false);
  const [shake, setShake] = useState<string | null>(null);
  const [pet, setPet] = useState<{ thumb: string; file: string; name: string; later: boolean; blob?: File }>({ thumb: '', file: '', name: '', later: false });
  const [adding, setAdding] = useState(false);
  const [gift, setGift] = useState({ on: false, note: '', hide: false });
  const [sg, setSg] = useState(false);
  const saved = useWishlist().includes(p.slug);
  const persoBox = useRef<HTMLDivElement>(null);
  const petBox = useRef<HTMLDivElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);

  const cleanText = cleanName(text).trim().slice(0, perso?.maxLength ?? 40);
  const live = p.livePreview;
  const flowers = !!perso?.flowerPresets;
  const input: LiveInput = { colour: variant.colourValue, palette: pal, text: persoOn ? cleanText : '', font, thread };
  const render = useLivePreview(live, input, flowers);
  const reviewInputs = p.reviews.items.slice(0, 5).map((r) => (r.preview ? { colour: r.preview.colour, palette: r.preview.palette, text: r.preview.text, font: r.preview.font ?? 'script', thread: r.preview.thread ?? 'haldi' } : null));
  const reviewShots = useVariantRenders(live, reviewInputs, flowers);

  const fee = perso && persoOn ? perso.feePaise : 0;
  const price = unitPrice({ basePaise: p.pricePaise, mrpPaise: p.mrpPaise, variantDeltaPaise: variant.priceDeltaPaise, personalisationFeePaise: fee, giftWrap: gift.on });
  const off = percentOff(price.pricePaise, price.mrpPaise);
  const custom = p.shipMode !== 'READY' || (!!perso && persoOn) || variant.size === 'Custom';
  const maxQty = p.isUnique ? 1 : variant.trackStock ? Math.min(10, variant.stock) : 10;

  useEffect(() => setSi(Math.min(si, sizes.length - 1)), [ci]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => track.viewItem({ id: p.slug, name: p.name, pricePaise: p.pricePaise, qty: 1 }), [p.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  /* gallery: live renders first for personalised pieces */
  const items: GalleryItem[] = live
    ? [
        { kind: 'live', which: 'front', caption: 'Updates as you choose' },
        { kind: 'live', which: 'close', caption: 'Stitch close-up' },
        ...p.gallery.slice(1).map((g) => ({ kind: 'photo' as const, image: g, caption: g.caption ?? '' })),
      ]
    : p.gallery.map((g) => ({ kind: 'photo' as const, image: g, caption: g.caption ?? '' }));

  const warnings: string[] = [];
  if (perso && persoOn) {
    if (text !== cleanName(text)) warnings.push('Emoji and special symbols can’t be stitched, so we’ve left them out.');
    if (!cleanText) warnings.push(perso.required ? (perso.maxLength <= 3 ? 'Type the initials you want stitched.' : 'Type the name you want stitched.') : 'Type a name, or switch this off.');
    if (hasDevanagari(cleanText) && font !== 'hindi') warnings.push('Hindi text detected. Pick the हिंदी font for the cleanest stitching.');
    if (live) {
      const fab = variant.colourValue.startsWith('#') ? variant.colourValue : LIGHT_FABRIC[variant.colourValue] ?? variant.colourHex;
      const th = TH[thread as ThreadKey];
      const a = lab(...hexRgb(fab)), b = lab(...hexRgb(th));
      if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 40 || Math.abs(relLum(fab) - relLum(th)) < 0.05)
        warnings.push(`${TNAME[thread as ThreadKey]} thread won’t stand out much on ${variant.colourName.toLowerCase()}. Try a ${relLum(fab) > 0.3 ? 'darker' : 'lighter'} thread.`);
    }
  }

  let stock: [string, ReactNode];
  if (p.isUnique) stock = ['', <><Spark />One of a kind. This exact piece won’t be restocked.</>];
  else if (variant.size === 'Custom') stock = ['inf', <><Info />Made to your measurements. We’ll WhatsApp you for them after you order. Ships in {p.madeDays} days.</>];
  else if (p.petPhoto) stock = ['inf', <><Info />Made for you. We start once you approve the sketch, then it ships in about {p.madeDays} days.</>];
  else if (p.shipMode === 'MADE') stock = ['inf', <><Info />Made for you. Ships in {p.madeDays} days.</>];
  else if (p.shipMode === 'CUSTOM' || (perso && persoOn)) stock = ['inf', <><Info />Personalised for you. Ships in 5–7 days.</>];
  else if (variant.trackStock && variant.stock <= 3) stock = ['', <><Info />Only {variant.stock} left{variant.size ? ` in ${variant.size}` : ''}.</>];
  else stock = ['ok', <><Check />In stock. Ships in 1–2 days.</>];

  const nudge = (id: string, el: HTMLElement | null, msg: string) => {
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setShake(null);
    requestAnimationFrame(() => setShake(id));
    ui.toast(msg);
  };
  function validate(): boolean {
    if (variant.trackStock && variant.stock === 0) return ui.toast('That size is sold out. Pick another one.'), false;
    if (p.petPhoto && !pet.thumb && !pet.later) return nudge('pet', petBox.current, 'Add your pet’s photo, or tick “send it on WhatsApp”'), false;
    if (perso && persoOn) {
      const check = checkName(text, perso.maxLength);
      if (!check.ok) return nudge('name', persoBox.current, check.reason === 'too_long' ? `Up to ${perso.maxLength} letters` : 'Type the name you want stitched'), false;
      if (!agree) return nudge('agree', persoBox.current, 'Please confirm the spelling first'), false;
    }
    return true;
  }
  async function add(goCheckout = false) {
    if (!validate() || adding) return;
    // the pet photo goes to the studio big enough to sketch from (the bag keeps a small thumbnail)
    let uploads: string[] | undefined;
    if (p.petPhoto && pet.blob && !pet.later) {
      setAdding(true);
      try {
        const fit = await fitForUpload(pet.blob, { maxPx: 3000, kind: 'photo', name: pet.file });
        uploads = [(await api.upload('pet', fit.blob, fit.name)).id];
      } catch (e) {
        setAdding(false);
        return ui.toast(e instanceof ApiError ? e.message : 'We couldn’t upload the photo. Please try again.');
      }
      setAdding(false);
    }
    const thumb = live && render.front ? thumbOf(render.front) : p.petPhoto && pet.thumb ? pet.thumb : p.image.path;
    const bits = [
      variant.colourName,
      sizes.length > 1 || variant.size ? variant.size : '',
      flowers ? `${FLOWER_PRESETS[pal]!.name} flowers` : '',
      perso && persoOn ? `“${cleanText}” in ${FONT_LABEL[font]![1]}, ${TNAME[thread as ThreadKey]} thread` : '',
      p.petPhoto ? (pet.thumb ? 'Pet photo attached' : 'Photo to follow on WhatsApp') : '',
      p.petPhoto && cleanName(pet.name).trim() ? `“${cleanName(pet.name).trim()}” stitched below` : '',
      gift.on ? 'Gift wrapped with a note' : '',
    ].filter(Boolean);
    cart.add({
      key: [variant.id, flowers ? pal : '', perso && persoOn ? cleanText + font + thread : '', gift.on ? 'gift' : ''].join('|'),
      variantId: variant.id,
      slug: p.slug,
      name: p.name,
      image: thumb,
      qty,
      unitPricePaise: price.pricePaise,
      unitMrpPaise: price.mrpPaise,
      desc: bits.join(' · '),
      custom,
      personalisation: perso && persoOn ? { text: cleanText, font, thread, ...(flowers ? { flowers: pal } : {}) } : null,
      giftWrap: gift.on,
      ...(p.petPhoto && cleanName(pet.name).trim() ? { petName: cleanName(pet.name).trim().slice(0, 20) } : {}),
      ...(uploads ? { uploads } : {}),
    });
    if (goCheckout) location.href = '/checkout';
    else {
      ui.toast(`${p.name} added to your bag`);
      ui.open('cart');
    }
  }
  function loadPet(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return ui.toast('Please upload a JPG, PNG or WEBP photo');
    // big phone photos are fine (they're resized before upload); beyond this a phone may run out of memory
    if (f.size > 30 * 1024 * 1024) return ui.toast('That photo is over 30 MB. Please pick a smaller one.');
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, 260 / Math.min(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * s);
      c.height = Math.round(im.naturalHeight * s);
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      setPet((x) => ({ ...x, thumb: c.toDataURL('image/jpeg', 0.82), file: f.name, later: false, blob: f }));
      ui.toast('Photo added. Our artist will sketch from this one.');
    };
    im.onerror = () => ui.toast('We couldn’t read that photo. Try another one.');
    im.src = url;
  }

  const [mbar, setMbar] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([en]) => setMbar(!en!.isIntersecting && en!.boundingClientRect.top < 0));
    if (addBtn.current) io.observe(addBtn.current);
    return () => io.disconnect();
  }, []);

  return (
    <main id="top" className="pdp-main">
      <nav className="wrap crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link><span aria-hidden="true">›</span>
        <Link href={`/shop/${p.parent.slug}`}>{p.parent.name}</Link><span aria-hidden="true">›</span>
        <Link href={`/shop/${p.parent.slug}/${p.category.slug}`}>{p.category.name}</Link><span aria-hidden="true">›</span>
        <span aria-current="page">{p.name}</span>
      </nav>

      <section className="wrap pdp">
        <Gallery name={p.name} items={items} live={render} busy={render.busy} fallback={media(p.image.path)} fallbackClose={media(p.hoverImage?.path ?? p.image.path)} />

        <div className="buy" id="buy">
          <div className="chips2">
            {p.badge && <span className={`chip2 bg-${p.badge.tone}`}>{p.badge.text}</span>}
            <span className="chip2 alt">{p.techLine}</span>
            {live && <span className="chip2 c-live"><Eye />Live preview</span>}
          </div>
          <h1 className="ptitle">{p.name}</h1>
          <a className="prate" href="#reviews"><span className="st" aria-hidden="true">★★★★★</span>{p.rating.avg.toFixed(1)} · {p.rating.count} reviews</a>
          <p className="pstory">{p.story}</p>
          <div className="pprice"><b>{formatINR(price.pricePaise * qty)}</b>{price.mrpPaise > price.pricePaise && <><s>{formatINR(price.mrpPaise * qty)}</s><em>{off}% off</em></>}</div>
          <div className="ptax">MRP incl. of all taxes</div>
          <div className="upi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 17L10 5M10 17l6-12M16 17l4-8" /></svg>Pay by UPI and get ₹50 off at checkout</div>

          <div className="ob">
            <div className="olabel">Colour: <b>{colours[ci]!.colourName}</b></div>
            <div className="swatches">
              {colours.map((c, i) => <button key={c.colourName} className="sw" type="button" style={{ ['--c' as string]: c.colourHex }} aria-pressed={i === ci} aria-label={c.colourName} title={c.colourName} onClick={() => setCi(i)} />)}
            </div>
          </div>
          {variant.size && (
            <div className="ob">
              <div className="olabel"><span>{p.sizeLabel}:</span> <b>{variant.size}</b>{p.sizeGuide && <button className="link" type="button" onClick={() => setSg(true)}>Size guide</button>}</div>
              <div className="sizes">
                {sizes.map((v, i) => {
                  const out = v.trackStock && v.stock === 0;
                  return (
                    <button key={v.id} className="sz" type="button" aria-pressed={v === variant} disabled={out} onClick={() => setSi(i)}>
                      <b>{v.size}</b>{' '}
                      {(v.sizeNote || v.priceDeltaPaise || out) && <small>{out ? 'Sold out' : [v.sizeNote, v.priceDeltaPaise ? `+${formatINR(v.priceDeltaPaise)}` : ''].filter(Boolean).join(' · ')}</small>}
                    </button>
                  );
                })}
              </div>
              <div className={`stock ${stock[0]}`}>{stock[1]}</div>
            </div>
          )}
          {!variant.size && <div className={`stock ${stock[0]}`} style={{ marginTop: 14 }}>{stock[1]}</div>}

          {p.petPhoto && (
            <div className="perso" ref={petBox}>
              <div className="olabel" style={{ margin: '0 0 10px' }}><b>Your pet’s photo</b></div>
              <label className={`pet-drop${pet.thumb ? ' has' : ''}${shake === 'pet' ? ' err' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadPet(e.dataTransfer.files[0]); }}>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { loadPet(e.target.files?.[0]); e.target.value = ''; }} />
                <span className="pet-prev">{pet.thumb ? <img src={pet.thumb} alt="Your pet’s photo" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V5M7 10l5-5 5 5" /><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>}</span>
                <span className="pet-tx"><b>{pet.thumb ? 'Photo added' : 'Upload a clear, well-lit photo'}</b><small>{pet.thumb ? `${pet.file.length > 28 ? pet.file.slice(0, 26) + '…' : pet.file} · tap to change` : 'Eyes visible, face towards the camera · JPG or PNG'}</small></span>
              </label>
              <label className="chk" style={{ marginTop: 10 }}><input type="checkbox" checked={pet.later} onChange={(e) => setPet((x) => ({ ...x, later: e.target.checked }))} /><span>I’ll send the photo on WhatsApp after I order</span></label>
              <label className="field" style={{ marginTop: 12 }}><input type="text" maxLength={12} autoComplete="off" value={pet.name} onChange={(e) => setPet((x) => ({ ...x, name: e.target.value }))} placeholder="Pet’s name, stitched under the portrait (optional)" aria-label="Pet’s name" /></label>
              <ol className="pet-flow"><li><b>1</b>You send a photo</li><li><b>2</b>We WhatsApp you a pencil sketch within 48 hours</li><li><b>3</b>You approve, we stitch it in 10 days</li></ol>
            </div>
          )}

          {perso && (
            <div className="perso" ref={persoBox}>
              {live && (
                <div className="pmini-row">
                  <LiveCanvas className="pmini" src={render.close} fallback={media(p.hoverImage?.path ?? p.image.path)} width={180} height={225} />
                  <div><b>Live preview</b><small>Changes as you type and pick colours</small><button type="button" className="link" onClick={() => document.querySelector('.gallery')?.scrollIntoView({ behavior: 'smooth' })}>See it big</button></div>
                </div>
              )}
              {flowers && (
                <div className="pal-wrap">
                  <div className="olabel">Flower colours: <b>{FLOWER_PRESETS[pal]!.name}</b></div>
                  <div className="pals">
                    {FLOWER_PRESETS.map((f, i) => (
                      <button key={f.name} type="button" className="pal" aria-pressed={i === pal} aria-label={`${f.name} flowers`} onClick={() => setPal(i)}>
                        <span>{[f.threads[0], f.threads[3], f.threads[1]].map((k) => <i key={k} style={{ background: TH[k as ThreadKey] }} />)}</span>{f.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="switch">
                <input type="checkbox" checked={persoOn} disabled={perso.required} onChange={(e) => { setPersoOn(e.target.checked); if (e.target.checked && !text) setText(perso.defaultText); }} />
                <span>{perso.required ? (perso.maxLength <= 3 ? 'Your initials' : 'Your name') : 'Add a name'}</span>
                <small>{perso.feePaise ? `+${formatINR(perso.feePaise)}` : 'Included'}</small>
              </label>
              {persoOn && (
                <div className="pbody">
                  <label className={`field${shake === 'name' ? ' err' : ''}`}>
                    <input type="text" value={text} maxLength={perso.maxLength} autoComplete="off" aria-label="Name to embroider" placeholder={perso.maxLength <= 3 ? 'Up to 3 initials' : `Type a name (up to ${perso.maxLength} letters)`}
                      onChange={(e) => { const v = e.target.value; setText(v); if (hasDevanagari(v) && font !== 'hindi') { setFont('hindi'); ui.toast('Switched to the हिंदी font for your Hindi name'); } }} />
                    <span className="cnt">{[...text].length}/{perso.maxLength}</span>
                  </label>
                  <div className="fonts">
                    {FONT_KEYS.map((k) => (
                      <button key={k} className="fbtn" type="button" aria-pressed={font === k} onClick={() => setFont(k)}>
                        <b style={{ fontFamily: NAME_FONT_CSS[k], ...(k === 'classic' ? { fontStyle: 'italic' } : {}), ...(k === 'bold' ? { fontSize: 17 } : {}) }}>{FONT_LABEL[k]![0]}</b><small>{FONT_LABEL[k]![1]}</small>
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="olabel">Thread: <b>{TNAME[thread as ThreadKey]}</b></div>
                    <div className="tsw">{THREAD_KEYS.map((k) => <button key={k} type="button" style={{ ['--c' as string]: TH[k] }} aria-label={`${TNAME[k]} thread`} title={TNAME[k]} aria-pressed={thread === k} onClick={() => setThread(k)} />)}</div>
                  </div>
                  <div className={`warn${warnings.length ? ' show' : ''}`}>{warnings.map((w) => <div key={w}>{w}</div>)}</div>
                  <p className="hint2"><Eye />The preview is very close to the real thing. We WhatsApp you a stitch proof before we start.</p>
                  <label className={`chk${shake === 'agree' ? ' err' : ''}`}><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I’ve checked the spelling. I understand personalised pieces can’t be returned.</span></label>
                </div>
              )}
            </div>
          )}
          {live && (
            <Link className="studio-link" href="/studio"><Spark /><span>Want your logo or a different motif? <b>Open the design studio</b></span></Link>
          )}

          <div className="gift">
            <label className="chk"><input type="checkbox" checked={gift.on} onChange={(e) => setGift((g) => ({ ...g, on: e.target.checked }))} /><span><b>Make it a gift</b> · gift wrap and a handwritten note (+₹49)</span></label>
            {gift.on && (
              <div className="gbody">
                <textarea maxLength={150} value={gift.note} onChange={(e) => setGift((g) => ({ ...g, note: e.target.value }))} placeholder="Write your message. We'll handwrite it on a card." aria-label="Gift note" />
                <div className="gmeta"><label className="chk"><input type="checkbox" checked={gift.hide} onChange={(e) => setGift((g) => ({ ...g, hide: e.target.checked }))} /><span>Hide prices on the invoice</span></label><span className="cnt">{gift.note.length}/150</span></div>
              </div>
            )}
          </div>

          <div className="cta">
            <div className="qty2">
              <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <span aria-live="polite">{qty}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => (qty < maxQty ? setQty(qty + 1) : ui.toast(p.isUnique ? 'This is a one-of-a-kind piece, so only 1 is available' : maxQty < 10 ? `Only ${maxQty} available` : 'For more than 10, see our corporate orders'))}>+</button>
            </div>
            <button className="btn btn-grad" type="button" ref={addBtn} disabled={adding} onClick={() => void add()}>{adding ? <span className="spin" /> : <Bag />}<span>{adding ? 'Uploading your photo…' : `Add to bag · ${formatINR(price.pricePaise * qty)}`}</span></button>
            <button className={`favbig${saved ? ' on' : ''}`} type="button" aria-label="Save to wishlist" aria-pressed={saved} onClick={() => ui.toast(wishlist.toggle(p.slug) ? 'Saved to your wishlist' : 'Removed from your wishlist')}><Heart /></button>
          </div>
          <button className="btn btn-ink wide" type="button" disabled={adding} onClick={() => void add(true)}>Buy now</button>

          <DeliveryCheck custom={custom} madeDays={p.madeDays} petPhoto={p.petPhoto} totalPaise={price.pricePaise * qty} />
          <Offers />
          <Trust custom={custom} pet={p.petPhoto} />
        </div>
      </section>

      <ProductSections p={p} reviewShots={reviewShots} liveClose={live ? render.close : null} />
      {sg && p.sizeGuide && <SizeGuideModal guide={p.sizeGuide} current={variant.size} onClose={() => setSg(false)} />}

      <div className={`mbar${mbar ? ' on' : ''}`} inert={!mbar}>
        <div className="mth">{live ? <LiveCanvas src={render.front} fallback={media(p.image.path)} width={88} height={110} /> : <img {...photo(p.image.path, '', { sizes: 88 })} />}</div>
        <div className="mtx"><b>{p.name}</b><span>{formatINR(price.pricePaise * qty)}</span></div>
        <button className="btn btn-grad" type="button" disabled={adding} onClick={() => void add()}>Add to bag</button>
      </div>
    </main>
  );
}
