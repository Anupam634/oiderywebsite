'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { photo } from '@/lib/img';
import { Arrow, ChevronLeft, ChevronRight } from '../icons';

interface Slide {
  cls: string;
  kicker: string;
  title: [string, string];
  text: string;
  cta: [string, string, string];
  alt: [string, string];
  code: React.ReactNode;
  photos: [string, string][];
  sticker: [string, string];
}

const SLIDES: Slide[] = [
  { cls: 'hs1', kicker: '✦ Diwali gifting store', title: ['Gifts they’ll ', 'keep forever'], text: 'Name totes, monogram caps and hoop art, personalised in 5–7 days. Free gift wrap with a handwritten note.', cta: ['btn-ink', 'Shop gifts', '/shop/gifts'], alt: ['Personalise a tote', '/p/phoolwari-name-tote'], code: <>Extra 10% off your first order with <b>ZULYF10</b></>, photos: [['r-tote', 'Natural tote with an embroidered bouquet and the name Priya'], ['cherry', 'Cherry blossom embroidery hoop'], ['r-cap', 'Black cap with gold initials']], sticker: ['From', '₹899'] },
  { cls: 'hs2', kicker: '● Live preview', title: ['Your name, stitched. ', 'See it before you buy.'], text: 'Type a name, pick the thread and font, and watch it appear on a real tote, cap or T-shirt photo.', cta: ['btn-grad', 'Try it on a T-shirt', '/p/name-t-shirt'], alt: ['All name gifts', '/shop?type=personalise'], code: 'English or हिंदी · stitch proof on WhatsApp', photos: [['r-model', 'White T-shirt with the name Rohan stitched in pink'], ['r-tote-d', 'Close-up of an embroidered name and flowers'], ['r-hoodie', 'Maroon hoodie with a peacock feather']], sticker: ['From', '₹799'] },
  { cls: 'hs3', kicker: '✦ The festive edit', title: ['Lehengas, kurtas ', '& dupattas'], text: 'Zari, resham and mirror work in colours that glow. Ready-to-ship pieces, or made to your measurements.', cta: ['btn-gold', 'Shop clothing', '/shop/clothing'], alt: ['Lehengas', '/shop/clothing/lehengas'], code: 'Up to 25% off · COD on ready-to-ship', photos: [['lehenga', 'Woman in a bottle-green embroidered lehenga'], ['dupatta', 'Rani pink mirror-work dupatta'], ['kurta', 'Red kurta with an embroidered yoke']], sticker: ['Up to', '25% off'] },
];

/* how wide each of the three photos shows (see .ha1–.ha3 in home.css) */
const HERO_SIZES = ['(max-width: 760px) 38vw, 280px', '(max-width: 760px) 31vw, 220px', '(max-width: 760px) 31vw, 220px'];

export function HeroCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const paused = useRef(false);
  const go = (k: number) => {
    const t = track.current;
    if (!t) return;
    const n = (k + SLIDES.length) % SLIDES.length;
    t.scrollTo({ left: n * t.clientWidth, behavior: 'smooth' });
  };
  useEffect(() => {
    const t = track.current!;
    const sync = () => setI(Math.round(t.scrollLeft / t.clientWidth));
    t.addEventListener('scroll', sync, { passive: true });
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = reduce ? 0 : window.setInterval(() => {
      if (!paused.current && !document.hidden) go(Math.round(t.scrollLeft / t.clientWidth) + 1);
    }, 6500);
    return () => {
      t.removeEventListener('scroll', sync);
      clearInterval(timer);
    };
  }, []);
  return (
    <section
      className="wrap hb"
      aria-roledescription="carousel"
      aria-label="This week at Zulyf"
      onPointerEnter={(e) => e.pointerType === 'mouse' && (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
    >
      <div className="hb-track" ref={track}>
        {SLIDES.map((s, n) => {
          const H = n === 0 ? 'h1' : 'h2';
          return (
            <article key={s.cls} className={`hb-slide ${s.cls}`} aria-roledescription="slide" aria-label={`${n + 1} of ${SLIDES.length}`}>
              <div className="hb-copy">
                <span className="hb-k">{s.kicker}</span>
                <H className="hb-h">{s.title[0]}<em>{s.title[1]}</em></H>
                <p>{s.text}</p>
                <div className="hb-cta">
                  <Link className={`btn ${s.cta[0]}`} href={s.cta[2]}>{s.cta[1]} <Arrow className="arr" /></Link>
                  <Link className={`btn btn-line${n ? ' light' : ''}`} href={s.alt[1]}>{s.alt[0]}</Link>
                </div>
                <span className="hb-code">{s.code}</span>
              </div>
              <div className="hb-art">
                {s.photos.map(([img, alt], k) => (
                  <figure key={img} className={`ha ha${k + 1}`}>
                    <img {...photo(`photos/${img}.jpg`, alt, { sizes: HERO_SIZES[k]!, priority: n === 0 && k === 0, eager: n === 0 })} />
                  </figure>
                ))}
                <span className="hb-stk">{s.sticker[0]}<b>{s.sticker[1]}</b></span>
              </div>
            </article>
          );
        })}
      </div>
      <div className="hb-ui">
        <button className="hb-arrow" type="button" aria-label="Previous offer" onClick={() => go(i - 1)}><ChevronLeft /></button>
        <div className="hb-dots">
          {SLIDES.map((s, n) => <button key={s.cls} type="button" aria-label={`Show offer ${n + 1}`} aria-current={n === i} onClick={() => go(n)} />)}
        </div>
        <button className="hb-arrow" type="button" aria-label="Next offer" onClick={() => go(i + 1)}><ChevronRight /></button>
      </div>
    </section>
  );
}
