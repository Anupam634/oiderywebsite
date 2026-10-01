/* ---------- colour maths + small string helpers (pure, no DOM) ---------- */
import type { Lab, Rgb } from './types';

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** '#rrggbb' → [r, g, b] in 0–255 */
export const hexRgb = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** sRGB channel (0–255) → linear light (0–1) */
export const lin = (c: number): number => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** sRGB (0–255) → CIE Lab (D65) */
export function lab(r: number, g: number, b: number): Lab {
  const R = lin(r),
    G = lin(g),
    B = lin(b);
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047,
    Y = R * 0.2126 + G * 0.7152 + B * 0.0722,
    Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  X = t(X);
  Y = t(Y);
  Z = t(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/** relative luminance (0–1) of '#rrggbb' */
export const relLum = (hex: string): number => {
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** mix '#rrggbb' towards white (p > 0) or black (p < 0) by |p|; returns lower-case '#rrggbb' */
export function shade(hex: string, p: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16,
    g = (n >> 8) & 255,
    b = n & 255;
  const t = p < 0 ? 0 : 255,
    a = Math.abs(p);
  r = Math.round((t - r) * a + r);
  g = Math.round((t - g) * a + g);
  b = Math.round((t - b) * a + b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** round to 2 decimals (keeps SVG output short) */
export const f = (n: number): number => Math.round(n * 100) / 100;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** escape text for HTML / SVG */
export const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => ESC[c]!);
