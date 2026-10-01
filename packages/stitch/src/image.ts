/* ---------- image helpers on plain arrays (pure, no DOM) ---------- */
import { clamp } from './colour';
import type { Rgb } from './types';

/** separable box blur of radius r (edges clamped) */
export function boxBlur(src: ArrayLike<number>, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h),
    out = new Float32Array(w * h),
    n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[o + clamp(x, 0, w - 1)]!;
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s / n;
      s += src[o + Math.min(w - 1, x + r + 1)]! - src[o + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}

/** bilinear sample, coordinates clamped to the image */
export function bl(a: ArrayLike<number>, w: number, h: number, x: number, y: number): number {
  x = x < 0 ? 0 : x > w - 1.001 ? w - 1.001 : x;
  y = y < 0 ? 0 : y > h - 1.001 ? h - 1.001 : y;
  const x0 = x | 0,
    y0 = y | 0,
    fx = x - x0,
    fy = y - y0,
    i = y0 * w + x0;
  return (a[i]! * (1 - fx) + a[i + 1]! * fx) * (1 - fy) + (a[i + w]! * (1 - fx) + a[i + w + 1]! * fx) * fy;
}

/** bilinear sample, 0 outside the image */
export function blz(a: ArrayLike<number>, w: number, h: number, x: number, y: number): number {
  if (x < -1 || y < -1 || x > w || y > h) return 0;
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0,
    g = (X: number, Y: number) => (X < 0 || Y < 0 || X >= w || Y >= h ? 0 : a[Y * w + X]!);
  return (
    (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) +
    (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy
  );
}

/**
 * Chamfer distance (px) from every stitched pixel to the nearest edge between areas of different
 * thread (or the image border). Empty pixels (255) are 0, edge pixels 0.5.
 */
export function chamfer(idx: Uint8Array, w: number, h: number): Float32Array {
  const N = w * h,
    D = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = idx[i];
    if (v === 255) {
      D[i] = 0;
      continue;
    }
    const X = i % w,
      Y = (i / w) | 0;
    D[i] =
      X === 0 ||
      X === w - 1 ||
      Y === 0 ||
      Y === h - 1 ||
      idx[i - 1] !== v ||
      idx[i + 1] !== v ||
      idx[i - w] !== v ||
      idx[i + w] !== v
        ? 0.5
        : 1e6;
  }
  for (let Y = 0; Y < h; Y++)
    for (let X = 0; X < w; X++) {
      const i = Y * w + X;
      let d = D[i]!;
      if (d <= 0.5) continue;
      if (X > 0) d = Math.min(d, D[i - 1]! + 1);
      if (Y > 0) {
        d = Math.min(d, D[i - w]! + 1);
        if (X > 0) d = Math.min(d, D[i - w - 1]! + 1.414);
        if (X < w - 1) d = Math.min(d, D[i - w + 1]! + 1.414);
      }
      D[i] = d;
    }
  for (let Y = h - 1; Y >= 0; Y--)
    for (let X = w - 1; X >= 0; X--) {
      const i = Y * w + X;
      let d = D[i]!;
      if (d <= 0.5) continue;
      if (X < w - 1) d = Math.min(d, D[i + 1]! + 1);
      if (Y < h - 1) {
        d = Math.min(d, D[i + w]! + 1);
        if (X < w - 1) d = Math.min(d, D[i + w + 1]! + 1.414);
        if (X > 0) d = Math.min(d, D[i + w - 1]! + 1.414);
      }
      D[i] = d;
    }
  return D;
}

/** 3×3 majority filter on a thread-index map (255 = empty); a pixel changes only when 5+ of 9 agree */
export function smoothIdx(idx: Uint8Array, w: number, h: number): Uint8Array {
  const out = idx.slice(),
    cs = new Int32Array(8);
  for (let Y = 1; Y < h - 1; Y++)
    for (let X = 1; X < w - 1; X++) {
      const i = Y * w + X;
      cs.fill(0);
      let best = idx[i]!,
        bc = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const v = idx[i + dy * w + dx]!,
            t = v === 255 ? 7 : v,
            n = (cs[t] = cs[t]! + 1);
          if (n > bc) {
            bc = n;
            best = v;
          }
        }
      if (bc >= 5) out[i] = best;
    }
  return out;
}

/** median colour of the image border (the likely background) */
export function borderMedian(d: ArrayLike<number>, w: number, h: number): Rgb {
  const r: number[] = [],
    g: number[] = [],
    b: number[] = [];
  const add = (i: number) => {
    r.push(d[i * 4]!);
    g.push(d[i * 4 + 1]!);
    b.push(d[i * 4 + 2]!);
  };
  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    add(y * w);
    add(y * w + w - 1);
  }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]!;
  return [med(r), med(g), med(b)];
}
