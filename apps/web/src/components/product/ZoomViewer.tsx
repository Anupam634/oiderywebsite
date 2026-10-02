'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode, type WheelEvent as RWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Close } from '../icons';

/* Full-screen photo viewer, like the big shopping apps: pinch with two fingers or double-tap to zoom, drag to look
   around a zoomed photo, swipe for the next one, swipe down or press Back to close. With a mouse: click to zoom,
   drag, scroll wheel, arrow keys and Esc. Each slide's media needs the class "zv-media" (an <img>, a <canvas>, or a
   box holding a quick photo plus a sharp one with class "zv-sharp" that fades in once loaded). */

export interface ZoomSlide {
  key: string;
  label: string;
  /** the big picture: an <img> or <canvas> with className="zv-media" */
  media: ReactNode;
  /** small picture for the strip at the bottom */
  thumb: ReactNode;
}

const MAX = 4;
const DOUBLE_TAP = 2.5;
type Pt = { x: number; y: number };
type Zoom = { s: number; x: number; y: number };
type Gesture =
  | { kind: 'pinch'; d0: number; s0: number; p: Pt }
  | { kind: 'pan'; from: Pt; x0: number; y0: number }
  | { kind: 'swipe'; from: Pt; t0: number; axis: '' | 'x' | 'y'; dx: number; dy: number };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
const EASE = 'cubic-bezier(.22,1,.36,1)';

export function ZoomViewer({ slides, start, title, onClose }: { slides: ZoomSlide[]; start: number; title: string; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const [hint, setHint] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const at = useRef(start); // current slide, readable inside gesture handlers
  const z = useRef<Zoom>({ s: 1, x: 0, y: 0 });
  const pts = useRef(new Map<number, Pt>());
  const g = useRef<Gesture | null>(null);
  const press = useRef<{ t: number; p: Pt; moved: boolean } | null>(null);
  const lastTap = useRef<{ t: number; p: Pt } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const media = () => track.current?.children[at.current]?.querySelector<HTMLElement>('.zv-media') ?? null;
  const box = () => {
    const r = view.current!.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
  };
  /** keep a zoomed photo covering the screen where it can. The media box fills the screen and the picture sits
      inside it (object-fit: contain), so its size works out from its proportions, known even before it loads. */
  const bounded = (s: number, x: number, y: number): Zoom => {
    const m = media();
    if (!m || s <= 1.01) return { s: Math.max(1, s), x: 0, y: 0 };
    const { w, h } = box();
    const pic = m.matches('img, canvas') ? m : m.querySelector<HTMLElement>('img, canvas');
    const nw = pic instanceof HTMLImageElement ? pic.naturalWidth || Number(pic.getAttribute('width')) || 4 : (pic as HTMLCanvasElement | null)?.width || 4;
    const nh = pic instanceof HTMLImageElement ? pic.naturalHeight || Number(pic.getAttribute('height')) || 5 : (pic as HTMLCanvasElement | null)?.height || 5;
    const k = Math.min(w / nw, h / nh);
    const mx = Math.max(0, (nw * k * s - w) / 2);
    const my = Math.max(0, (nh * k * s - h) / 2);
    return { s, x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  };
  const paint = (next: Zoom, animate = false) => {
    z.current = next;
    const m = media();
    if (m) {
      m.style.transition = animate ? `transform .28s ${EASE}` : 'none';
      m.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.s})`;
    }
    setZoomed(next.s > 1.01);
  };
  const shift = (dx: number, animate: boolean) => {
    const t = track.current;
    if (!t) return;
    t.style.transition = animate ? `transform .3s ${EASE}` : 'none';
    t.style.transform = `translate3d(calc(${-at.current * 100}% + ${dx}px), 0, 0)`;
  };
  const go = (n: number) => {
    const next = Math.max(0, Math.min(slides.length - 1, n));
    const m = media();
    if (m) {
      m.style.transition = 'none';
      m.style.transform = '';
    }
    z.current = { s: 1, x: 0, y: 0 };
    setZoomed(false);
    at.current = next;
    setI(next);
    shift(0, true);
  };
  const toggleZoom = (p: Pt) => {
    if (z.current.s > 1.01) return paint({ s: 1, x: 0, y: 0 }, true);
    const { cx, cy } = box();
    const q = { x: p.x - cx, y: p.y - cy };
    paint(bounded(DOUBLE_TAP, q.x * (1 - DOUBLE_TAP), q.y * (1 - DOUBLE_TAP)), true);
  };
  /** after a pinch: back inside 1x-4x and inside the edges */
  const settle = () => {
    const { s, x, y } = z.current;
    const s2 = Math.min(MAX, Math.max(1, s));
    paint(bounded(s2, (x * s2) / s, (y * s2) / s), true);
  };
  // closing from inside steps back past the history entry the viewer added (see the effect below)
  const close = useCallback(() => {
    if ((history.state as { zoomViewer?: boolean } | null)?.zoomViewer) history.back();
    else closeRef.current();
  }, []);

  useLayoutEffect(() => shift(0, false), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // the phone's Back button closes the viewer instead of leaving the page
    if (!(history.state as { zoomViewer?: boolean } | null)?.zoomViewer) history.pushState({ ...history.state, zoomViewer: true }, '');
    const onPop = () => closeRef.current();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(at.current + 1);
      else if (e.key === 'ArrowLeft') go(at.current - 1);
    };
    addEventListener('popstate', onPop);
    addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    const t = setTimeout(() => setHint(false), 2600);
    return () => {
      removeEventListener('popstate', onPop);
      removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      clearTimeout(t);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setHint(false);
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()] as [Pt, Pt];
      const { cx, cy } = box();
      const mid = { x: (a.x + b.x) / 2 - cx, y: (a.y + b.y) / 2 - cy };
      const { s, x, y } = z.current;
      g.current = { kind: 'pinch', d0: dist(a, b), s0: s, p: { x: (mid.x - x) / s, y: (mid.y - y) / s } };
      press.current = null;
      shift(0, true);
    } else if (pts.current.size === 1) {
      const p = { x: e.clientX, y: e.clientY };
      press.current = { t: e.timeStamp, p, moved: false };
      g.current = z.current.s > 1.01 ? { kind: 'pan', from: p, x0: z.current.x, y0: z.current.y } : { kind: 'swipe', from: p, t0: e.timeStamp, axis: '', dx: 0, dy: 0 };
    }
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pr = press.current;
    if (pr && Math.hypot(e.clientX - pr.p.x, e.clientY - pr.p.y) > 10) pr.moved = true;
    const G = g.current;
    if (!G) return;
    if (G.kind === 'pinch') {
      if (pts.current.size < 2) return;
      const [a, b] = [...pts.current.values()] as [Pt, Pt];
      const { cx, cy } = box();
      const mid = { x: (a.x + b.x) / 2 - cx, y: (a.y + b.y) / 2 - cy };
      const s = Math.min(MAX * 1.25, Math.max(0.75, (G.s0 * dist(a, b)) / G.d0));
      paint({ s, x: mid.x - s * G.p.x, y: mid.y - s * G.p.y });
    } else if (G.kind === 'pan') {
      paint(bounded(z.current.s, G.x0 + e.clientX - G.from.x, G.y0 + e.clientY - G.from.y));
    } else {
      G.dx = e.clientX - G.from.x;
      G.dy = e.clientY - G.from.y;
      if (!G.axis && Math.hypot(G.dx, G.dy) > 8) G.axis = Math.abs(G.dx) > Math.abs(G.dy) ? 'x' : 'y';
      if (G.axis === 'x') {
        const edge = (at.current === 0 && G.dx > 0) || (at.current === slides.length - 1 && G.dx < 0);
        shift(edge ? G.dx / 3 : G.dx, false);
      } else if (G.axis === 'y') {
        const m = media();
        const d = Math.max(0, G.dy);
        if (m) {
          m.style.transition = 'none';
          m.style.transform = `translate3d(0, ${d}px, 0) scale(${1 - Math.min(d, 300) / 1500})`;
        }
        root.current?.style.setProperty('--fade', String(1 - Math.min(d, 300) / 500));
      }
    }
  };

  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!pts.current.delete(e.pointerId)) return;
    const G = g.current;
    if (G?.kind === 'pinch') {
      if (pts.current.size === 1) {
        // one finger stays down: carry on moving the photo with it
        settle();
        const [p] = [...pts.current.values()] as [Pt];
        g.current = { kind: 'pan', from: p, x0: z.current.x, y0: z.current.y };
      } else if (pts.current.size === 0) {
        settle();
        g.current = null;
      }
      return;
    }
    if (pts.current.size) return;
    g.current = null;
    const pr = press.current;
    press.current = null;
    if (G?.kind === 'swipe' && G.axis === 'x') {
      const fast = Math.abs(G.dx) / Math.max(1, e.timeStamp - G.t0) > 0.45;
      const far = Math.abs(G.dx) > box().w * 0.22;
      if ((fast || far) && G.dx < 0 && at.current < slides.length - 1) return go(at.current + 1);
      if ((fast || far) && G.dx > 0 && at.current > 0) return go(at.current - 1);
      return shift(0, true);
    }
    if (G?.kind === 'swipe' && G.axis === 'y') {
      root.current?.style.removeProperty('--fade');
      if (G.dy > 110) return close();
      return paint({ s: 1, x: 0, y: 0 }, true);
    }
    if (!pr || pr.moved || e.timeStamp - pr.t > 350) return;
    // a tap: double tap (or a mouse click) zooms in at that point, or back out
    const p = { x: e.clientX, y: e.clientY };
    const prev = lastTap.current;
    if (e.pointerType === 'mouse' || (prev && e.timeStamp - prev.t < 320 && Math.hypot(p.x - prev.p.x, p.y - prev.p.y) < 40)) {
      lastTap.current = null;
      toggleZoom(p);
    } else lastTap.current = { t: e.timeStamp, p };
  };

  const onWheel = (e: RWheelEvent<HTMLDivElement>) => {
    const { cx, cy } = box();
    const q = { x: e.clientX - cx, y: e.clientY - cy };
    const { s, x, y } = z.current;
    const s2 = Math.min(MAX, Math.max(1, s * Math.exp(-e.deltaY * 0.0015)));
    paint(bounded(s2, q.x - (s2 * (q.x - x)) / s, q.y - (s2 * (q.y - y)) / s));
  };

  return createPortal(
    <div ref={root} className={`zv${zoomed ? ' is-zoomed' : ''}`} role="dialog" aria-modal="true" aria-label={`${title}: photos`}>
      <div className="zv-top">
        <span className="zv-count" aria-live="polite">{i + 1} / {slides.length}<small>{slides[i]?.label}</small></span>
        <button ref={closeBtn} className="zv-x" type="button" aria-label="Close photos" onClick={close}><Close /></button>
      </div>
      <div ref={view} className="zv-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
        <div ref={track} className="zv-track">
          {slides.map((s) => <div key={s.key} className="zv-slide">{s.media}</div>)}
        </div>
        {slides.length > 1 && (
          <>
            <button className="zv-nav prev" type="button" aria-label="Previous photo" disabled={i === 0} onClick={() => go(i - 1)}><ChevronLeft /></button>
            <button className="zv-nav next" type="button" aria-label="Next photo" disabled={i === slides.length - 1} onClick={() => go(i + 1)}><ChevronRight /></button>
          </>
        )}
        <span className={`zv-hint${hint && !zoomed ? '' : ' off'}`} aria-hidden="true">Pinch or double-tap to zoom</span>
      </div>
      {slides.length > 1 && (
        <div className="zv-thumbs">
          {slides.map((s, n) => <button key={s.key} type="button" aria-label={`Photo ${n + 1}: ${s.label}`} aria-current={n === i} onClick={() => go(n)}>{s.thumb}</button>)}
        </div>
      )}
    </div>,
    document.body,
  );
}
