/* ---------- threads and garment colours ---------- */
import { hexRgb, lab } from './colour';
import type { Lab } from './types';

export type ThreadKey =
  | 'rani'
  | 'gulaab'
  | 'sindoor'
  | 'kesar'
  | 'haldi'
  | 'mehendi'
  | 'mor'
  | 'neel'
  | 'jamun'
  | 'chandi'
  | 'moti'
  | 'kajal';

/** the 12 threads offered for motifs and names, by key */
export const TH: Readonly<Record<ThreadKey, string>> = {
  rani: '#E4007C',
  gulaab: '#FF78B4',
  sindoor: '#FF4B2B',
  kesar: '#FF8A00',
  haldi: '#FFB300',
  mehendi: '#5DAA3A',
  mor: '#00A39A',
  neel: '#3D2BD6',
  jamun: '#7B2CBF',
  chandi: '#B4BBC9',
  moti: '#FFF5E1',
  kajal: '#231B30',
};

/** [key, display name] in picker order */
export const THREADS: ReadonlyArray<readonly [ThreadKey, string]> = [
  ['rani', 'Rani'],
  ['gulaab', 'Gulaab'],
  ['sindoor', 'Sindoor'],
  ['kesar', 'Kesar'],
  ['haldi', 'Haldi'],
  ['mehendi', 'Mehendi'],
  ['mor', 'Mor Pankh'],
  ['neel', 'Neel'],
  ['jamun', 'Jamun'],
  ['chandi', 'Chandi'],
  ['moti', 'Moti'],
  ['kajal', 'Kajal'],
];

/** display name by thread key */
export const TNAME = Object.fromEntries(THREADS) as Readonly<Record<ThreadKey, string>>;

export const isThreadKey = (k: unknown): k is ThreadKey =>
  typeof k === 'string' && Object.prototype.hasOwnProperty.call(TH, k);

/** a thread key ('rani') or a '#rrggbb' colour → '#rrggbb' (undefined if it is neither) */
export const col = (c: string | null | undefined): string | undefined =>
  c && c[0] === '#' ? c : isThreadKey(c) ? TH[c] : undefined;

/** the 23 thread colours an uploaded logo is matched to: [name, hex]. D.threads holds indexes into this. */
export const TPAL: ReadonlyArray<readonly [name: string, hex: string]> = [
  ['Rani', '#E4007C'],
  ['Gulaab', '#FF78B4'],
  ['Sindoor', '#FF4B2B'],
  ['Red', '#D11F33'],
  ['Kesar', '#FF8A00'],
  ['Haldi', '#FFB300'],
  ['Gold', '#C99A2E'],
  ['Mehendi', '#5DAA3A'],
  ['Bottle green', '#1F5B42'],
  ['Mor Pankh', '#00A39A'],
  ['Teal', '#0F766E'],
  ['Sky', '#6FB3E6'],
  ['Neel', '#3D2BD6'],
  ['Navy', '#1B2A55'],
  ['Jamun', '#7B2CBF'],
  ['Maroon', '#7A1F33'],
  ['Brown', '#6B4226'],
  ['Beige', '#E4D1AE'],
  ['Moti', '#FFF3DC'],
  ['White', '#FBFBF8'],
  ['Chandi', '#B4BBC9'],
  ['Grey', '#6E737C'],
  ['Kajal', '#18151D'],
];

/** TPAL in Lab */
export const TLAB: readonly Lab[] = TPAL.map(([, h]) => lab(...hexRgb(h)));

/** index into TPAL of the thread closest to a Lab colour */
export function nearestThread(l: ArrayLike<number>): number {
  let bi = 0,
    bd = 1e9;
  for (let i = 0; i < TLAB.length; i++) {
    const t = TLAB[i]!,
      d = (t[0] - l[0]!) ** 2 + (t[1] - l[1]!) ** 2 + (t[2] - l[2]!) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}

export type GarmentColour =
  | 'white'
  | 'natural'
  | 'kajal'
  | 'neel'
  | 'maroon'
  | 'bottle'
  | 'haldi'
  | 'gulaab'
  | 'chandi'
  | 'sky';

/** garment colours: [name, dye hex]. null = the photo as shot (no recolouring). */
export const GC: Readonly<Record<GarmentColour, readonly [name: string, hex: string | null]>> = {
  white: ['White', null],
  natural: ['Natural canvas', null],
  kajal: ['Kajal black', '#1d1b21'],
  neel: ['Neel navy', '#1f2a4f'],
  maroon: ['Maroon', '#6b1d2e'],
  bottle: ['Bottle green', '#1e4d3a'],
  haldi: ['Haldi yellow', '#dfa51c'],
  gulaab: ['Gulaab pink', '#f2a0bd'],
  chandi: ['Chandi grey', '#9ba1a9'],
  sky: ['Sky blue', '#a9cfec'],
};

export const GARMENT_COLOURS = Object.keys(GC) as GarmentColour[];
