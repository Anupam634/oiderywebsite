import type { FontKey } from './fonts';
import type { GarmentView, PlacementKey } from './garments';
import type { MotifKey } from './motifs';
import type { GarmentColour, ThreadKey } from './threads';

export type { FontKey } from './fonts';
export type { GarmentView, GarmentPlacements, PlacementKey } from './garments';
export type { MotifKey } from './motifs';
export type { GarmentColour, ThreadKey } from './threads';

export type Rgb = [r: number, g: number, b: number];
export type Lab = [L: number, a: number, b: number];
/** a colour written as '#rrggbb' */
export type HexColour = `#${string}`;
/** a thread from TH by key ('rani') or any '#rrggbb' colour */
export type ThreadColour = ThreadKey | HexColour;

/** a print area on a garment photo: centre in photo px, sizes in cm */
export interface Placement {
  /** label, e.g. 'Left chest' */
  n: string;
  x: number;
  y: number;
  /** smallest / largest / default design width in cm */
  min: number;
  max: number;
  d: number;
}

/** one garment photo (see garments.ts; the image and mask are served from `${assetBase}${view}.jpg|-mask.png`) */
export interface GarmentManifest {
  /** photo size in px (all views are 900 × 1125) */
  w: number;
  h: number;
  /** average fabric brightness inside the mask, used to recolour and to shade stitches */
  ref: number;
  /** photo px per cm at the print areas */
  pxcm: number;
  /** fabric rotation (degrees) and cylindrical bend (radians, caps) at the print area */
  rot: number;
  curve: number;
  place: Partial<Record<PlacementKey, Placement>>;
  /** photo credit (Unsplash URL) */
  credit: string;
}

/**
 * A design ready to stitch (the prototype's `D`): a thread index per pixel plus the maps the renderer needs.
 * Built by `analyse` (uploaded logo) or `analyseKnown` (motif / name). After changing `threads` or `drop`,
 * call `finalize(D)` and `setTcol(D)` again, like the design studio does.
 */
export interface PreparedDesign {
  /** stitch-map size in px (the source scaled to fit 440 px, at least 16) */
  w: number;
  h: number;
  /** colours used (clusters for an upload, threads for a known design) */
  k: number;
  /** smoothed thread slot per pixel, 255 = no stitches; before `drop` is applied */
  idx0: Uint8Array;
  /** TPAL index of each thread slot */
  threads: number[];
  /** pixels per thread slot in idx0 */
  count0: number[];
  /** thread slots that are not stitched (the fabric shows through) */
  drop: Set<number>;
  /** a slot was dropped automatically because it matched the removed background */
  autoDrop: boolean;
  /** the image has photo-like shading (many colours were simplified) */
  photoLike: boolean;
  /** the source had its own transparency */
  hasAlpha: boolean;
  /** more than 2% of the image was removed as background */
  removed: boolean;
  /** source image size in px */
  srcW: number;
  srcH: number;
  /* ---- set by finalize() ---- */
  /** thread slot per pixel after drops, 255 = empty */
  idx: Uint8Array;
  /** nearest stitched slot for empty pixels (used at anti-aliased edges) */
  near: Uint8Array;
  /** share of pixels with stitches (0–1) */
  cov: number;
  /** stitch coverage, box-blurred (radius 1) */
  as: Float32Array;
  /** chamfer distance (px) to the nearest edge between thread areas */
  dist: Float32Array;
  /* ---- set by setTcol() ---- */
  /** thread colours as 0–1 RGB */
  tcol: Rgb[];
  /** satin stitch angle per slot (radians) */
  ang: number[];
}

/** analyse() result when no design could be found */
export interface AnalyseError {
  err: string;
}

/** options for analysing an uploaded image */
export interface AnalyseOptions {
  /** remove a plain background (flood fill from the border) */
  bgOn?: boolean;
  /** number of thread colours, 1–6 (default 4) */
  k?: number;
  /** pick the colour count automatically (overrides k) */
  auto?: boolean;
}

/** a motif and/or a name drawn in code (product page personalisation, studio "make" mode) */
export interface DesignSpec {
  motif?: MotifKey | 'none' | null;
  /** motif colours: 3 thread keys or hex colours (phoolwari takes an optional 4th, the small rose) */
  mcols?: readonly string[];
  text?: string;
  font?: FontKey;
  /** thread colour for the name: a thread key or hex colour (required when there is text) */
  tcol?: string;
  /** largest width of the name in px (the motif is 620 px wide) */
  maxW?: number;
}

/** designFrom() result: the trimmed drawing and the exact colours used in it */
export interface DesignImage {
  canvas: HTMLCanvasElement;
  palette: string[];
}

/**
 * What to render: which photo, garment colour, placement, design width in cm,
 * drag offset in photo px, and the prepared design (null = the plain garment).
 */
export interface Scene {
  view: GarmentView;
  col: GarmentColour;
  place: PlacementKey;
  /** design width in cm */
  size: number;
  /** drag offset in photo px */
  off: readonly [number, number];
  D: PreparedDesign | null;
}

/** 'front' draws the whole photo; 'close' crops in around the design */
export type RenderMode = 'front' | 'close';

/** any image a design can be read from */
export type DesignSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

/** RGBA pixels of a design source, scaled for analysis */
export interface PixelData {
  d: Uint8ClampedArray | Uint8Array;
  w: number;
  h: number;
  /** source size before scaling */
  sw: number;
  sh: number;
}

/** something with RGBA `data`, like ImageData */
export interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
