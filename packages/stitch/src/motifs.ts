/* ---------- stitch primitives + motif library (SVG strings, pure, no DOM) ----------
   Motifs are drawn in a -62..62 viewBox. draw() returns layers: b (back, lifted), v (vertical satin),
   s (satin), t (top details, lifted). inner()/grp() wrap them in the stitch filters (STITCH_FILTER_DEFS);
   the stitch engine draws them flat instead (see design.ts). */
import { f, shade } from './colour';
import { TH, type ThreadKey } from './threads';

export { sample, samplePathPure } from './svg-path';

/** French knot */
export const knot = (x: number, y: number, r: number, c: string): string =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${c}"/><circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.32)}" r="${f(r * 0.38)}" fill="#fff" opacity=".55"/>`;
/** running stitch along a path */
export const run = (d: string, c: string, w: number = 2.2, da: string = '6 4'): string =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${da}"/>`;
/** chain stitch along a path */
export const chain = (d: string, c: string, w: number = 3.8): string =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="6 2.8"/><path d="${d}" fill="none" stroke="${shade(c, -0.38)}" stroke-width="${f(w * 0.26)}" stroke-linecap="round" stroke-dasharray="6 2.8"/>`;
/** satin leaf from (x, y), length len, rotated ang degrees */
export const leaf = (x: number, y: number, len: number, ang: number, c: string, w: number = 0.38): string => {
  const h = f(len * w),
    m = f(len * 0.5);
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${ang})"><path d="M0 0Q${m} ${-h} ${len} 0Q${m} ${h} 0 0Z" fill="${c}"/><path d="M0 0Q${m} ${-h} ${len} 0Z" fill="${shade(c, -0.2)}"/></g>`;
};
/** petal path (pointing up from the origin) */
export const petal = (len: number, wid: number): string =>
  `M0 0C${f(-wid)} ${f(-len * 0.35)} ${f(-wid * 0.6)} ${-len} 0 ${-len}C${f(wid * 0.6)} ${-len} ${wid} ${f(-len * 0.35)} 0 0Z`;
/** five-pointed star */
export function star(cx: number, cy: number, r: number, c: string): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5,
      rr = i % 2 ? r * 0.46 : r;
    d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rr) + ' ' + f(cy + Math.sin(a) * rr);
  }
  return `<path d="${d}Z" fill="${c}" stroke="${c}" stroke-width="1" stroke-linejoin="round"/>`;
}

/** motif layers */
export interface MotifParts {
  /** back layer (lifted) */
  b?: string;
  /** vertical satin */
  v?: string;
  /** satin */
  s?: string;
  /** top details (lifted) */
  t?: string;
}

/** a motif's layers wrapped in the stitch filters (fine = the finer filters for big renders) */
export const inner = (m: MotifParts, fine?: boolean): string => {
  const k = fine ? '2' : '';
  return (
    (m.b ? `<g filter="url(#lift)">${m.b}</g>` : '') +
    (m.v ? `<g filter="url(#satinV${k})">${m.v}</g>` : '') +
    (m.s ? `<g filter="url(#satin${k})">${m.s}</g>` : '') +
    (m.t ? `<g filter="url(#lift)">${m.t}</g>` : '')
  );
};
/** inner() in a <g>, optionally transformed */
export const grp = (m: MotifParts, tr?: string, fine?: boolean): string =>
  `<g${tr ? ` transform="${tr}"` : ''}>${inner(m, fine)}</g>`;

/** SVG <filter> elements used by inner()/grp(); put them once in the page, e.g. <svg width="0" height="0"><defs>…</defs></svg> */
export const STITCH_FILTER_DEFS = `<filter id="satin" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.03 0.34" numOctaves="2" seed="4" result="n"/><feDiffuseLighting in="n" surfaceScale="2.6" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.32" k2="0" k3="0" k4="0" result="tx"/><feGaussianBlur in="SourceAlpha" stdDeviation="1" result="b"/><feOffset in="b" dx=".6" dy="1.5" result="o"/><feFlood flood-color="#2A1638" flood-opacity=".42"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="tx"/></feMerge></filter><filter id="satinV" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.34 0.03" numOctaves="2" seed="9" result="n"/><feDiffuseLighting in="n" surfaceScale="2.6" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.32" k2="0" k3="0" k4="0" result="tx"/><feGaussianBlur in="SourceAlpha" stdDeviation="1" result="b"/><feOffset in="b" dx=".6" dy="1.5" result="o"/><feFlood flood-color="#2A1638" flood-opacity=".42"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="tx"/></feMerge></filter><filter id="satin2" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.62" numOctaves="2" seed="4" result="n"/><feDiffuseLighting in="n" surfaceScale="1.6" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.32" k2="0" k3="0" k4="0" result="tx"/><feGaussianBlur in="SourceAlpha" stdDeviation=".6" result="b"/><feOffset in="b" dx=".4" dy=".8" result="o"/><feFlood flood-color="#2A1638" flood-opacity=".42"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="tx"/></feMerge></filter><filter id="satinV2" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.62 0.05" numOctaves="2" seed="9" result="n"/><feDiffuseLighting in="n" surfaceScale="1.6" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.32" k2="0" k3="0" k4="0" result="tx"/><feGaussianBlur in="SourceAlpha" stdDeviation=".6" result="b"/><feOffset in="b" dx=".4" dy=".8" result="o"/><feFlood flood-color="#2A1638" flood-opacity=".42"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="tx"/></feMerge></filter><filter id="lift" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation=".7" result="b"/><feOffset in="b" dx=".4" dy="1.1" result="o"/><feFlood flood-color="#2A1638" flood-opacity=".4"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

/* ---------- motif library ---------- */
export const PAISLEY = 'M0 48C-40 48-50 5-28-20C-12-38 18-42 30-58C24-40 40-28 38-6C36 24 22 48 0 48Z';
export const HEART = 'M0 36C-46 6-40-38 0-16C40-38 46 6 0 36Z';

/**
 * sample(PAISLEY, 15) as measured by Chromium's SVG path probe (Chrome 151). The prototype sampled it at
 * runtime; a fixed table keeps the kairi motif identical on the server and in every browser.
 */
export const PAISLEY_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 48],
  [-18.80177879333496, 44.1158332824707],
  [-33.2462272644043, 31.614194869995117],
  [-39.29117965698242, 13.439396858215332],
  [-36.6104850769043, -5.575847148895264],
  [-26.316049575805664, -21.7930965423584],
  [-10.698993682861328, -33.11360549926758],
  [6.627604007720947, -41.72981262207031],
  [23.347360610961914, -51.40938186645508],
  [28.69361114501953, -48.18781280517578],
  [33.947410583496094, -29.641693115234375],
  [38.16164779663086, -10.849483489990234],
  [36.03227615356445, 8.352227210998535],
  [29.77566146850586, 26.610671997070312],
  [17.916095733642578, 41.70996856689453],
];

export type MotifKey = 'phoolwari' | 'gulaab' | 'phool' | 'kairi' | 'mor' | 'kamal' | 'chand' | 'dil' | 'genda';

export interface Motif {
  name: string;
  /** typical stitch count */
  st: number;
  /** what each colour slot paints */
  slots: readonly [string, string, string];
  /** default thread per slot */
  def: readonly [ThreadKey, ThreadKey, ThreadKey];
  /** layers for colours ['#rrggbb' × 3] (phoolwari takes an optional 4th: the small rose) */
  draw(cols: readonly string[]): MotifParts;
}

type C3 = readonly [string, string, string, string?];
const cols3 = (c: readonly string[]) => c as unknown as C3;

const gulaab: Motif = {
  name: 'Gulaab',
  st: 4200,
  slots: ['Petals', 'Centre', 'Leaves'],
  def: ['rani', 'sindoor', 'mehendi'],
  draw(cols) {
    const [p, c, l] = cols3(cols);
    let v = '',
      s = '',
      t = '';
    v += leaf(-12, 16, 46, 150, l) + leaf(12, 16, 46, 30, l) + leaf(0, 24, 38, 90, l, 0.33);
    for (let i = 0; i < 5; i++) {
      const a = ((i * 72 - 90) * Math.PI) / 180;
      s += `<circle cx="${f(Math.cos(a) * 21)}" cy="${f(Math.sin(a) * 21)}" r="19" fill="${p}"/>`;
    }
    for (let i = 0; i < 5; i++) {
      const a = ((i * 72 - 54) * Math.PI) / 180;
      s += `<circle cx="${f(Math.cos(a) * 11)}" cy="${f(Math.sin(a) * 11)}" r="14" fill="${shade(p, -0.18)}"/>`;
    }
    s += `<circle r="10.5" fill="${c}"/>`;
    for (let i = 0; i < 5; i++) {
      const a = ((i * 72 - 90) * Math.PI) / 180,
        x = Math.cos(a) * 21,
        y = Math.sin(a) * 21,
        ca = Math.cos(a + Math.PI / 2),
        sa = Math.sin(a + Math.PI / 2),
        ra = Math.cos(a),
        rb = Math.sin(a);
      t += `<path d="M${f(x - 10 * ca + 4 * ra)} ${f(y - 10 * sa + 4 * rb)}Q${f(x + 15 * ra)} ${f(y + 15 * rb)} ${f(x + 10 * ca + 4 * ra)} ${f(y + 10 * sa + 4 * rb)}" fill="none" stroke="${shade(p, 0.4)}" stroke-width="1.7" stroke-linecap="round"/>`;
    }
    t += `<path d="M-4.5 1.5a4.8 4.8 0 1 1 8.6 1.6a3.2 3.2 0 1 1-5.6-1.8" fill="none" stroke="${shade(c, 0.5)}" stroke-width="1.7" stroke-linecap="round"/>`;
    return { v, s, t };
  },
};

const phool: Motif = {
  name: 'Phool',
  st: 3100,
  slots: ['Petals', 'Centre', 'Leaves'],
  def: ['neel', 'haldi', 'mehendi'],
  draw(cols) {
    const [p, c, l] = cols3(cols);
    let v = '',
      t = '';
    v += leaf(-6, 30, 36, 128, l) + leaf(6, 30, 36, 52, l);
    for (let i = 0; i < 12; i++)
      t += `<g transform="rotate(${i * 30})"><ellipse cx="0" cy="-25" rx="6.4" ry="15.5" fill="${shade(p, 0.78)}" fill-opacity=".55" stroke="${p}" stroke-width="3.3"/><path d="M0-41v-3.2" stroke="${p}" stroke-width="2.6" stroke-linecap="round"/></g>`;
    const dots: Array<[number, number]> = [
      [0, 0],
      [6.4, 0],
      [-6.4, 0],
      [3.2, 5.5],
      [-3.2, 5.5],
      [3.2, -5.5],
      [-3.2, -5.5],
      [9.6, 5.5],
      [-9.6, 5.5],
      [9.6, -5.5],
      [-9.6, -5.5],
      [0, 11],
      [0, -11],
    ];
    dots.forEach(([x, y]) => (t += knot(x, y, 3.5, c)));
    return { v, t };
  },
};

const kairi: Motif = {
  name: 'Kairi',
  st: 3800,
  slots: ['Outline', 'Inner', 'Dots'],
  def: ['sindoor', 'mor', 'haldi'],
  draw(cols) {
    const [o, i, d] = cols3(cols);
    let s = '',
      t = '';
    s += `<g transform="translate(-3 12) scale(.4)"><path d="${PAISLEY}" fill="${i}"/></g><g transform="translate(-4 16) scale(.18)"><path d="${PAISLEY}" fill="${d}"/></g>`;
    t += chain(PAISLEY, o, 4.2);
    t += `<g transform="translate(-1.5 6.5) scale(.72)">${run(PAISLEY, i, 3, '5 4')}</g>`;
    PAISLEY_POINTS.forEach(([x, y]) => (t += knot(-1 + x * 0.86, 3.5 + y * 0.86, 2.5, d)));
    return { s, t };
  },
};

const mor: Motif = {
  name: 'Mor Pankh',
  st: 5200,
  slots: ['Eye', 'Ring', 'Feather'],
  def: ['haldi', 'neel', 'mor'],
  draw(cols) {
    const [e, m, o] = cols3(cols);
    let b = '',
      s = '',
      t = '';
    for (let y = 46, k = 0; y >= -46; y -= 5, k++) {
      const w = Math.max(0, 1 - Math.abs(y + 16) / 66),
        len = f(10 + w * 30),
        cc = k % 2 ? o : shade(o, 0.3);
      b += `<path d="M0 ${y}L${-len} ${f(y - 10)}M0 ${y}L${len} ${f(y - 10)}" stroke="${cc}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    b += `<path d="M0 58C2 30-2 2 0-54" fill="none" stroke="${shade(o, -0.35)}" stroke-width="2.6" stroke-linecap="round"/>`;
    s += `<ellipse cx="0" cy="-18" rx="21" ry="27" fill="${o}"/><ellipse cx="0" cy="-15" rx="14.5" ry="19.5" fill="${m}"/><path d="M0-3C-9-7-10-19-5-25.5C-2-28.5 2-28.5 5-25.5C10-19 9-7 0-3Z" fill="${e}"/>`;
    t += knot(0, -17, 2.6, shade(e, 0.55));
    return { b, s, t };
  },
};

const kamal: Motif = {
  name: 'Kamal',
  st: 4600,
  slots: ['Petals', 'Centre', 'Water'],
  def: ['gulaab', 'haldi', 'mor'],
  draw(cols) {
    const [p, c, w] = cols3(cols);
    let s = '',
      t = '';
    const P: Array<[number, number, number, string]> = [
      [-64, 40, 16, shade(p, -0.14)],
      [64, 40, 16, shade(p, -0.14)],
      [-32, 48, 19, p],
      [32, 48, 19, p],
      [0, 54, 22, shade(p, 0.14)],
    ];
    s +=
      `<g transform="translate(0 10)">` +
      P.map(([a, len, wd, cc]) => `<path transform="rotate(${a})" d="${petal(len, wd)}" fill="${cc}"/>`).join('') +
      `<path d="M-24 0C-18 12 18 12 24 0L18 9C9 16-9 16-18 9Z" fill="${c}"/></g>`;
    const veins: Array<[number, number]> = [
      [-32, 48],
      [32, 48],
      [0, 54],
    ];
    t +=
      `<g transform="translate(0 10)">` +
      veins
        .map(
          ([a, len]) =>
            `<path transform="rotate(${a})" d="M0-8V${-len + 12}" stroke="${shade(p, -0.32)}" stroke-width="1.5" stroke-linecap="round"/>`,
        )
        .join('') +
      `</g>`;
    t += run('M-52 34q13-7 26 0t26 0t26 0t26 0', w, 2.6, '5 4') + run('M-38 45q10-6 19 0t19 0t19 0t19 0', w, 2.3, '5 4');
    return { s, t };
  },
};

const chand: Motif = {
  name: 'Chand Tara',
  st: 2600,
  slots: ['Moon', 'Stars', 'Dots'],
  def: ['haldi', 'neel', 'gulaab'],
  draw(cols) {
    const [m, st, d] = cols3(cols);
    let s = '',
      t = '';
    s +=
      `<path d="M8-44A44 44 0 1 0 8 44A22 44 0 1 1 8-44Z" fill="${m}"/>` +
      star(24, -16, 11, st) +
      star(36, 16, 7.5, st) +
      star(14, 32, 5.5, st);
    const dots: Array<[number, number]> = [
      [-10, -52],
      [40, -40],
      [48, 34],
      [-6, 54],
      [28, 2],
    ];
    dots.forEach(([x, y]) => (t += knot(x, y, 2.6, d)));
    return { s, t };
  },
};

const dil: Motif = {
  name: 'Dil',
  st: 2200,
  slots: ['Heart', 'Outline', 'Dots'],
  def: ['sindoor', 'rani', 'haldi'],
  draw(cols) {
    const [h, o, d] = cols3(cols);
    const s = `<path d="${HEART}" fill="${h}"/>`;
    let t = '';
    t += `<g transform="translate(0 -1) scale(1.3)">${run(HEART, o, 1.8, '4 3.4')}</g>`;
    t += `<path d="M-15-13q-9 5-8 15" fill="none" stroke="${shade(h, 0.5)}" stroke-width="2.6" stroke-linecap="round"/>`;
    const dots: Array<[number, number]> = [
      [-42, -32],
      [44, -28],
      [-48, 22],
      [48, 24],
      [0, -50],
    ];
    dots.forEach(([x, y]) => (t += knot(x, y, 2.8, d)));
    return { s, t };
  },
};

const genda: Motif = {
  name: 'Genda',
  st: 5000,
  slots: ['Outer', 'Inner', 'Leaves'],
  def: ['kesar', 'haldi', 'mehendi'],
  draw(cols) {
    const [o, i, l] = cols3(cols);
    let v = '',
      s = '',
      t = '';
    v += leaf(-14, 20, 40, 140, l) + leaf(14, 20, 40, 40, l);
    const ring = (n: number, dist: number, r: number, cc: string, off: number) => {
      for (let k = 0; k < n; k++) {
        const a = (((k * 360) / n + off) * Math.PI) / 180;
        s += `<circle cx="${f(Math.cos(a) * dist)}" cy="${f(Math.sin(a) * dist)}" r="${r}" fill="${cc}"/>`;
      }
    };
    ring(14, 25, 10, shade(o, -0.08), 0);
    ring(14, 23, 8, o, 12.8);
    ring(11, 15, 9, shade(i, -0.05), 0);
    ring(9, 8, 7.5, i, 20);
    s += `<circle r="6.5" fill="${shade(i, -0.28)}"/>`;
    for (let k = 0; k < 14; k++) {
      const a = (((k * 360) / 14 + 6) * Math.PI) / 180;
      t += `<path d="M${f(Math.cos(a) * 27)} ${f(Math.sin(a) * 27)}l${f(Math.cos(a) * 6)} ${f(Math.sin(a) * 6)}" stroke="${shade(o, 0.35)}" stroke-width="1.4" stroke-linecap="round"/>`;
    }
    return { v, s, t };
  },
};

/** a bouquet of the other motifs; the optional 4th colour is the small rose (default: a lighter shade of the big one) */
const phoolwari: Motif = {
  name: 'Phoolwari',
  st: 7200,
  slots: ['Roses', 'Flowers', 'Leaves'],
  def: ['rani', 'neel', 'mehendi'],
  draw(cols) {
    const [a, b, l, a2] = cols3(cols);
    const m = (n: MotifKey, cs: readonly string[], x: number, y: number, sc: number, r = 0) =>
      grp(MOTIFS[n].draw(cs), `translate(${x} ${y}) rotate(${r}) scale(${sc})`).replace(/ filter="url\(#[^)]*\)"/g, '');
    return {
      s:
        m('gulaab', [a, TH.haldi, l], -14, -6, 0.62) +
        m('gulaab', [a2 || shade(a, 0.38), TH.sindoor, l], 26, -22, 0.44, 16) +
        m('phool', [b, TH.haldi, l], 16, 26, 0.34) +
        m('phool', [TH.sindoor, TH.haldi, l], -34, 30, 0.25, -12) +
        m('dil', [TH.haldi, a, a], 36, 22, 0.2, 12),
    };
  },
};

export const MOTIFS: Readonly<Record<MotifKey, Motif>> = {
  gulaab,
  phool,
  kairi,
  mor,
  kamal,
  chand,
  dil,
  genda,
  phoolwari,
};

/** motif picker order (phoolwari first) */
export const MOTIF_KEYS: readonly MotifKey[] = [
  'phoolwari',
  ...(Object.keys(MOTIFS) as MotifKey[]).filter((k) => k !== 'phoolwari'),
];
