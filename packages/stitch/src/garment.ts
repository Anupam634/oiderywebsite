/* ---------- garment photos: brightness, mask, edge fringe and recolouring (pure, no DOM) ---------- */
import { clamp, hexRgb, relLum } from './colour';
import { boxBlur } from './image';

/** a decoded garment photo, kept per view */
export interface GarmentPixels {
  /** photo RGBA */
  px: Uint8ClampedArray;
  /** brightness 0–1 */
  lum: Float32Array;
  /** garment mask 0–1 (red channel of the mask PNG) */
  m: Float32Array;
  /** brightness blurred (radius 4): its slope bends the stitches over folds */
  blur: Float32Array;
  /** edge fringe as flat triples [outside pixel, nearest inside pixel, garment share] */
  fr: number[];
}

/** decode step: photo + mask RGBA (same size) → the maps the renderer needs */
export function prepareGarment(
  px: Uint8ClampedArray,
  mask: ArrayLike<number>,
  W: number,
  H: number,
): GarmentPixels {
  const lum = new Float32Array(W * H),
    m = new Float32Array(W * H);
  for (let i = 0, j = 0; i < W * H; i++, j += 4) {
    lum[i] = (0.2126 * px[j]! + 0.7152 * px[j + 1]! + 0.0722 * px[j + 2]!) / 255;
    m[i] = mask[j]! / 255;
  }
  const blur = boxBlur(lum, W, H, 4);
  return { px, lum, m, blur, fr: garmentFringe(m, lum, W, H) };
}

/**
 * Edge pixels just outside the mask are a mix of garment and background (a light ring on dark colours).
 * For each, estimate the garment share from brightness (inside vs outside neighbours) so recolouring
 * can recolour that share. Returns flat triples [pixel, nearest inside pixel, share].
 */
export function garmentFringe(m: Float32Array, lum: Float32Array, W: number, H: number): number[] {
  const N = W * H,
    ins = new Uint8Array(N),
    t = new Uint8Array(N),
    near = new Uint8Array(N),
    F: number[] = [];
  for (let i = 0; i < N; i++) ins[i] = m[i]! >= 0.9 ? 1 : 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -3; k <= 3 && !v; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < W) v = ins[y * W + xx]!;
      }
      t[y * W + x] = v;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -3; k <= 3 && !v; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < H) v = t[yy * W + x]!;
      }
      near[y * W + x] = v;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (ins[i] || !near[i]) continue;
      let bi = -1,
        bd = 1e9,
        so = 0,
        no = 0;
      for (let dy = -4; dy <= 4; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -4; dx <= 4; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const j = yy * W + xx,
            dd = dx * dx + dy * dy;
          if (ins[j]) {
            if (dd < bd) {
              bd = dd;
              bi = j;
            }
          } else if (m[j]! <= 0.02) {
            so += lum[j]!;
            no++;
          }
        }
      }
      if (bi < 0) continue;
      const lo = no ? so / no : 0,
        den = lum[bi]! - lo;
      let a = m[i]!;
      if (den > 0.08) a = Math.max(a, clamp((lum[i]! - lo) / den, 0, 1));
      if (a > 0.01) F.push(i, bi, a);
    }
  return F;
}

/**
 * Dye the garment: writes the photo into `d` (RGBA, same size), recoloured inside the mask with `hex`
 * keeping the fabric's light and shade (null = the photo as shot). `ref` is the garment's average brightness.
 */
export function recolourGarment(g: GarmentPixels, ref: number, hex: string | null, d: Uint8ClampedArray): void {
  const px = g.px,
    N = g.lum.length;
  d.set(px);
  if (!hex) return;
  const c = hexRgb(hex),
    r = c[0] / 255,
    gg = c[1] / 255,
    b = c[2] / 255,
    L = relLum(hex),
    sheen = L < 0.08 ? 0.62 : L < 0.35 ? 0.42 : 0.22;
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const m = g.m[i]!;
    if (m <= 0.002) continue;
    let l = g.lum[i]! / ref;
    if (l > 1.22) l = 1.22;
    const t = Math.pow(l, 1.18),
      hl = l > 0.8 ? (l - 0.8) * sheen : 0;
    d[j] = px[j]! + (Math.min(1, r * t + hl) * 255 - px[j]!) * m;
    d[j + 1] = px[j + 1]! + (Math.min(1, gg * t + hl) * 255 - px[j + 1]!) * m;
    d[j + 2] = px[j + 2]! + (Math.min(1, b * t + hl) * 255 - px[j + 2]!) * m;
  }
  const F = g.fr;
  for (let n = 0; n < F.length; n += 3) {
    const j = F[n]! * 4,
      k = F[n + 1]! * 4,
      al = F[n + 2]!;
    d[j] = px[j]! + al * (d[k]! - px[k]!);
    d[j + 1] = px[j + 1]! + al * (d[k + 1]! - px[k + 1]!);
    d[j + 2] = px[j + 2]! + al * (d[k + 2]! - px[k + 2]!);
  }
}
