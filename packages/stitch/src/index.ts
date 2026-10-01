/* @store/stitch — turns a logo, motif or name into thread colours and renders it embroidered onto real
   garment photos. Importing this module has no side effects and never touches the DOM (SSR-safe);
   the engine's drawing methods need a browser. */
export type * from './types';

export { createStitchEngine } from './engine';
export type { SceneSpec, StitchEngine, StitchEngineOptions } from './engine';

/* garments + colours */
export { GARMENTS, GARMENT_VIEWS } from './garments';
export { TH, THREADS, TNAME, TPAL, TLAB, GC, GARMENT_COLOURS, col, isThreadKey, nearestThread } from './threads';

/* motifs, fonts, sample logos */
export {
  MOTIFS,
  MOTIF_KEYS,
  PAISLEY,
  HEART,
  PAISLEY_POINTS,
  STITCH_FILTER_DEFS,
  knot,
  run,
  chain,
  leaf,
  petal,
  star,
  inner,
  grp,
  sample,
  samplePathPure,
} from './motifs';
export type { Motif, MotifParts } from './motifs';
export { FONTS, FONT_KEYS, FONT_PROBES, GOOGLE_FONTS_CSS, fontStr, fontsLoaded, isFontKey } from './fonts';
export type { FontDef } from './fonts';
export { SAMPLE_NAMES, SAMPLE_KINDS, sampleLogo } from './samples';
export type { SampleKind } from './samples';
export { MOTIF_PX, motifSvg, motifColours, trimCanvas } from './design';

/* the pure pipeline (no DOM): useful for tests, workers and the design studio */
export { clamp, hexRgb, lin, lab, relLum, shade, f, esc } from './colour';
export { ANG, DISP, LIGHT, OUT_W, OUT_H, MAX_DESIGN_PX } from './constants';
export { boxBlur, bl, blz, chamfer, smoothIdx, borderMedian } from './image';
export { prepareGarment, garmentFringe, recolourGarment } from './garment';
export type { GarmentPixels } from './garment';
export {
  NO_DESIGN_ERROR,
  isAnalyseError,
  kmeans,
  analysePixels,
  analyseKnownPixels,
  finalize,
  setTcol,
} from './analyse';
export type { KMeansResult } from './analyse';
export { sceneGeometry, placementsOf, fitSize, destBox, closeView, stitchPixels, stitchCount } from './render';
export type { RenderView, SceneGeometry } from './render';
export { pixels } from './dom';
