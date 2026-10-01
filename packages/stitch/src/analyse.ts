/* ---------- preparing a design: background, thread colours, stitch map (pure, no DOM) ---------- */
import { clamp, hexRgb, lab } from './colour';
import { ANG } from './constants';
import { borderMedian, boxBlur, chamfer, smoothIdx } from './image';
import { TLAB, TPAL, nearestThread } from './threads';
import type { AnalyseError, AnalyseOptions, Lab, PixelData, PreparedDesign, Rgb } from './types';

export const NO_DESIGN_ERROR =
  'We couldn’t find a design in this image. Try a logo on a plain or transparent background.';

export const isAnalyseError = (r: PreparedDesign | AnalyseError): r is AnalyseError => 'err' in r;

type Vec3 = [number, number, number];

export interface KMeansResult {
  /** cluster centres */
  c: Vec3[];
  /** sum of squared distances to the centres */
  sse: number;
}

/** k-means in Lab, seeded deterministically (middle sample, then farthest-point), 12 iterations */
export function kmeans(S: readonly Vec3[], k: number): KMeansResult {
  const n = S.length,
    C: Vec3[] = [S[n >> 1]!.slice() as Vec3],
    D = new Float64Array(n).fill(1e18);
  while (C.length < k) {
    const c = C[C.length - 1]!;
    let far = 0,
      fd = -1;
    for (let i = 0; i < n; i++) {
      const s = S[i]!,
        dd = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
      if (dd < D[i]!) D[i] = dd;
      if (D[i]! > fd) {
        fd = D[i]!;
        far = i;
      }
    }
    C.push(S[far]!.slice() as Vec3);
  }
  let sse = 0;
  for (let it = 0; it < 12; it++) {
    const sum = C.map(() => [0, 0, 0, 0] as [number, number, number, number]);
    sse = 0;
    for (let i = 0; i < n; i++) {
      const s = S[i]!;
      let bi = 0,
        bd = 1e18;
      for (let c = 0; c < k; c++) {
        const q = C[c]!,
          dd = (q[0] - s[0]) ** 2 + (q[1] - s[1]) ** 2 + (q[2] - s[2]) ** 2;
        if (dd < bd) {
          bd = dd;
          bi = c;
        }
      }
      sse += bd;
      const t = sum[bi]!;
      t[0] += s[0];
      t[1] += s[1];
      t[2] += s[2];
      t[3]++;
    }
    for (let c = 0; c < k; c++) {
      const t = sum[c]!;
      if (t[3]) C[c] = [t[0] / t[3], t[1] / t[3], t[2] / t[3]];
    }
  }
  return { c: C, sse };
}

/** the fields analyse / analyseKnown fill in; finalize + setTcol derive the rest */
type DesignCore = Pick<
  PreparedDesign,
  | 'w'
  | 'h'
  | 'k'
  | 'idx0'
  | 'threads'
  | 'count0'
  | 'drop'
  | 'autoDrop'
  | 'photoLike'
  | 'hasAlpha'
  | 'removed'
  | 'srcW'
  | 'srcH'
>;

function prepared(core: DesignCore): PreparedDesign {
  const D = core as PreparedDesign;
  finalize(D);
  setTcol(D);
  return D;
}

/**
 * Any image (an uploaded logo): remove the background, cluster colours, match threads.
 * Returns the prepared design (D.k is the colour count used) or {err}.
 */
export function analysePixels(px: PixelData, opts: AnalyseOptions): PreparedDesign | AnalyseError {
  const { d, w, h, sw, sh } = px,
    N = w * h;
  const A = new Uint8Array(N);
  let soft = 0;
  for (let i = 0; i < N; i++) {
    const al = d[i * 4 + 3]!;
    A[i] = al >= 128 ? 1 : 0;
    if (al < 200) soft++;
  }
  const hasAlpha = soft > N * 0.01;
  let removed = 0,
    bgLab: Lab | null = null;
  if (!hasAlpha && opts.bgOn) {
    const bg = borderMedian(d, w, h);
    bgLab = lab(bg[0], bg[1], bg[2]);
    const tol = 46 * 46,
      dist = (i: number) => {
        const j = i * 4,
          a = d[j]! - bg[0],
          b = d[j + 1]! - bg[1],
          e = d[j + 2]! - bg[2];
        return a * a + b * b + e * e;
      };
    const q = new Int32Array(N);
    let qh = 0,
      qt = 0;
    const push = (i: number) => {
      if (A[i] && dist(i) < tol) {
        A[i] = 0;
        q[qt++] = i;
        removed++;
      }
    };
    for (let X = 0; X < w; X++) {
      push(X);
      push((h - 1) * w + X);
    }
    for (let Y = 0; Y < h; Y++) {
      push(Y * w);
      push(Y * w + w - 1);
    }
    while (qh < qt) {
      const i = q[qh++]!,
        X = i % w,
        Y = (i / w) | 0;
      if (X > 0) push(i - 1);
      if (X < w - 1) push(i + 1);
      if (Y > 0) push(i - w);
      if (Y < h - 1) push(i + w);
    }
    if (removed) {
      /* also peel the anti-aliased halo where it is close to the background */
      const B = A.slice();
      for (let i = 0; i < N; i++) {
        if (!A[i]) continue;
        const X = i % w,
          Y = (i / w) | 0;
        if (
          ((X > 0 && !A[i - 1]) ||
            (X < w - 1 && !A[i + 1]) ||
            (Y > 0 && !A[i - w]) ||
            (Y < h - 1 && !A[i + w])) &&
          dist(i) < tol * 5
        )
          B[i] = 0;
      }
      A.set(B);
    }
  }
  let opaque = 0;
  for (let i = 0; i < N; i++) opaque += A[i]!;
  if (opaque < N * 0.004) return { err: NO_DESIGN_ERROR };
  const LAB = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    if (!A[i]) continue;
    const l = lab(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!);
    LAB[i * 3] = l[0];
    LAB[i * 3 + 1] = l[1];
    LAB[i * 3 + 2] = l[2];
  }
  const edge = (i: number) => {
    const X = i % w,
      Y = (i / w) | 0;
    return (
      (X > 0 && !A[i - 1]) || (X < w - 1 && !A[i + 1]) || (Y > 0 && !A[i - w]) || (Y < h - 1 && !A[i + w])
    );
  };
  const S: Vec3[] = [],
    step = Math.max(1, Math.floor(opaque / 14000));
  let cnt = 0;
  for (let i = 0; i < N; i++) {
    if (!A[i] || edge(i)) continue;
    if (cnt++ % step === 0) S.push([LAB[i * 3]!, LAB[i * 3 + 1]!, LAB[i * 3 + 2]!]);
  }
  if (S.length < 24)
    for (let i = 0; i < N; i++) if (A[i]) S.push([LAB[i * 3]!, LAB[i * 3 + 1]!, LAB[i * 3 + 2]!]);
  const runs: KMeansResult[] = [];
  for (let k = 1; k <= 6; k++) runs.push(kmeans(S, k));
  let k = clamp(opts.k || 4, 1, 6);
  if (opts.auto) {
    k = 6;
    for (let t = 1; t <= 6; t++)
      if (runs[t - 1]!.sse <= runs[0]!.sse * 0.045 + S.length * 6) {
        k = t;
        break;
      }
  }
  const run = runs[k - 1]!,
    tIdx = run.c.map((c) => nearestThread(c)),
    threads = [...new Set(tIdx)],
    remap = tIdx.map((t) => threads.indexOf(t));
  const idx = new Uint8Array(N).fill(255),
    msum = threads.map(() => [0, 0, 0, 0] as [number, number, number, number]);
  for (let i = 0; i < N; i++) {
    if (!A[i]) continue;
    const L0 = LAB[i * 3]!,
      a0 = LAB[i * 3 + 1]!,
      b0 = LAB[i * 3 + 2]!;
    let bi = 0,
      bd = 1e18;
    for (let cc = 0; cc < k; cc++) {
      const q = run.c[cc]!,
        dd = (q[0] - L0) ** 2 + (q[1] - a0) ** 2 + (q[2] - b0) ** 2;
      if (dd < bd) {
        bd = dd;
        bi = cc;
      }
    }
    const t = remap[bi]!;
    idx[i] = t;
    const m = msum[t]!;
    m[0] += L0;
    m[1] += a0;
    m[2] += b0;
    m[3]++;
  }
  const idx2 = smoothIdx(idx, w, h);
  const count0: number[] = new Array<number>(threads.length).fill(0);
  for (let i = 0; i < N; i++) if (idx2[i] !== 255) count0[idx2[i]!]!++;
  const tot = count0.reduce((p, q) => p + q, 0) || 1,
    drop = new Set<number>();
  if (bgLab && removed) {
    const bgT = nearestThread(bgLab),
      bL = bgLab;
    msum.forEach((m, t) => {
      if (!m[3]) return;
      const dE = Math.sqrt(
        (m[0] / m[3] - bL[0]) ** 2 + (m[1] / m[3] - bL[1]) ** 2 + (m[2] / m[3] - bL[2]) ** 2,
      );
      if ((dE < 18 || threads[t] === bgT) && count0[t]! / tot < 0.15 && threads.length > 1) drop.add(t);
    });
  }
  return prepared({
    w,
    h,
    k,
    idx0: idx2,
    threads,
    count0,
    drop,
    autoDrop: drop.size > 0,
    photoLike: runs[5]!.sse > runs[0]!.sse * 0.12,
    hasAlpha,
    removed: removed > N * 0.02,
    srcW: sw,
    srcH: sh,
  });
}

/** a design we drew ourselves (motif / name): the thread colours are known, so no clustering is needed */
export function analyseKnownPixels(px: PixelData, palette: readonly string[]): PreparedDesign {
  const { d, w, h, sw, sh } = px,
    N = w * h,
    P = palette.map(hexRgb);
  let tIdx = palette.map((hx) => nearestThread(lab(...hexRgb(hx)))),
    uniq = [...new Set(tIdx)];
  /* at most 6 threads: merge the two closest until it fits */
  while (uniq.length > 6) {
    let best: [number, number] = [0, 1],
      bd = 1e18;
    for (let i = 0; i < uniq.length; i++)
      for (let j = i + 1; j < uniq.length; j++) {
        const a = TLAB[uniq[i]!]!,
          b = TLAB[uniq[j]!]!,
          dd = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
        if (dd < bd) {
          bd = dd;
          best = [i, j];
        }
      }
    const keep = uniq[best[0]]!,
      gone = uniq[best[1]]!;
    tIdx = tIdx.map((t) => (t === gone ? keep : t));
    uniq = [...new Set(tIdx)];
  }
  const threads = uniq,
    remap = tIdx.map((t) => threads.indexOf(t));
  const idx = new Uint8Array(N).fill(255);
  for (let i = 0; i < N; i++) {
    if (d[i * 4 + 3]! < 128) continue;
    const r = d[i * 4]!,
      g = d[i * 4 + 1]!,
      b = d[i * 4 + 2]!;
    let bi = 0,
      bd = 1e9;
    for (let p = 0; p < P.length; p++) {
      const q = P[p]!,
        dd = (q[0] - r) ** 2 + (q[1] - g) ** 2 + (q[2] - b) ** 2;
      if (dd < bd) {
        bd = dd;
        bi = p;
      }
    }
    idx[i] = remap[bi]!;
  }
  const idx2 = smoothIdx(idx, w, h),
    count0: number[] = new Array<number>(threads.length).fill(0);
  for (let i = 0; i < N; i++) if (idx2[i] !== 255) count0[idx2[i]!]!++;
  return prepared({
    w,
    h,
    k: threads.length,
    idx0: idx2,
    threads,
    count0,
    drop: new Set<number>(),
    autoDrop: false,
    photoLike: false,
    hasAlpha: true,
    removed: false,
    srcW: sw,
    srcH: sh,
  });
}

/** derive the stitch maps from idx0 + drop: idx, near, cov, as (blurred coverage), dist (chamfer) */
export function finalize(D: PreparedDesign): void {
  const w = D.w,
    h = D.h,
    N = w * h,
    idx = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const v = D.idx0[i]!;
    idx[i] = v === 255 || D.drop.has(v) ? 255 : v;
  }
  let op = 0;
  const al = new Float32Array(N);
  for (let i = 0; i < N; i++)
    if (idx[i] !== 255) {
      op++;
      al[i] = 1;
    }
  const near = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (idx[i] !== 255) {
      near[i] = idx[i]!;
      continue;
    }
    const X = i % w,
      Y = (i / w) | 0;
    let v = 0,
      f = false;
    for (let dy = -1; dy <= 1 && !f; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const XX = X + dx,
          YY = Y + dy;
        if (XX < 0 || YY < 0 || XX >= w || YY >= h) continue;
        const t = idx[YY * w + XX]!;
        if (t !== 255) {
          v = t;
          f = true;
          break;
        }
      }
    near[i] = v;
  }
  D.idx = idx;
  D.near = near;
  D.cov = op / N;
  D.as = boxBlur(al, w, h, 1);
  D.dist = chamfer(idx, w, h);
}

/** thread colours (0–1 RGB) and satin angles for the current D.threads */
export function setTcol(D: PreparedDesign): void {
  D.tcol = D.threads.map((t): Rgb => {
    const c = hexRgb(TPAL[t]![1]);
    return [c[0] / 255, c[1] / 255, c[2] / 255];
  });
  D.ang = D.threads.map((_, i) => ANG[i % ANG.length]!);
}
