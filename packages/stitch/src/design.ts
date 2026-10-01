/* ---------- designs drawn in code: motif + name → an image with known thread colours ---------- */
import { createCanvas, ctx2d, loadImage } from './dom';
import { FONTS, fontStr, isFontKey, type FontKey } from './fonts';
import { MOTIFS, type MotifKey } from './motifs';
import { col } from './threads';
import type { DesignImage, DesignSpec } from './types';

/** the motif drawn at this many px in a design image */
export const MOTIF_PX = 620;

const isMotifKey = (k: unknown): k is MotifKey =>
  typeof k === 'string' && Object.prototype.hasOwnProperty.call(MOTIFS, k);

/**
 * A motif with flat thread colours (no shading filters, no white knot highlights) as a standalone
 * 620 × 620 SVG, plus the lower-case colours it uses. Pure: works without a DOM.
 */
export function motifSvg(name: MotifKey, cols: readonly string[]): { svg: string; used: string[] } {
  const m = MOTIFS[name].draw(cols),
    body = ((m.b || '') + (m.v || '') + (m.s || '') + (m.t || '')).replace(
      /<circle[^>]*fill="#fff"[^>]*\/>/g,
      '',
    );
  const used = [...new Set((body.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase()))];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-62 -62 124 124" width="${MOTIF_PX}" height="${MOTIF_PX}">${body}</svg>`;
  return { svg, used };
}

/** motif colours for a spec: thread keys / hex → hex (missing list → the motif's defaults) */
export function motifColours(name: MotifKey, mcols: readonly string[] | undefined): string[] {
  const keys = mcols && mcols.length ? mcols : MOTIFS[name].def;
  return keys.map((k, i) => {
    const h = col(k);
    if (h === undefined)
      throw new Error(`@store/stitch: unknown thread colour "${k}" for motif slot ${i + 1}`);
    return h;
  });
}

/** crop a canvas to its visible pixels (alpha > 8) plus 6 px */
export function trimCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const x = ctx2d(c, { willReadFrequently: true }),
    d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width,
    y0 = c.height,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < c.height; y++)
    for (let X = 0; X < c.width; X++)
      if (d[(y * c.width + X) * 4 + 3]! > 8) {
        if (X < x0) x0 = X;
        if (X > x1) x1 = X;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < x0) return c;
  const p = 6,
    t = createCanvas();
  t.width = x1 - x0 + 1 + p * 2;
  t.height = y1 - y0 + 1 + p * 2;
  ctx2d(t).drawImage(c, x0 - p, y0 - p, t.width, t.height, 0, 0, t.width, t.height);
  return t;
}

/**
 * Draw a motif (620 px) above a name. maxW caps the name's width in px (the font shrinks, not below 80 px).
 * Returns the trimmed canvas and the exact colours used, for analyseKnown().
 * `families` overrides font families (e.g. next/font names); it must describe the same fonts.
 */
export async function drawDesign(
  spec: DesignSpec,
  families: Partial<Record<FontKey, string>> = {},
): Promise<DesignImage> {
  const pal: string[] = [];
  let mImg: HTMLImageElement | null = null;
  if (spec.motif && spec.motif !== 'none') {
    if (!isMotifKey(spec.motif)) throw new Error(`@store/stitch: unknown motif "${String(spec.motif)}"`);
    const r = motifSvg(spec.motif, motifColours(spec.motif, spec.mcols));
    mImg = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg), null);
    pal.push(...r.used);
  }
  const text = (spec.text || '').trim(),
    F = spec.font || 'script';
  if (!isFontKey(F)) throw new Error(`@store/stitch: unknown font "${String(F)}"`);
  const tcol = text ? col(spec.tcol) : undefined;
  if (text && tcol === undefined)
    throw new Error(`@store/stitch: a name needs a thread colour (tcol), got "${String(spec.tcol)}"`);
  const fam = families[F] ?? FONTS[F].fam,
    c = createCanvas(),
    x = ctx2d(c);
  let fs = 200;
  x.font = fontStr(F, fs, fam);
  let tw = text ? x.measureText(text).width : 0;
  if (spec.maxW && tw > spec.maxW) {
    fs = Math.max(80, Math.floor((fs * spec.maxW) / tw));
    x.font = fontStr(F, fs, fam);
    tw = x.measureText(text).width;
  }
  const mw = mImg ? MOTIF_PX : 0,
    gap = mImg && text ? 10 : 0,
    th = text ? fs * 1.35 : 0;
  c.width = Math.ceil(Math.max(mw, tw) + 60);
  c.height = Math.ceil(mw + gap + th + 60);
  if (mImg) x.drawImage(mImg, (c.width - mw) / 2, 30, mw, mw);
  if (text && tcol) {
    x.font = fontStr(F, fs, fam);
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    x.fillStyle = tcol;
    x.fillText(text, c.width / 2, 30 + mw + gap + fs * 1.02);
    pal.push(tcol);
  }
  return { canvas: trimCanvas(c), palette: [...new Set(pal)] };
}
