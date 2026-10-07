'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { photo } from '@/lib/img';
import { Arrow, ChevronLeft, ChevronRight } from '../icons';

/* Homepage hero, as in the Zulyf homepage design: a full-width cream banner with the logo, the
   "Style • Craft • Comfort" line and the four ranges, and the collection photo on the right.
   The next slides follow the same layout. On phones each slide is the same layout in miniature (copy left,
   whole picture right). */
interface Slide {
  id: string;
  kicker?: string;
  title?: [string, string];
  text?: string;
  cta: [string, string];
  img: string;
  alt: string;
  /** show the whole picture on laptops (it keeps its own shape instead of being cropped) */
  full?: boolean;
}

const SLIDES: Slide[] = [
  { id: 'brand', cta: ['Shop now', '/shop'], img: '/brand/home/hero.jpg', alt: 'A smiling woman in a red kurta beside a rail with an embroidered kurti, a white T-shirt and a black hoodie', full: true },
  { id: 'kurtis', kicker: 'Ladies kurtis', title: ['Kurtis for ', 'every day'], text: 'Soft, breathable fabrics in easy colours you’ll wear again and again. Comfortable fits for work, college and home.', cta: ['Shop kurtis', '/shop/clothing/kurtas'], img: '/brand/home/slide-kurtis.jpg', alt: 'Smiling woman in a plain red kurti' },
  { id: 'tees', kicker: 'Men’s wear', title: ['T-shirts ', '& hoodies'], text: 'Soft cotton T-shirts and warm hoodies for every day, in colours that go with everything.', cta: ['Shop now', '/shop/clothing/tees'], img: '/brand/home/slide-tees.jpg', alt: 'A man in a plain white T-shirt and a man in a white hoodie', full: true },
  { id: 'design', kicker: 'Embroidery design', title: ['Your design, ', 'beautifully stitched'], text: 'Send a logo, a name or a sketch. We digitize it, send a stitch proof on WhatsApp, then embroider it on your piece.', cta: ['Start a design', '/studio'], img: '/brand/home/slide-design.jpg', alt: 'An embroidery machine stitching a colourful design, and an embroidered dog portrait in a hoop', full: true },
];

const RANGES = ['Ladies Kurtis', 'Embroidery Design', 'Men’s T-Shirts', 'Hoodies'];

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
    }, 7000);
    return () => {
      t.removeEventListener('scroll', sync);
      clearInterval(timer);
    };
  }, []);
  return (
    <section
      className="zh"
      aria-roledescription="carousel"
      aria-label="Zulyf collections"
      onPointerEnter={(e) => e.pointerType === 'mouse' && (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
    >
      <div className="zh-track" ref={track}>
        {SLIDES.map((s, n) => (
          <article key={s.id} className={`zh-slide zh-${s.id}${s.full ? ' zh-full' : ''}`} aria-roledescription="slide" aria-label={`${n + 1} of ${SLIDES.length}`}>
            <div className="zh-copy">
              {s.id === 'brand' ? (
                <>
                  <h1 className="zh-logo"><img src="/brand/logo-hero.webp" alt="Zulyf" width={900} height={497} /></h1>
                  <p className="zh-tag"><span>Style</span><i /><span>Craft</span><i /><span>Comfort</span></p>
                  <span className="zh-knot" aria-hidden="true">✤</span>
                  <p className="zh-ranges">{RANGES.map((r, k) => <span key={r}>{k > 0 && <i />}{r}</span>)}</p>
                </>
              ) : (
                <>
                  <span className="zh-k">✤ {s.kicker}</span>
                  <h2 className="zh-h">{s.title![0]}<em>{s.title![1]}</em></h2>
                  <p className="zh-p">{s.text}</p>
                </>
              )}
              <Link className="btn zh-btn" href={s.cta[1]}>{s.cta[0]} <Arrow className="arr" /></Link>
            </div>
            <figure className="zh-art">
              {s.img.startsWith('/')
                ? <img src={s.img} alt={s.alt} width={1582} height={928} fetchPriority={n === 0 ? 'high' : undefined} loading={n === 0 ? 'eager' : 'lazy'} />
                : <img {...photo(s.img, s.alt, { sizes: '(max-width: 760px) 56vw, 50vw' })} />}
            </figure>
            {s.id === 'brand' && <img className="zh-flowers" src="/brand/home/hero-flowers.png" alt="" width={140} height={205} aria-hidden="true" />}
          </article>
        ))}
      </div>
      <button className="zh-arrow prev" type="button" aria-label="Previous slide" onClick={() => go(i - 1)}><ChevronLeft /></button>
      <button className="zh-arrow next" type="button" aria-label="Next slide" onClick={() => go(i + 1)}><ChevronRight /></button>
      <div className="zh-dots">
        {SLIDES.map((s, n) => <button key={s.id} type="button" aria-label={`Show slide ${n + 1}`} aria-current={n === i} onClick={() => go(n)} />)}
      </div>
    </section>
  );
}
