/* ---------- browser-only helpers: only ever called from engine methods, never at import time ---------- */
import { MAX_DESIGN_PX } from './constants';
import type { DesignSource, PixelData } from './types';

export const hasDom = (): boolean => typeof document !== 'undefined' && typeof document.createElement === 'function';

function needDom(what: string): void {
  if (!hasDom()) throw new Error(`@store/stitch: ${what} needs a browser (canvas). Call it from a client component.`);
}

/** a new <canvas>; width/height are set only when given (a bare canvas starts at 300 × 150) */
export function createCanvas(w?: number, h?: number): HTMLCanvasElement {
  needDom('drawing');
  const c = document.createElement('canvas');
  if (w !== undefined) c.width = w;
  if (h !== undefined) c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const x = c.getContext('2d', opts);
  if (!x) throw new Error('@store/stitch: canvas 2D context is not available');
  return x;
}

/** RGBA pixels of a design source, scaled to fit 440 px (at least 16 px a side) */
export function pixels(src: DesignSource): PixelData {
  const nat = 'naturalWidth' in src ? src : null,
    sw = (nat && nat.naturalWidth) || src.width || 600,
    sh = (nat && nat.naturalHeight) || src.height || 600,
    s = Math.min(1, MAX_DESIGN_PX / Math.max(sw, sh)),
    w = Math.max(16, Math.round(sw * s)),
    h = Math.max(16, Math.round(sh * s));
  const c = createCanvas(w, h),
    x = ctx2d(c, { willReadFrequently: true });
  x.drawImage(src, 0, 0, w, h);
  return { d: x.getImageData(0, 0, w, h).data, w, h, sw, sh };
}

/** load an image; crossOrigin 'anonymous' keeps canvas pixel reads working when served from a CDN */
export function loadImage(src: string, crossOrigin: string | null = 'anonymous'): Promise<HTMLImageElement> {
  needDom('loading images');
  return new Promise((res, rej) => {
    const im = new Image();
    if (crossOrigin !== null) im.crossOrigin = crossOrigin;
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`@store/stitch: could not load ${src.length > 120 ? src.slice(0, 120) + '…' : src}`));
    im.src = src;
  });
}
