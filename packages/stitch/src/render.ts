/* ---------- compositing: satin stitches onto the photo (pure, no DOM) ---------- */
import { clamp } from './colour';
import { DISP, LIGHT, OUT_H, OUT_W } from './constants';
import type { GarmentPixels } from './garment';
import { GARMENTS, type GarmentView, type PlacementKey } from './garments';
import { bl, blz } from './image';
import type { GarmentManifest, ImageDataLike, Placement, PreparedDesign, Scene } from './types';

/** which part of the photo the output canvas shows: output px = (photo px - s) * S */
export interface RenderView {
  sx: number;
  sy: number;
  S: number;
}

export interface SceneGeometry {
  a: GarmentManifest;
  P: Placement;
  /** design size in photo px */
  wpx: number;
  hpx: number;
  /** design centre in photo px (placement + drag offset) */
  cx: number;
  cy: number;
}

/** where the design sits on the photo (an unknown placement falls back to the view's first one) */
export function sceneGeometry(S: Scene): SceneGeometry {
  const a = GARMENTS[S.view],
    P = a.place[S.place] || Object.values(a.place)[0]!,
    D = S.D,
    wpx = S.size * a.pxcm,
    hpx = D ? (wpx * D.h) / D.w : wpx;
  return { a, P, wpx, hpx, cx: P.x + S.off[0], cy: P.y + S.off[1] };
}

/** placement keys of a garment view, in order (the first is the default) */
export const placementsOf = (view: GarmentView): PlacementKey[] =>
  Object.keys(GARMENTS[view].place) as PlacementKey[];

/** the product page's sizing: as wide as box[0] cm but no taller than box[1] cm */
export const fitSize = (box: readonly [number, number], D: PreparedDesign | null): number =>
  D ? Math.min(box[0], (box[1] * D.w) / D.h) : box[0];

/** output-canvas rectangle the stitches can touch (null if off-canvas) */
export function destBox(S: Scene, view: RenderView): { x: number; y: number; w: number; h: number } | null {
  const g = sceneGeometry(S),
    R = Math.hypot(g.wpx, g.hpx) * 0.62 + 12;
  const x0 = Math.max(0, Math.floor((g.cx - R - view.sx) * view.S)),
    y0 = Math.max(0, Math.floor((g.cy - R - view.sy) * view.S)),
    x1 = Math.min(OUT_W, Math.ceil((g.cx + R - view.sx) * view.S)),
    y1 = Math.min(OUT_H, Math.ceil((g.cy + R - view.sy) * view.S));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** the view for 'close' mode: crop width = ck × design width (default 2.4), at least 170 px, 4:5 */
export function closeView(S: Scene, ck?: number): RenderView & { cw: number; ch: number } {
  const g = sceneGeometry(S),
    a = g.a;
  const cw = clamp(g.wpx * (ck || 2.4), 170, a.w),
    ch = cw * 1.25,
    sx = clamp(g.cx - cw / 2, 0, a.w - cw),
    sy = clamp(g.cy - ch / 2, 0, a.h - ch);
  return { sx, sy, S: OUT_W / cw, cw, ch };
}

/**
 * Stitch the scene's design into `img` (output pixels already showing the garment), whose top-left
 * is at (X0, Y0) on the output canvas. Satin ridges follow each thread's angle, the stitches bend
 * over fabric folds, pick up the fabric's light, and cast a soft shadow.
 */
export function stitchPixels(
  Sc: Scene,
  G: GarmentPixels,
  img: ImageDataLike,
  X0: number,
  Y0: number,
  view: RenderView,
): void {
  const D = Sc.D;
  if (!D) return;
  const g = sceneGeometry(Sc),
    a = g.a,
    W = a.w,
    H = a.h,
    wcm = Sc.size,
    hcm = (wcm * D.h) / D.w;
  const rot = ((a.rot || 0) * Math.PI) / 180,
    cr = Math.cos(rot),
    sr = Math.sin(rot),
    curve = a.curve || 0,
    sc = Math.sin(curve),
    S = view.S;
  const foot = 1 / (a.pxcm * S),
    amp = clamp(1.5 - foot / 0.03, 0, 1),
    per = 0.045,
    cmPx = wcm / D.w,
    sdx = 0.05 / cmPx,
    sdy = 0.1 / cmPx;
  const cosA = D.ang.map((t) => Math.cos(t)),
    sinA = D.ang.map((t) => Math.sin(t)),
    sheen = D.ang.map((t) => 0.9 + 0.12 * Math.cos(2 * (t - LIGHT)));
  const d = img.data,
    IW = img.width,
    IH = img.height,
    hw = g.wpx / 2,
    hh = g.hpx / 2;
  const blur = G.blur,
    lum = G.lum,
    as = D.as,
    dmap = D.dist,
    idx = D.idx,
    near = D.near,
    tcol = D.tcol;
  for (let y = 0; y < IH; y++) {
    const gy = view.sy + (Y0 + y + 0.5) / S;
    for (let x = 0; x < IW; x++) {
      const gx = view.sx + (X0 + x + 0.5) / S;
      const lx = bl(blur, W, H, gx + 2, gy) - bl(blur, W, H, gx - 2, gy),
        ly = bl(blur, W, H, gx, gy + 2) - bl(blur, W, H, gx, gy - 2);
      const ux = gx - g.cx - lx * DISP,
        uy = gy - g.cy - ly * DISP;
      let u = (cr * ux + sr * uy) / hw,
        v = (-sr * ux + cr * uy) / hh;
      if (curve) {
        const t = u * sc;
        if (t <= -1 || t >= 1) continue;
        u = Math.asin(t) / curve;
        v -= (1 - Math.cos(u * curve)) * 0.16;
      }
      if (u < -1.2 || u > 1.2 || v < -1.2 || v > 1.2) continue;
      const du = (u + 1) * 0.5 * D.w - 0.5,
        dv = (v + 1) * 0.5 * D.h - 0.5,
        al = blz(as, D.w, D.h, du, dv),
        sh = blz(as, D.w, D.h, du - sdx, dv - sdy);
      if (al <= 0.004 && sh <= 0.004) continue;
      const j = (y * IW + x) * 4,
        Lf = bl(lum, W, H, gx, gy) / a.ref,
        fs = Lf < 0.4 ? 0.4 : Lf > 1.1 ? 1.1 : Lf,
        shd = 1 - 0.4 * sh * (1 - al);
      let r = d[j]! * shd,
        gg = d[j + 1]! * shd,
        b = d[j + 2]! * shd;
      if (al > 0.004) {
        const ii = clamp(Math.round(du), 0, D.w - 1) + clamp(Math.round(dv), 0, D.h - 1) * D.w;
        let c = idx[ii]!;
        if (c === 255) c = near[ii]!;
        const xc = u * wcm * 0.5,
          yc = v * hcm * 0.5,
          s = (xc * cosA[c]! + yc * sinA[c]!) / per,
          ridge = 0.5 - 0.5 * Math.cos(6.2832 * s);
        const dist = bl(dmap, D.w, D.h, du, dv) * cmPx,
          edge = dist < 0.1 ? 0.72 + 2.8 * dist : 1;
        const k = (1 + amp * 0.3 * (ridge - 0.5)) * sheen[c]! * edge * (0.52 + 0.5 * fs) * 1.05,
          t = tcol[c]!;
        r = r * (1 - al) + Math.min(255, t[0] * 255 * k) * al;
        gg = gg * (1 - al) + Math.min(255, t[1] * 255 * k) * al;
        b = b * (1 - al) + Math.min(255, t[2] * 255 * k) * al;
      }
      d[j] = r;
      d[j + 1] = gg;
      d[j + 2] = b;
    }
  }
}

/** estimated stitch count, rounded to 100 (for pricing) */
export const stitchCount = (S: Scene): number => {
  const D = S.D;
  if (!D) return 0;
  return Math.round((((S.size * S.size * D.h) / D.w) * D.cov * 165) / 100) * 100;
};
