/* ================= stitch engine: your design embroidered onto real garment photos =================
   createStitchEngine() is safe to call anywhere (SSR included): it only sets up caches. Every method
   that draws needs a browser and is meant for client components. Garment photos + masks are fetched
   from `${assetBase}${view}.jpg` and `${assetBase}${view}-mask.png`, decoded once per view and cached. */
import { analyseKnownPixels, analysePixels } from './analyse';
import { clamp } from './colour';
import { OUT_H, OUT_W } from './constants';
import { drawDesign } from './design';
import { createCanvas, ctx2d, hasDom, loadImage, pixels } from './dom';
import { FONT_PROBES, FONTS, FONT_KEYS, fontStr, fontsLoaded, type FontKey } from './fonts';
import { prepareGarment, recolourGarment, type GarmentPixels } from './garment';
import { GARMENTS, type GarmentView, type PlacementKey } from './garments';
import { destBox, fitSize, sceneGeometry, stitchCount, stitchPixels, type RenderView } from './render';
import { GC, type GarmentColour } from './threads';
import type {
  AnalyseError,
  AnalyseOptions,
  DesignImage,
  DesignSource,
  DesignSpec,
  PreparedDesign,
  RenderMode,
  Scene,
} from './types';

export interface StitchEngineOptions {
  /** where the garment photos live: `${assetBase}${view}.jpg` + `${assetBase}${view}-mask.png` (default '/mockups/') */
  assetBase?: string;
  /** crossOrigin for the garment images (default 'anonymous'; null = don't set it) */
  crossOrigin?: string | null;
  /**
   * Font families for names, if the app loads the fonts under other names (e.g. next/font's
   * `pacifico.style.fontFamily`). Must be the same typefaces, or previews won't match production.
   */
  fontFamilies?: Partial<Record<FontKey, string>>;
  /** fontsLoaded() gives up waiting after this long (default 2500 ms) */
  fontTimeoutMs?: number;
}

/** product-page style scene description, see buildScene() */
export interface SceneSpec {
  view: GarmentView;
  col: GarmentColour;
  place: PlacementKey;
  /** fit the design in [max width, max height] cm (product page) */
  box?: readonly [number, number];
  /** or: a fixed width in cm (default: the placement's default width) */
  size?: number;
  /** motif and/or name; omit or leave both empty for the plain garment */
  design?: DesignSpec | null;
  off?: readonly [number, number];
}

export interface StitchEngine {
  readonly assetBase: string;
  /** URLs of a view's photo and mask */
  garmentUrls(view: GarmentView): { photo: string; mask: string };
  /** load + decode a garment photo and mask (cached per view); render methods need this first */
  garmentReady(view: GarmentView): Promise<void>;
  isGarmentReady(view: GarmentView): boolean;
  /** the garment photo dyed in a garment colour (900 × 1125; the last colour per view is cached) */
  baseFor(view: GarmentView, colour: GarmentColour): HTMLCanvasElement;
  /** an uploaded image: remove the background, cluster colours, match threads (default opts {bgOn, k: 4, auto}) */
  analyse(source: DesignSource, opts?: AnalyseOptions): PreparedDesign | AnalyseError;
  /** a design drawn in known colours (designFrom output) */
  analyseKnown(source: DesignSource, palette: readonly string[]): PreparedDesign;
  /** draw a motif + name; returns the image and its exact colours */
  designFrom(spec: DesignSpec): Promise<DesignImage>;
  /** designFrom + analyseKnown; null when the spec has neither motif nor name */
  prepare(spec: DesignSpec): Promise<PreparedDesign | null>;
  /** the product page's live scene: loads the garment, prepares the design, fits it in `box` */
  buildScene(spec: SceneSpec): Promise<Scene>;
  /** draw the scene into a 900 × 1125 context ('close' crops in: crop width = ck × design width, default 2.4) */
  renderTo(scene: Scene, ctx: CanvasRenderingContext2D, mode?: RenderMode, ck?: number): void;
  /** render to a new canvas: 900 × 1125, or `width` × width·1.25 when width is given */
  snapshot(scene: Scene, mode?: RenderMode, width?: number, ck?: number): HTMLCanvasElement;
  /** estimated stitches (rounded to 100) */
  stitchCount(scene: Scene): number;
  /** wait for the name + sample-logo fonts (gives up after fontTimeoutMs) */
  fontsLoaded(): Promise<void>;
  /** canvas font string for a name font, with the engine's family overrides */
  fontStr(font: FontKey, px: number): string;
}

interface GarmentEntry {
  promise: Promise<void>;
  data: GarmentPixels | null;
  base: HTMLCanvasElement | null;
  baseCol: GarmentColour | null;
}

const DEFAULT_ANALYSE: AnalyseOptions = { bgOn: true, k: 4, auto: true };

export function createStitchEngine(options: StitchEngineOptions = {}): StitchEngine {
  const base0 = options.assetBase ?? '/mockups/',
    assetBase = base0.endsWith('/') ? base0 : base0 + '/',
    crossOrigin = options.crossOrigin === undefined ? 'anonymous' : options.crossOrigin,
    families = { ...options.fontFamilies },
    fontTimeoutMs = options.fontTimeoutMs ?? 2500,
    cache = new Map<GarmentView, GarmentEntry>();

  /* fontsLoaded() waits for the overridden families too */
  const probes = [
    ...FONT_PROBES,
    ...FONT_KEYS.filter((k) => families[k] && families[k] !== FONTS[k].fam).map((k) =>
      fontStr(k, 120, families[k]),
    ),
  ];

  const garmentUrls = (view: GarmentView) => ({
    photo: `${assetBase}${view}.jpg`,
    mask: `${assetBase}${view}-mask.png`,
  });

  function garmentReady(view: GarmentView): Promise<void> {
    const hit = cache.get(view);
    if (hit) return hit.promise;
    const a = GARMENTS[view];
    if (!a) return Promise.reject(new Error(`@store/stitch: unknown garment view "${String(view)}"`));
    if (!hasDom())
      return Promise.reject(new Error('@store/stitch: garment photos can only be loaded in a browser'));
    const e: GarmentEntry = { promise: Promise.resolve(), data: null, base: null, baseCol: null },
      u = garmentUrls(view);
    e.promise = Promise.all([loadImage(u.photo, crossOrigin), loadImage(u.mask, crossOrigin)]).then(
      ([im, mk]) => {
        const W = a.w,
          H = a.h,
          c = createCanvas(W, H),
          x = ctx2d(c, { willReadFrequently: true });
        x.drawImage(im, 0, 0, W, H);
        const pd = x.getImageData(0, 0, W, H).data;
        x.clearRect(0, 0, W, H);
        x.drawImage(mk, 0, 0, W, H);
        const md = x.getImageData(0, 0, W, H).data;
        e.data = prepareGarment(pd, md, W, H);
      },
      (err: unknown) => {
        cache.delete(view); // let a later call retry
        throw err;
      },
    );
    cache.set(view, e);
    return e.promise;
  }

  function need(view: GarmentView): GarmentEntry & { data: GarmentPixels } {
    const e = cache.get(view);
    if (!e || !e.data)
      throw new Error(
        `@store/stitch: garment "${String(view)}" is not loaded yet; await engine.garmentReady(view) first`,
      );
    return e as GarmentEntry & { data: GarmentPixels };
  }

  function baseFor(view: GarmentView, colour: GarmentColour): HTMLCanvasElement {
    const o = need(view);
    if (o.base && o.baseCol === colour) return o.base;
    const gc = GC[colour];
    if (!gc) throw new Error(`@store/stitch: unknown garment colour "${String(colour)}"`);
    const a = GARMENTS[view],
      W = a.w,
      H = a.h,
      c = o.base || createCanvas();
    c.width = W;
    c.height = H;
    const x = ctx2d(c),
      img = x.createImageData(W, H);
    recolourGarment(o.data, a.ref, gc[1], img.data);
    x.putImageData(img, 0, 0);
    o.base = c;
    o.baseCol = colour;
    return c;
  }

  function renderTo(S: Scene, c: CanvasRenderingContext2D, mode: RenderMode = 'front', ck?: number): void {
    const G = need(S.view).data,
      g = sceneGeometry(S),
      a = g.a,
      base = baseFor(S.view, S.col);
    let view: RenderView;
    if (mode === 'close') {
      const cw = clamp(g.wpx * (ck || 2.4), 170, a.w),
        ch = cw * 1.25,
        sx = clamp(g.cx - cw / 2, 0, a.w - cw),
        sy = clamp(g.cy - ch / 2, 0, a.h - ch);
      view = { sx, sy, S: OUT_W / cw };
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(base, sx, sy, cw, ch, 0, 0, OUT_W, OUT_H);
    } else {
      view = { sx: 0, sy: 0, S: 1 };
      c.drawImage(base, 0, 0);
    }
    if (S.D) {
      const b = destBox(S, view);
      if (b) {
        const img = c.getImageData(b.x, b.y, b.w, b.h);
        stitchPixels(S, G, img, b.x, b.y, view);
        c.putImageData(img, b.x, b.y);
      }
    }
  }

  function snapshot(S: Scene, mode: RenderMode = 'front', w?: number, ck?: number): HTMLCanvasElement {
    const off = createCanvas(OUT_W, OUT_H);
    renderTo(S, ctx2d(off, { willReadFrequently: true }), mode, ck);
    if (!w) return off;
    const t = createCanvas(w, Math.round(w * 1.25)),
      tx = ctx2d(t);
    tx.imageSmoothingQuality = 'high';
    tx.drawImage(off, 0, 0, t.width, t.height);
    return t;
  }

  const analyse = (src: DesignSource, opts: AnalyseOptions = DEFAULT_ANALYSE) =>
    analysePixels(pixels(src), opts);
  const analyseKnown = (src: DesignSource, palette: readonly string[]) =>
    analyseKnownPixels(pixels(src), palette);
  const designFrom = (spec: DesignSpec) => drawDesign(spec, families);
  const hasDesign = (spec: DesignSpec | null | undefined): spec is DesignSpec =>
    !!spec && ((!!spec.motif && spec.motif !== 'none') || !!(spec.text || '').trim());

  async function prepare(spec: DesignSpec): Promise<PreparedDesign | null> {
    if (!hasDesign(spec)) return null;
    const r = await designFrom(spec);
    return analyseKnown(r.canvas, r.palette);
  }

  async function buildScene(spec: SceneSpec): Promise<Scene> {
    if (hasDesign(spec.design) && spec.design.text) await engine.fontsLoaded();
    const [, D] = await Promise.all([garmentReady(spec.view), spec.design ? prepare(spec.design) : null]);
    const dflt = GARMENTS[spec.view].place[spec.place] ?? Object.values(GARMENTS[spec.view].place)[0]!;
    const size = spec.box ? fitSize(spec.box, D) : (spec.size ?? dflt.d);
    return { view: spec.view, col: spec.col, place: spec.place, size, off: spec.off ?? [0, 0], D };
  }

  const engine: StitchEngine = {
    assetBase,
    garmentUrls,
    garmentReady,
    isGarmentReady: (view) => !!cache.get(view)?.data,
    baseFor,
    analyse,
    analyseKnown,
    designFrom,
    prepare,
    buildScene,
    renderTo,
    snapshot,
    stitchCount,
    fontsLoaded: () => fontsLoaded(probes, fontTimeoutMs),
    fontStr: (font, px) => fontStr(font, px, families[font] ?? FONTS[font].fam),
  };
  return engine;
}
