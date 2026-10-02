'use client';
import { useRef, useState } from 'react';
import type { ImageRef } from '@store/shared';
import { photo } from '@/lib/img';
import { ChevronLeft, ChevronRight } from '../icons';
import { LiveCanvas } from './live';

export type GalleryItem = { kind: 'photo'; image: ImageRef; caption: string } | { kind: 'live'; which: 'front' | 'close'; caption: string };

/* the main photo fills the left column on desktop and the screen width on phones; zoomed, it shows at 2.2x */
const MAIN_SIZES = '(max-width: 1000px) 100vw, 560px';
const ZOOM_SIZES = '(max-width: 1000px) 220vw, 1240px';

const ZOOM_HINT = typeof window !== 'undefined' && matchMedia('(hover:hover)').matches ? 'click to zoom' : 'double-tap to zoom';

export function Gallery({ name, items, live, busy, fallback, fallbackClose }: {
  name: string;
  items: GalleryItem[];
  live: { front: HTMLCanvasElement | null; close: HTMLCanvasElement | null };
  busy: boolean;
  fallback: string;
  fallbackClose: string;
}) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [sharp, setSharp] = useState<Record<number, boolean>>({});
  const [origin, setOrigin] = useState('50% 50%');
  const stage = useRef<HTMLDivElement>(null);
  const tap = useRef({ x: 0, y: 0, moved: false, last: 0 });
  const it = items[Math.min(i, items.length - 1)]!;
  const step = (d: number) => {
    setZoom(false);
    setI((x) => (x + d + items.length) % items.length);
  };
  const at = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    setOrigin(`${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}% ${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  };
  const toggleZoom = (e?: React.PointerEvent) => {
    if (e) at(e);
    setZoom((z) => !z);
    setSharp((s) => ({ ...s, [i]: true }));
  };
  const visual = (x: GalleryItem, big: boolean) =>
    x.kind === 'live' ? (
      <LiveCanvas src={x.which === 'close' ? live.close : live.front} fallback={x.which === 'close' ? fallbackClose : fallback} width={big ? 900 : 160} height={big ? 1125 : 200} />
    ) : (
      <img
        {...(big && sharp[i] && x.image.zoomPath
          ? photo(x.image.zoomPath, x.image.alt, { sizes: ZOOM_SIZES, width: 1600, height: 2000, priority: true })
          : photo(x.image.path, big ? x.image.alt : '', { sizes: big ? MAIN_SIZES : 86, priority: big }))}
        draggable={false}
      />
    );
  return (
    <div className="gallery">
      <div className="thumbs" role="tablist" aria-label="Product images">
        {items.map((x, n) => (
          <button key={n} className="thumb" role="tab" type="button" aria-selected={n === i} aria-label={x.caption || `Image ${n + 1}`} onClick={() => { setZoom(false); setI(n); }}>
            {visual(x, false)}
            {x.kind === 'live' && <span className="lv">Live</span>}
          </button>
        ))}
      </div>
      <div className="stagew">
        <div
          ref={stage}
          className={`mainimg${zoom ? ' zoomed' : ''}`}
          role="img"
          tabIndex={0}
          aria-label={`${name}: ${it.caption}. Press Enter to zoom.`}
          style={{ ['--ox' as string]: origin.split(' ')[0], ['--oy' as string]: origin.split(' ')[1] }}
          onPointerDown={(e) => (tap.current = { ...tap.current, x: e.clientX, y: e.clientY, moved: false })}
          onPointerMove={(e) => {
            if (Math.abs(e.clientX - tap.current.x) + Math.abs(e.clientY - tap.current.y) > 10) tap.current.moved = true;
            if (zoom && (e.pointerType === 'mouse' || e.buttons)) at(e);
          }}
          onPointerUp={(e) => {
            const dx = e.clientX - tap.current.x, dy = e.clientY - tap.current.y;
            if (e.pointerType === 'mouse') {
              if (!tap.current.moved || zoom) toggleZoom(e);
              return;
            }
            if (!zoom && Math.abs(dx) > 50 && Math.abs(dy) < 70) return step(dx < 0 ? 1 : -1);
            const now = Date.now();
            if (now - tap.current.last < 320) {
              toggleZoom(e);
              tap.current.last = 0;
            } else tap.current.last = now;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleZoom();
            } else if (e.key === 'ArrowRight') step(1);
            else if (e.key === 'ArrowLeft') step(-1);
          }}
        >
          {visual(it, true)}
        </div>
        {it.kind === 'live' && <span className="livechip"><i />Live preview</span>}
        {busy && it.kind === 'live' && <div className="gbusy"><span className="spin" />Stitching your preview…</div>}
        <span className="gcap">{it.kind === 'live' ? it.caption : `${it.caption ? it.caption + ' · ' : ''}${ZOOM_HINT}`}</span>
        <div className="gnav">
          <button type="button" aria-label="Previous image" onClick={() => step(-1)}><ChevronLeft /></button>
          <button type="button" aria-label="Next image" onClick={() => step(1)}><ChevronRight /></button>
        </div>
      </div>
    </div>
  );
}
