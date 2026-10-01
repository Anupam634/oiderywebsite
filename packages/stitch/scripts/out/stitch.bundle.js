// src/colour.ts
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var hexRgb = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
];
var lin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
function lab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const t = (v) => v > 8856e-6 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  X = t(X);
  Y = t(Y);
  Z = t(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
var relLum = (hex) => {
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
function shade(hex, p) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  const t = p < 0 ? 0 : 255, a = Math.abs(p);
  r = Math.round((t - r) * a + r);
  g = Math.round((t - g) * a + g);
  b = Math.round((t - b) * a + b);
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}
var f = (n) => Math.round(n * 100) / 100;
var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

// src/constants.ts
var ANG = [35, -40, 80, -8, 58, -66].map((d) => d * Math.PI / 180);
var DISP = 22;
var LIGHT = -0.8;
var OUT_W = 900;
var OUT_H = 1125;
var MAX_DESIGN_PX = 440;

// src/image.ts
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[o + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s / n;
      s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}
function bl(a, w, h, x, y) {
  x = x < 0 ? 0 : x > w - 1.001 ? w - 1.001 : x;
  y = y < 0 ? 0 : y > h - 1.001 ? h - 1.001 : y;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + w] * (1 - fx) + a[i + w + 1] * fx) * fy;
}
function blz(a, w, h, x, y) {
  if (x < -1 || y < -1 || x > w || y > h) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, g = (X, Y) => X < 0 || Y < 0 || X >= w || Y >= h ? 0 : a[Y * w + X];
  return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
}
function chamfer(idx, w, h) {
  const N = w * h, D = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = idx[i];
    if (v === 255) {
      D[i] = 0;
      continue;
    }
    const X = i % w, Y = i / w | 0;
    D[i] = X === 0 || X === w - 1 || Y === 0 || Y === h - 1 || idx[i - 1] !== v || idx[i + 1] !== v || idx[i - w] !== v || idx[i + w] !== v ? 0.5 : 1e6;
  }
  for (let Y = 0; Y < h; Y++)
    for (let X = 0; X < w; X++) {
      const i = Y * w + X;
      let d = D[i];
      if (d <= 0.5) continue;
      if (X > 0) d = Math.min(d, D[i - 1] + 1);
      if (Y > 0) {
        d = Math.min(d, D[i - w] + 1);
        if (X > 0) d = Math.min(d, D[i - w - 1] + 1.414);
        if (X < w - 1) d = Math.min(d, D[i - w + 1] + 1.414);
      }
      D[i] = d;
    }
  for (let Y = h - 1; Y >= 0; Y--)
    for (let X = w - 1; X >= 0; X--) {
      const i = Y * w + X;
      let d = D[i];
      if (d <= 0.5) continue;
      if (X < w - 1) d = Math.min(d, D[i + 1] + 1);
      if (Y < h - 1) {
        d = Math.min(d, D[i + w] + 1);
        if (X < w - 1) d = Math.min(d, D[i + w + 1] + 1.414);
        if (X > 0) d = Math.min(d, D[i + w - 1] + 1.414);
      }
      D[i] = d;
    }
  return D;
}
function smoothIdx(idx, w, h) {
  const out = idx.slice(), cs = new Int32Array(8);
  for (let Y = 1; Y < h - 1; Y++)
    for (let X = 1; X < w - 1; X++) {
      const i = Y * w + X;
      cs.fill(0);
      let best = idx[i], bc = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const v = idx[i + dy * w + dx], t = v === 255 ? 7 : v, n = cs[t] = cs[t] + 1;
          if (n > bc) {
            bc = n;
            best = v;
          }
        }
      if (bc >= 5) out[i] = best;
    }
  return out;
}
function borderMedian(d, w, h) {
  const r = [], g = [], b = [];
  const add = (i) => {
    r.push(d[i * 4]);
    g.push(d[i * 4 + 1]);
    b.push(d[i * 4 + 2]);
  };
  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    add(y * w);
    add(y * w + w - 1);
  }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(r), med(g), med(b)];
}

// src/threads.ts
var TH = {
  rani: "#E4007C",
  gulaab: "#FF78B4",
  sindoor: "#FF4B2B",
  kesar: "#FF8A00",
  haldi: "#FFB300",
  mehendi: "#5DAA3A",
  mor: "#00A39A",
  neel: "#3D2BD6",
  jamun: "#7B2CBF",
  chandi: "#B4BBC9",
  moti: "#FFF5E1",
  kajal: "#231B30"
};
var THREADS = [
  ["rani", "Rani"],
  ["gulaab", "Gulaab"],
  ["sindoor", "Sindoor"],
  ["kesar", "Kesar"],
  ["haldi", "Haldi"],
  ["mehendi", "Mehendi"],
  ["mor", "Mor Pankh"],
  ["neel", "Neel"],
  ["jamun", "Jamun"],
  ["chandi", "Chandi"],
  ["moti", "Moti"],
  ["kajal", "Kajal"]
];
var TNAME = Object.fromEntries(THREADS);
var isThreadKey = (k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(TH, k);
var col = (c) => c && c[0] === "#" ? c : isThreadKey(c) ? TH[c] : void 0;
var TPAL = [
  ["Rani", "#E4007C"],
  ["Gulaab", "#FF78B4"],
  ["Sindoor", "#FF4B2B"],
  ["Red", "#D11F33"],
  ["Kesar", "#FF8A00"],
  ["Haldi", "#FFB300"],
  ["Gold", "#C99A2E"],
  ["Mehendi", "#5DAA3A"],
  ["Bottle green", "#1F5B42"],
  ["Mor Pankh", "#00A39A"],
  ["Teal", "#0F766E"],
  ["Sky", "#6FB3E6"],
  ["Neel", "#3D2BD6"],
  ["Navy", "#1B2A55"],
  ["Jamun", "#7B2CBF"],
  ["Maroon", "#7A1F33"],
  ["Brown", "#6B4226"],
  ["Beige", "#E4D1AE"],
  ["Moti", "#FFF3DC"],
  ["White", "#FBFBF8"],
  ["Chandi", "#B4BBC9"],
  ["Grey", "#6E737C"],
  ["Kajal", "#18151D"]
];
var TLAB = TPAL.map(([, h]) => lab(...hexRgb(h)));
function nearestThread(l) {
  let bi = 0, bd = 1e9;
  for (let i = 0; i < TLAB.length; i++) {
    const t = TLAB[i], d = (t[0] - l[0]) ** 2 + (t[1] - l[1]) ** 2 + (t[2] - l[2]) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}
var GC = {
  white: ["White", null],
  natural: ["Natural canvas", null],
  kajal: ["Kajal black", "#1d1b21"],
  neel: ["Neel navy", "#1f2a4f"],
  maroon: ["Maroon", "#6b1d2e"],
  bottle: ["Bottle green", "#1e4d3a"],
  haldi: ["Haldi yellow", "#dfa51c"],
  gulaab: ["Gulaab pink", "#f2a0bd"],
  chandi: ["Chandi grey", "#9ba1a9"],
  sky: ["Sky blue", "#a9cfec"]
};
var GARMENT_COLOURS = Object.keys(GC);

// src/analyse.ts
var NO_DESIGN_ERROR = "We couldn\u2019t find a design in this image. Try a logo on a plain or transparent background.";
var isAnalyseError = (r) => "err" in r;
function kmeans(S, k) {
  const n = S.length, C = [S[n >> 1].slice()], D = new Float64Array(n).fill(1e18);
  while (C.length < k) {
    const c = C[C.length - 1];
    let far = 0, fd = -1;
    for (let i = 0; i < n; i++) {
      const s = S[i], dd = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
      if (dd < D[i]) D[i] = dd;
      if (D[i] > fd) {
        fd = D[i];
        far = i;
      }
    }
    C.push(S[far].slice());
  }
  let sse = 0;
  for (let it = 0; it < 12; it++) {
    const sum = C.map(() => [0, 0, 0, 0]);
    sse = 0;
    for (let i = 0; i < n; i++) {
      const s = S[i];
      let bi = 0, bd = 1e18;
      for (let c = 0; c < k; c++) {
        const q = C[c], dd = (q[0] - s[0]) ** 2 + (q[1] - s[1]) ** 2 + (q[2] - s[2]) ** 2;
        if (dd < bd) {
          bd = dd;
          bi = c;
        }
      }
      sse += bd;
      const t = sum[bi];
      t[0] += s[0];
      t[1] += s[1];
      t[2] += s[2];
      t[3]++;
    }
    for (let c = 0; c < k; c++) {
      const t = sum[c];
      if (t[3]) C[c] = [t[0] / t[3], t[1] / t[3], t[2] / t[3]];
    }
  }
  return { c: C, sse };
}
function prepared(core) {
  const D = core;
  finalize(D);
  setTcol(D);
  return D;
}
function analysePixels(px, opts) {
  const { d, w, h, sw, sh } = px, N = w * h;
  const A = new Uint8Array(N);
  let soft = 0;
  for (let i = 0; i < N; i++) {
    const al = d[i * 4 + 3];
    A[i] = al >= 128 ? 1 : 0;
    if (al < 200) soft++;
  }
  const hasAlpha = soft > N * 0.01;
  let removed = 0, bgLab = null;
  if (!hasAlpha && opts.bgOn) {
    const bg = borderMedian(d, w, h);
    bgLab = lab(bg[0], bg[1], bg[2]);
    const tol = 46 * 46, dist = (i) => {
      const j = i * 4, a = d[j] - bg[0], b = d[j + 1] - bg[1], e = d[j + 2] - bg[2];
      return a * a + b * b + e * e;
    };
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    const push = (i) => {
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
      const i = q[qh++], X = i % w, Y = i / w | 0;
      if (X > 0) push(i - 1);
      if (X < w - 1) push(i + 1);
      if (Y > 0) push(i - w);
      if (Y < h - 1) push(i + w);
    }
    if (removed) {
      const B = A.slice();
      for (let i = 0; i < N; i++) {
        if (!A[i]) continue;
        const X = i % w, Y = i / w | 0;
        if ((X > 0 && !A[i - 1] || X < w - 1 && !A[i + 1] || Y > 0 && !A[i - w] || Y < h - 1 && !A[i + w]) && dist(i) < tol * 5)
          B[i] = 0;
      }
      A.set(B);
    }
  }
  let opaque = 0;
  for (let i = 0; i < N; i++) opaque += A[i];
  if (opaque < N * 4e-3) return { err: NO_DESIGN_ERROR };
  const LAB = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    if (!A[i]) continue;
    const l = lab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    LAB[i * 3] = l[0];
    LAB[i * 3 + 1] = l[1];
    LAB[i * 3 + 2] = l[2];
  }
  const edge = (i) => {
    const X = i % w, Y = i / w | 0;
    return X > 0 && !A[i - 1] || X < w - 1 && !A[i + 1] || Y > 0 && !A[i - w] || Y < h - 1 && !A[i + w];
  };
  const S = [], step = Math.max(1, Math.floor(opaque / 14e3));
  let cnt = 0;
  for (let i = 0; i < N; i++) {
    if (!A[i] || edge(i)) continue;
    if (cnt++ % step === 0) S.push([LAB[i * 3], LAB[i * 3 + 1], LAB[i * 3 + 2]]);
  }
  if (S.length < 24) {
    for (let i = 0; i < N; i++) if (A[i]) S.push([LAB[i * 3], LAB[i * 3 + 1], LAB[i * 3 + 2]]);
  }
  const runs = [];
  for (let k2 = 1; k2 <= 6; k2++) runs.push(kmeans(S, k2));
  let k = clamp(opts.k || 4, 1, 6);
  if (opts.auto) {
    k = 6;
    for (let t = 1; t <= 6; t++)
      if (runs[t - 1].sse <= runs[0].sse * 0.045 + S.length * 6) {
        k = t;
        break;
      }
  }
  const run2 = runs[k - 1], tIdx = run2.c.map((c) => nearestThread(c)), threads = [...new Set(tIdx)], remap = tIdx.map((t) => threads.indexOf(t));
  const idx = new Uint8Array(N).fill(255), msum = threads.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < N; i++) {
    if (!A[i]) continue;
    const L0 = LAB[i * 3], a0 = LAB[i * 3 + 1], b0 = LAB[i * 3 + 2];
    let bi = 0, bd = 1e18;
    for (let cc = 0; cc < k; cc++) {
      const q = run2.c[cc], dd = (q[0] - L0) ** 2 + (q[1] - a0) ** 2 + (q[2] - b0) ** 2;
      if (dd < bd) {
        bd = dd;
        bi = cc;
      }
    }
    const t = remap[bi];
    idx[i] = t;
    const m = msum[t];
    m[0] += L0;
    m[1] += a0;
    m[2] += b0;
    m[3]++;
  }
  const idx2 = smoothIdx(idx, w, h);
  const count0 = new Array(threads.length).fill(0);
  for (let i = 0; i < N; i++) if (idx2[i] !== 255) count0[idx2[i]]++;
  const tot = count0.reduce((p, q) => p + q, 0) || 1, drop = /* @__PURE__ */ new Set();
  if (bgLab && removed) {
    const bgT = nearestThread(bgLab), bL = bgLab;
    msum.forEach((m, t) => {
      if (!m[3]) return;
      const dE = Math.sqrt((m[0] / m[3] - bL[0]) ** 2 + (m[1] / m[3] - bL[1]) ** 2 + (m[2] / m[3] - bL[2]) ** 2);
      if ((dE < 18 || threads[t] === bgT) && count0[t] / tot < 0.15 && threads.length > 1) drop.add(t);
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
    photoLike: runs[5].sse > runs[0].sse * 0.12,
    hasAlpha,
    removed: removed > N * 0.02,
    srcW: sw,
    srcH: sh
  });
}
function analyseKnownPixels(px, palette) {
  const { d, w, h, sw, sh } = px, N = w * h, P = palette.map(hexRgb);
  let tIdx = palette.map((hx) => nearestThread(lab(...hexRgb(hx)))), uniq = [...new Set(tIdx)];
  while (uniq.length > 6) {
    let best = [0, 1], bd = 1e18;
    for (let i = 0; i < uniq.length; i++)
      for (let j = i + 1; j < uniq.length; j++) {
        const a = TLAB[uniq[i]], b = TLAB[uniq[j]], dd = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
        if (dd < bd) {
          bd = dd;
          best = [i, j];
        }
      }
    const keep = uniq[best[0]], gone = uniq[best[1]];
    tIdx = tIdx.map((t) => t === gone ? keep : t);
    uniq = [...new Set(tIdx)];
  }
  const threads = uniq, remap = tIdx.map((t) => threads.indexOf(t));
  const idx = new Uint8Array(N).fill(255);
  for (let i = 0; i < N; i++) {
    if (d[i * 4 + 3] < 128) continue;
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    let bi = 0, bd = 1e9;
    for (let p = 0; p < P.length; p++) {
      const q = P[p], dd = (q[0] - r) ** 2 + (q[1] - g) ** 2 + (q[2] - b) ** 2;
      if (dd < bd) {
        bd = dd;
        bi = p;
      }
    }
    idx[i] = remap[bi];
  }
  const idx2 = smoothIdx(idx, w, h), count0 = new Array(threads.length).fill(0);
  for (let i = 0; i < N; i++) if (idx2[i] !== 255) count0[idx2[i]]++;
  return prepared({
    w,
    h,
    k: threads.length,
    idx0: idx2,
    threads,
    count0,
    drop: /* @__PURE__ */ new Set(),
    autoDrop: false,
    photoLike: false,
    hasAlpha: true,
    removed: false,
    srcW: sw,
    srcH: sh
  });
}
function finalize(D) {
  const w = D.w, h = D.h, N = w * h, idx = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const v = D.idx0[i];
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
      near[i] = idx[i];
      continue;
    }
    const X = i % w, Y = i / w | 0;
    let v = 0, f2 = false;
    for (let dy = -1; dy <= 1 && !f2; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const XX = X + dx, YY = Y + dy;
        if (XX < 0 || YY < 0 || XX >= w || YY >= h) continue;
        const t = idx[YY * w + XX];
        if (t !== 255) {
          v = t;
          f2 = true;
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
function setTcol(D) {
  D.tcol = D.threads.map((t) => {
    const c = hexRgb(TPAL[t][1]);
    return [c[0] / 255, c[1] / 255, c[2] / 255];
  });
  D.ang = D.threads.map((_, i) => ANG[i % ANG.length]);
}

// src/dom.ts
var hasDom = () => typeof document !== "undefined" && typeof document.createElement === "function";
function needDom(what) {
  if (!hasDom()) throw new Error(`@store/stitch: ${what} needs a browser (canvas). Call it from a client component.`);
}
function createCanvas(w, h) {
  needDom("drawing");
  const c = document.createElement("canvas");
  if (w !== void 0) c.width = w;
  if (h !== void 0) c.height = h;
  return c;
}
function ctx2d(c, opts) {
  const x = c.getContext("2d", opts);
  if (!x) throw new Error("@store/stitch: canvas 2D context is not available");
  return x;
}
function pixels(src) {
  const nat = "naturalWidth" in src ? src : null, sw = nat && nat.naturalWidth || src.width || 600, sh = nat && nat.naturalHeight || src.height || 600, s = Math.min(1, MAX_DESIGN_PX / Math.max(sw, sh)), w = Math.max(16, Math.round(sw * s)), h = Math.max(16, Math.round(sh * s));
  const c = createCanvas(w, h), x = ctx2d(c, { willReadFrequently: true });
  x.drawImage(src, 0, 0, w, h);
  return { d: x.getImageData(0, 0, w, h).data, w, h, sw, sh };
}
function loadImage(src, crossOrigin = "anonymous") {
  needDom("loading images");
  return new Promise((res, rej) => {
    const im = new Image();
    if (crossOrigin !== null) im.crossOrigin = crossOrigin;
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`@store/stitch: could not load ${src.length > 120 ? src.slice(0, 120) + "\u2026" : src}`));
    im.src = src;
  });
}

// src/fonts.ts
var FONTS = {
  script: { fam: "Pacifico, cursive", w: 400, k: 1, name: "Script", lbl: "Aa" },
  classic: { fam: "'Playfair Display', Georgia, serif", w: 700, it: true, k: 1.1, name: "Classic", lbl: "Aa" },
  bold: { fam: "'Archivo Black', Impact, sans-serif", w: 400, k: 0.88, name: "Bold", lbl: "AA" },
  hindi: { fam: "'Yatra One', 'Noto Sans Devanagari', sans-serif", w: 400, k: 1.08, name: "\u0939\u093F\u0902\u0926\u0940", lbl: "\u0905\u0906" }
};
var FONT_KEYS = ["script", "classic", "bold", "hindi"];
var isFontKey = (k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(FONTS, k);
var fontStr = (k, px, fam = FONTS[k].fam) => {
  const F = FONTS[k];
  return `${F.it ? "italic " : ""}${F.w} ${px}px ${fam}`;
};
var FONT_PROBES = [
  '84px "Archivo Black"',
  'italic 700 260px "Playfair Display"',
  '800 32px "Plus Jakarta Sans"',
  "120px Pacifico",
  '120px "Yatra One"'
];
var GOOGLE_FONTS_CSS = [
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
  "https://fonts.googleapis.com/css2?family=Pacifico&family=Playfair+Display:ital,wght@1,700&family=Archivo+Black&family=Yatra+One&family=Mukta:wght@500;600;700;800&display=swap"
];
function fontsLoaded(probes = FONT_PROBES, timeoutMs = 2500) {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  const all = Promise.all(probes.map((f2) => document.fonts.load(f2))).then(
    () => void 0,
    () => void 0
  );
  return Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
}

// src/svg-path.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var probe = null;
function getProbe() {
  if (probe) return probe;
  if (typeof document === "undefined" || !document.body || typeof document.createElementNS !== "function") return null;
  const p = document.createElementNS(SVG_NS, "path"), s = document.createElementNS(SVG_NS, "svg");
  s.setAttribute("width", "0");
  s.setAttribute("height", "0");
  s.setAttribute("aria-hidden", "true");
  s.style.position = "absolute";
  s.appendChild(p);
  document.body.appendChild(s);
  probe = p;
  return p;
}
function sample(d, n) {
  const p = getProbe();
  if (!p) return samplePathPure(d, n);
  p.setAttribute("d", d);
  const L = p.getTotalLength(), o = [];
  for (let k = 0; k < n; k++) {
    const q = p.getPointAtLength(L * k / n);
    o.push([q.x, q.y]);
  }
  return o;
}
function flatten(d, steps = 64) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtZzAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const polys = [];
  let cur = [], x = 0, y = 0, sx = 0, sy = 0, cmd = "", i = 0, lcx = 0, lcy = 0, lqx = 0, lqy = 0, prev = "";
  const isCmd = (t) => /^[A-Za-z]$/.test(t);
  const num = () => {
    const t = tokens[i++];
    if (t === void 0 || isCmd(t)) throw new Error(`bad path data near token ${i}: ${d}`);
    return parseFloat(t);
  };
  const lineTo = (nx, ny) => {
    cur.push([nx, ny]);
    x = nx;
    y = ny;
  };
  const cubic = (x1, y1, x2, y2, ex, ey) => {
    const x0 = x, y0 = y;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, mt = 1 - t;
      cur.push([
        mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * ex,
        mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * ey
      ]);
    }
    x = ex;
    y = ey;
  };
  const quad = (x1, y1, ex, ey) => {
    const x0 = x, y0 = y;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, mt = 1 - t;
      cur.push([mt * mt * x0 + 2 * mt * t * x1 + t * t * ex, mt * mt * y0 + 2 * mt * t * y1 + t * t * ey]);
    }
    x = ex;
    y = ey;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (isCmd(t)) {
      cmd = t;
      i++;
    } else if (!cmd) throw new Error(`path data must start with a command: ${d}`);
    const rel = cmd === cmd.toLowerCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        const nx = num() + ox, ny = num() + oy;
        if (cur.length > 1) polys.push(cur);
        cur = [[nx, ny]];
        x = sx = nx;
        y = sy = ny;
        cmd = rel ? "l" : "L";
        break;
      }
      case "L":
        lineTo(num() + ox, num() + oy);
        break;
      case "H":
        lineTo(num() + ox, y);
        break;
      case "V":
        lineTo(x, num() + oy);
        break;
      case "C": {
        const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy, ex = num() + ox, ey = num() + oy;
        cubic(x1, y1, x2, y2, ex, ey);
        lcx = x2;
        lcy = y2;
        break;
      }
      case "S": {
        const smooth = "CcSs".includes(prev), x1 = smooth ? 2 * x - lcx : x, y1 = smooth ? 2 * y - lcy : y, x2 = num() + ox, y2 = num() + oy, ex = num() + ox, ey = num() + oy;
        cubic(x1, y1, x2, y2, ex, ey);
        lcx = x2;
        lcy = y2;
        break;
      }
      case "Q": {
        const x1 = num() + ox, y1 = num() + oy, ex = num() + ox, ey = num() + oy;
        quad(x1, y1, ex, ey);
        lqx = x1;
        lqy = y1;
        break;
      }
      case "T": {
        const smooth = "QqTt".includes(prev), x1 = smooth ? 2 * x - lqx : x, y1 = smooth ? 2 * y - lqy : y, ex = num() + ox, ey = num() + oy;
        quad(x1, y1, ex, ey);
        lqx = x1;
        lqy = y1;
        break;
      }
      case "Z":
        lineTo(sx, sy);
        if (cur.length > 1) polys.push(cur);
        cur = [[sx, sy]];
        prev = cmd;
        cmd = "";
        continue;
      default:
        throw new Error(`path command "${cmd}" is not supported without a DOM: ${d}`);
    }
    prev = cmd;
  }
  if (cur.length > 1) polys.push(cur);
  return polys;
}
function samplePathPure(d, n) {
  const polys = flatten(d), segs = [];
  let L = 0;
  for (const poly of polys)
    for (let k = 1; k < poly.length; k++) {
      const [x0, y0] = poly[k - 1], [x1, y1] = poly[k], len = Math.hypot(x1 - x0, y1 - y0);
      segs.push([x0, y0, x1, y1, len]);
      L += len;
    }
  const first = polys[0]?.[0] ?? [0, 0], o = [];
  for (let k = 0; k < n; k++) {
    let target = L * k / n, pt = [first[0], first[1]];
    for (const [x0, y0, x1, y1, len] of segs) {
      if (target <= len) {
        const t = len ? target / len : 0;
        pt = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
        break;
      }
      target -= len;
      pt = [x1, y1];
    }
    o.push(pt);
  }
  return o;
}

// src/motifs.ts
var knot = (x, y, r, c) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${c}"/><circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.32)}" r="${f(r * 0.38)}" fill="#fff" opacity=".55"/>`;
var run = (d, c, w = 2.2, da = "6 4") => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${da}"/>`;
var chain = (d, c, w = 3.8) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="6 2.8"/><path d="${d}" fill="none" stroke="${shade(c, -0.38)}" stroke-width="${f(w * 0.26)}" stroke-linecap="round" stroke-dasharray="6 2.8"/>`;
var leaf = (x, y, len, ang, c, w = 0.38) => {
  const h = f(len * w), m = f(len * 0.5);
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${ang})"><path d="M0 0Q${m} ${-h} ${len} 0Q${m} ${h} 0 0Z" fill="${c}"/><path d="M0 0Q${m} ${-h} ${len} 0Z" fill="${shade(c, -0.2)}"/></g>`;
};
var petal = (len, wid) => `M0 0C${f(-wid)} ${f(-len * 0.35)} ${f(-wid * 0.6)} ${-len} 0 ${-len}C${f(wid * 0.6)} ${-len} ${wid} ${f(-len * 0.35)} 0 0Z`;
function star(cx, cy, r, c) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.46 : r;
    d += (i ? "L" : "M") + f(cx + Math.cos(a) * rr) + " " + f(cy + Math.sin(a) * rr);
  }
  return `<path d="${d}Z" fill="${c}" stroke="${c}" stroke-width="1" stroke-linejoin="round"/>`;
}
var inner = (m, fine) => {
  const k = fine ? "2" : "";
  return (m.b ? `<g filter="url(#lift)">${m.b}</g>` : "") + (m.v ? `<g filter="url(#satinV${k})">${m.v}</g>` : "") + (m.s ? `<g filter="url(#satin${k})">${m.s}</g>` : "") + (m.t ? `<g filter="url(#lift)">${m.t}</g>` : "");
};
var grp = (m, tr, fine) => `<g${tr ? ` transform="${tr}"` : ""}>${inner(m, fine)}</g>`;
var STITCH_FILTER_DEFS = `<filter id="satin" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.03 0.34" numOctaves="2" seed="4" result="n"/><feDiffuseLighting in="n" surfaceScale="2.6" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.32" k2="0" k3="0" k4="0" result="tx"/><feGaussianBlur in="SourceAlpha" stdDeviation="1" result="b"/><feOffset in="b" dx=".6" dy="1.5" result="o"/><feFlood flood-color="#2A1638" flood-opacity=".42"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="tx"/></feMerge></filter><filter id="satinV" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.34 0.03" numOctaves="2" seed="9" result="n"/><feDiffuseLighting in="n" surfaceScale="2.6" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.32" k2="0" k3="0" k4="0" result="tx"/><feGaussianBlur in="SourceAlpha" stdDeviation="1" result="b"/><feOffset in="b" dx=".6" dy="1.5" result="o"/><feFlood flood-color="#2A1638" flood-opacity=".42"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="tx"/></feMerge></filter><filter id="satin2" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.62" numOctaves="2" seed="4" result="n"/><feDiffuseLighting in="n" surfaceScale="1.6" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.32" k2="0" k3="0" k4="0" result="tx"/><feGaussianBlur in="SourceAlpha" stdDeviation=".6" result="b"/><feOffset in="b" dx=".4" dy=".8" result="o"/><feFlood flood-color="#2A1638" flood-opacity=".42"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="tx"/></feMerge></filter><filter id="satinV2" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.62 0.05" numOctaves="2" seed="9" result="n"/><feDiffuseLighting in="n" surfaceScale="1.6" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting><feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.32" k2="0" k3="0" k4="0" result="tx"/><feGaussianBlur in="SourceAlpha" stdDeviation=".6" result="b"/><feOffset in="b" dx=".4" dy=".8" result="o"/><feFlood flood-color="#2A1638" flood-opacity=".42"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="tx"/></feMerge></filter><filter id="lift" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation=".7" result="b"/><feOffset in="b" dx=".4" dy="1.1" result="o"/><feFlood flood-color="#2A1638" flood-opacity=".4"/><feComposite in2="o" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
var PAISLEY = "M0 48C-40 48-50 5-28-20C-12-38 18-42 30-58C24-40 40-28 38-6C36 24 22 48 0 48Z";
var HEART = "M0 36C-46 6-40-38 0-16C40-38 46 6 0 36Z";
var PAISLEY_POINTS = [
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
  [17.916095733642578, 41.70996856689453]
];
var cols3 = (c) => c;
var gulaab = {
  name: "Gulaab",
  st: 4200,
  slots: ["Petals", "Centre", "Leaves"],
  def: ["rani", "sindoor", "mehendi"],
  draw(cols) {
    const [p, c, l] = cols3(cols);
    let v = "", s = "", t = "";
    v += leaf(-12, 16, 46, 150, l) + leaf(12, 16, 46, 30, l) + leaf(0, 24, 38, 90, l, 0.33);
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      s += `<circle cx="${f(Math.cos(a) * 21)}" cy="${f(Math.sin(a) * 21)}" r="19" fill="${p}"/>`;
    }
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 54) * Math.PI / 180;
      s += `<circle cx="${f(Math.cos(a) * 11)}" cy="${f(Math.sin(a) * 11)}" r="14" fill="${shade(p, -0.18)}"/>`;
    }
    s += `<circle r="10.5" fill="${c}"/>`;
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180, x = Math.cos(a) * 21, y = Math.sin(a) * 21, ca = Math.cos(a + Math.PI / 2), sa = Math.sin(a + Math.PI / 2), ra = Math.cos(a), rb = Math.sin(a);
      t += `<path d="M${f(x - 10 * ca + 4 * ra)} ${f(y - 10 * sa + 4 * rb)}Q${f(x + 15 * ra)} ${f(y + 15 * rb)} ${f(x + 10 * ca + 4 * ra)} ${f(y + 10 * sa + 4 * rb)}" fill="none" stroke="${shade(p, 0.4)}" stroke-width="1.7" stroke-linecap="round"/>`;
    }
    t += `<path d="M-4.5 1.5a4.8 4.8 0 1 1 8.6 1.6a3.2 3.2 0 1 1-5.6-1.8" fill="none" stroke="${shade(c, 0.5)}" stroke-width="1.7" stroke-linecap="round"/>`;
    return { v, s, t };
  }
};
var phool = {
  name: "Phool",
  st: 3100,
  slots: ["Petals", "Centre", "Leaves"],
  def: ["neel", "haldi", "mehendi"],
  draw(cols) {
    const [p, c, l] = cols3(cols);
    let v = "", t = "";
    v += leaf(-6, 30, 36, 128, l) + leaf(6, 30, 36, 52, l);
    for (let i = 0; i < 12; i++)
      t += `<g transform="rotate(${i * 30})"><ellipse cx="0" cy="-25" rx="6.4" ry="15.5" fill="${shade(p, 0.78)}" fill-opacity=".55" stroke="${p}" stroke-width="3.3"/><path d="M0-41v-3.2" stroke="${p}" stroke-width="2.6" stroke-linecap="round"/></g>`;
    const dots = [
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
      [0, -11]
    ];
    dots.forEach(([x, y]) => t += knot(x, y, 3.5, c));
    return { v, t };
  }
};
var kairi = {
  name: "Kairi",
  st: 3800,
  slots: ["Outline", "Inner", "Dots"],
  def: ["sindoor", "mor", "haldi"],
  draw(cols) {
    const [o, i, d] = cols3(cols);
    let s = "", t = "";
    s += `<g transform="translate(-3 12) scale(.4)"><path d="${PAISLEY}" fill="${i}"/></g><g transform="translate(-4 16) scale(.18)"><path d="${PAISLEY}" fill="${d}"/></g>`;
    t += chain(PAISLEY, o, 4.2);
    t += `<g transform="translate(-1.5 6.5) scale(.72)">${run(PAISLEY, i, 3, "5 4")}</g>`;
    PAISLEY_POINTS.forEach(([x, y]) => t += knot(-1 + x * 0.86, 3.5 + y * 0.86, 2.5, d));
    return { s, t };
  }
};
var mor = {
  name: "Mor Pankh",
  st: 5200,
  slots: ["Eye", "Ring", "Feather"],
  def: ["haldi", "neel", "mor"],
  draw(cols) {
    const [e, m, o] = cols3(cols);
    let b = "", s = "", t = "";
    for (let y = 46, k = 0; y >= -46; y -= 5, k++) {
      const w = Math.max(0, 1 - Math.abs(y + 16) / 66), len = f(10 + w * 30), cc = k % 2 ? o : shade(o, 0.3);
      b += `<path d="M0 ${y}L${-len} ${f(y - 10)}M0 ${y}L${len} ${f(y - 10)}" stroke="${cc}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    b += `<path d="M0 58C2 30-2 2 0-54" fill="none" stroke="${shade(o, -0.35)}" stroke-width="2.6" stroke-linecap="round"/>`;
    s += `<ellipse cx="0" cy="-18" rx="21" ry="27" fill="${o}"/><ellipse cx="0" cy="-15" rx="14.5" ry="19.5" fill="${m}"/><path d="M0-3C-9-7-10-19-5-25.5C-2-28.5 2-28.5 5-25.5C10-19 9-7 0-3Z" fill="${e}"/>`;
    t += knot(0, -17, 2.6, shade(e, 0.55));
    return { b, s, t };
  }
};
var kamal = {
  name: "Kamal",
  st: 4600,
  slots: ["Petals", "Centre", "Water"],
  def: ["gulaab", "haldi", "mor"],
  draw(cols) {
    const [p, c, w] = cols3(cols);
    let s = "", t = "";
    const P = [
      [-64, 40, 16, shade(p, -0.14)],
      [64, 40, 16, shade(p, -0.14)],
      [-32, 48, 19, p],
      [32, 48, 19, p],
      [0, 54, 22, shade(p, 0.14)]
    ];
    s += `<g transform="translate(0 10)">` + P.map(([a, len, wd, cc]) => `<path transform="rotate(${a})" d="${petal(len, wd)}" fill="${cc}"/>`).join("") + `<path d="M-24 0C-18 12 18 12 24 0L18 9C9 16-9 16-18 9Z" fill="${c}"/></g>`;
    const veins = [
      [-32, 48],
      [32, 48],
      [0, 54]
    ];
    t += `<g transform="translate(0 10)">` + veins.map(
      ([a, len]) => `<path transform="rotate(${a})" d="M0-8V${-len + 12}" stroke="${shade(p, -0.32)}" stroke-width="1.5" stroke-linecap="round"/>`
    ).join("") + `</g>`;
    t += run("M-52 34q13-7 26 0t26 0t26 0t26 0", w, 2.6, "5 4") + run("M-38 45q10-6 19 0t19 0t19 0t19 0", w, 2.3, "5 4");
    return { s, t };
  }
};
var chand = {
  name: "Chand Tara",
  st: 2600,
  slots: ["Moon", "Stars", "Dots"],
  def: ["haldi", "neel", "gulaab"],
  draw(cols) {
    const [m, st, d] = cols3(cols);
    let s = "", t = "";
    s += `<path d="M8-44A44 44 0 1 0 8 44A22 44 0 1 1 8-44Z" fill="${m}"/>` + star(24, -16, 11, st) + star(36, 16, 7.5, st) + star(14, 32, 5.5, st);
    const dots = [
      [-10, -52],
      [40, -40],
      [48, 34],
      [-6, 54],
      [28, 2]
    ];
    dots.forEach(([x, y]) => t += knot(x, y, 2.6, d));
    return { s, t };
  }
};
var dil = {
  name: "Dil",
  st: 2200,
  slots: ["Heart", "Outline", "Dots"],
  def: ["sindoor", "rani", "haldi"],
  draw(cols) {
    const [h, o, d] = cols3(cols);
    const s = `<path d="${HEART}" fill="${h}"/>`;
    let t = "";
    t += `<g transform="translate(0 -1) scale(1.3)">${run(HEART, o, 1.8, "4 3.4")}</g>`;
    t += `<path d="M-15-13q-9 5-8 15" fill="none" stroke="${shade(h, 0.5)}" stroke-width="2.6" stroke-linecap="round"/>`;
    const dots = [
      [-42, -32],
      [44, -28],
      [-48, 22],
      [48, 24],
      [0, -50]
    ];
    dots.forEach(([x, y]) => t += knot(x, y, 2.8, d));
    return { s, t };
  }
};
var genda = {
  name: "Genda",
  st: 5e3,
  slots: ["Outer", "Inner", "Leaves"],
  def: ["kesar", "haldi", "mehendi"],
  draw(cols) {
    const [o, i, l] = cols3(cols);
    let v = "", s = "", t = "";
    v += leaf(-14, 20, 40, 140, l) + leaf(14, 20, 40, 40, l);
    const ring = (n, dist, r, cc, off) => {
      for (let k = 0; k < n; k++) {
        const a = (k * 360 / n + off) * Math.PI / 180;
        s += `<circle cx="${f(Math.cos(a) * dist)}" cy="${f(Math.sin(a) * dist)}" r="${r}" fill="${cc}"/>`;
      }
    };
    ring(14, 25, 10, shade(o, -0.08), 0);
    ring(14, 23, 8, o, 12.8);
    ring(11, 15, 9, shade(i, -0.05), 0);
    ring(9, 8, 7.5, i, 20);
    s += `<circle r="6.5" fill="${shade(i, -0.28)}"/>`;
    for (let k = 0; k < 14; k++) {
      const a = (k * 360 / 14 + 6) * Math.PI / 180;
      t += `<path d="M${f(Math.cos(a) * 27)} ${f(Math.sin(a) * 27)}l${f(Math.cos(a) * 6)} ${f(Math.sin(a) * 6)}" stroke="${shade(o, 0.35)}" stroke-width="1.4" stroke-linecap="round"/>`;
    }
    return { v, s, t };
  }
};
var phoolwari = {
  name: "Phoolwari",
  st: 7200,
  slots: ["Roses", "Flowers", "Leaves"],
  def: ["rani", "neel", "mehendi"],
  draw(cols) {
    const [a, b, l, a2] = cols3(cols);
    const m = (n, cs, x, y, sc, r = 0) => grp(MOTIFS[n].draw(cs), `translate(${x} ${y}) rotate(${r}) scale(${sc})`).replace(/ filter="url\(#[^)]*\)"/g, "");
    return {
      s: m("gulaab", [a, TH.haldi, l], -14, -6, 0.62) + m("gulaab", [a2 || shade(a, 0.38), TH.sindoor, l], 26, -22, 0.44, 16) + m("phool", [b, TH.haldi, l], 16, 26, 0.34) + m("phool", [TH.sindoor, TH.haldi, l], -34, 30, 0.25, -12) + m("dil", [TH.haldi, a, a], 36, 22, 0.2, 12)
    };
  }
};
var MOTIFS = {
  gulaab,
  phool,
  kairi,
  mor,
  kamal,
  chand,
  dil,
  genda,
  phoolwari
};
var MOTIF_KEYS = [
  "phoolwari",
  ...Object.keys(MOTIFS).filter((k) => k !== "phoolwari")
];

// src/design.ts
var MOTIF_PX = 620;
var isMotifKey = (k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(MOTIFS, k);
function motifSvg(name, cols) {
  const m = MOTIFS[name].draw(cols), body = ((m.b || "") + (m.v || "") + (m.s || "") + (m.t || "")).replace(/<circle[^>]*fill="#fff"[^>]*\/>/g, "");
  const used = [...new Set((body.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase()))];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-62 -62 124 124" width="${MOTIF_PX}" height="${MOTIF_PX}">${body}</svg>`;
  return { svg, used };
}
function motifColours(name, mcols) {
  const keys = mcols && mcols.length ? mcols : MOTIFS[name].def;
  return keys.map((k, i) => {
    const h = col(k);
    if (h === void 0) throw new Error(`@store/stitch: unknown thread colour "${k}" for motif slot ${i + 1}`);
    return h;
  });
}
function trimCanvas(c) {
  const x = ctx2d(c, { willReadFrequently: true }), d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++)
    for (let X = 0; X < c.width; X++)
      if (d[(y * c.width + X) * 4 + 3] > 8) {
        if (X < x0) x0 = X;
        if (X > x1) x1 = X;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < x0) return c;
  const p = 6, t = createCanvas();
  t.width = x1 - x0 + 1 + p * 2;
  t.height = y1 - y0 + 1 + p * 2;
  ctx2d(t).drawImage(c, x0 - p, y0 - p, t.width, t.height, 0, 0, t.width, t.height);
  return t;
}
async function drawDesign(spec, families = {}) {
  const pal = [];
  let mImg = null;
  if (spec.motif && spec.motif !== "none") {
    if (!isMotifKey(spec.motif)) throw new Error(`@store/stitch: unknown motif "${String(spec.motif)}"`);
    const r = motifSvg(spec.motif, motifColours(spec.motif, spec.mcols));
    mImg = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(r.svg), null);
    pal.push(...r.used);
  }
  const text = (spec.text || "").trim(), F = spec.font || "script";
  if (!isFontKey(F)) throw new Error(`@store/stitch: unknown font "${String(F)}"`);
  const tcol = text ? col(spec.tcol) : void 0;
  if (text && tcol === void 0) throw new Error(`@store/stitch: a name needs a thread colour (tcol), got "${String(spec.tcol)}"`);
  const fam = families[F] ?? FONTS[F].fam, c = createCanvas(), x = ctx2d(c);
  let fs = 200;
  x.font = fontStr(F, fs, fam);
  let tw = text ? x.measureText(text).width : 0;
  if (spec.maxW && tw > spec.maxW) {
    fs = Math.max(80, Math.floor(fs * spec.maxW / tw));
    x.font = fontStr(F, fs, fam);
    tw = x.measureText(text).width;
  }
  const mw = mImg ? MOTIF_PX : 0, gap = mImg && text ? 10 : 0, th = text ? fs * 1.35 : 0;
  c.width = Math.ceil(Math.max(mw, tw) + 60);
  c.height = Math.ceil(mw + gap + th + 60);
  if (mImg) x.drawImage(mImg, (c.width - mw) / 2, 30, mw, mw);
  if (text && tcol) {
    x.font = fontStr(F, fs, fam);
    x.textAlign = "center";
    x.textBaseline = "alphabetic";
    x.fillStyle = tcol;
    x.fillText(text, c.width / 2, 30 + mw + gap + fs * 1.02);
    pal.push(tcol);
  }
  return { canvas: trimCanvas(c), palette: [...new Set(pal)] };
}

// src/garment.ts
function prepareGarment(px, mask, W, H) {
  const lum = new Float32Array(W * H), m = new Float32Array(W * H);
  for (let i = 0, j = 0; i < W * H; i++, j += 4) {
    lum[i] = (0.2126 * px[j] + 0.7152 * px[j + 1] + 0.0722 * px[j + 2]) / 255;
    m[i] = mask[j] / 255;
  }
  const blur = boxBlur(lum, W, H, 4);
  return { px, lum, m, blur, fr: garmentFringe(m, lum, W, H) };
}
function garmentFringe(m, lum, W, H) {
  const N = W * H, ins = new Uint8Array(N), t = new Uint8Array(N), near = new Uint8Array(N), F = [];
  for (let i = 0; i < N; i++) ins[i] = m[i] >= 0.9 ? 1 : 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -3; k <= 3 && !v; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < W) v = ins[y * W + xx];
      }
      t[y * W + x] = v;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -3; k <= 3 && !v; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < H) v = t[yy * W + x];
      }
      near[y * W + x] = v;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (ins[i] || !near[i]) continue;
      let bi = -1, bd = 1e9, so = 0, no = 0;
      for (let dy = -4; dy <= 4; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -4; dx <= 4; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const j = yy * W + xx, dd = dx * dx + dy * dy;
          if (ins[j]) {
            if (dd < bd) {
              bd = dd;
              bi = j;
            }
          } else if (m[j] <= 0.02) {
            so += lum[j];
            no++;
          }
        }
      }
      if (bi < 0) continue;
      const lo = no ? so / no : 0, den = lum[bi] - lo;
      let a = m[i];
      if (den > 0.08) a = Math.max(a, clamp((lum[i] - lo) / den, 0, 1));
      if (a > 0.01) F.push(i, bi, a);
    }
  return F;
}
function recolourGarment(g, ref, hex, d) {
  const px = g.px, N = g.lum.length;
  d.set(px);
  if (!hex) return;
  const c = hexRgb(hex), r = c[0] / 255, gg = c[1] / 255, b = c[2] / 255, L = relLum(hex), sheen = L < 0.08 ? 0.62 : L < 0.35 ? 0.42 : 0.22;
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const m = g.m[i];
    if (m <= 2e-3) continue;
    let l = g.lum[i] / ref;
    if (l > 1.22) l = 1.22;
    const t = Math.pow(l, 1.18), hl = l > 0.8 ? (l - 0.8) * sheen : 0;
    d[j] = px[j] + (Math.min(1, r * t + hl) * 255 - px[j]) * m;
    d[j + 1] = px[j + 1] + (Math.min(1, gg * t + hl) * 255 - px[j + 1]) * m;
    d[j + 2] = px[j + 2] + (Math.min(1, b * t + hl) * 255 - px[j + 2]) * m;
  }
  const F = g.fr;
  for (let n = 0; n < F.length; n += 3) {
    const j = F[n] * 4, k = F[n + 1] * 4, al = F[n + 2];
    d[j] = px[j] + al * (d[k] - px[k]);
    d[j + 1] = px[j + 1] + al * (d[k + 1] - px[k + 1]);
    d[j + 2] = px[j + 2] + al * (d[k + 2] - px[k + 2]);
  }
}

// src/garments.ts
var GARMENT_VIEWS = ["tee", "model", "polo", "shirt", "hoodie", "cap", "tote"];
var GARMENTS = {
  tee: {
    w: 900,
    h: 1125,
    ref: 0.8426,
    pxcm: 10.029,
    rot: 0,
    curve: 0,
    place: {
      lc: { n: "Left chest", x: 567.3, y: 450, min: 5, max: 10, d: 8 },
      cc: { n: "Centre chest", x: 445.2, y: 541.6, min: 10, max: 28, d: 22 }
    },
    credit: "https://unsplash.com/photos/acn5ERAeSb4"
  },
  model: {
    w: 900,
    h: 1125,
    ref: 0.7891,
    pxcm: 9,
    rot: -2,
    curve: 0.25,
    place: {
      lc: { n: "Left chest", x: 615, y: 512, min: 5, max: 10, d: 8 },
      cc: { n: "Centre chest", x: 530, y: 632, min: 10, max: 28, d: 22 }
    },
    credit: "https://unsplash.com/photos/ogmenj2NGho"
  },
  polo: {
    w: 900,
    h: 1125,
    ref: 0.9454,
    pxcm: 8.691,
    rot: 0,
    curve: 0,
    place: {
      lc: { n: "Left chest", x: 565.7, y: 430.7, min: 5, max: 10, d: 8 },
      rc: { n: "Right chest", x: 338.1, y: 430.7, min: 5, max: 10, d: 8 }
    },
    credit: "https://unsplash.com/photos/F5i3PZXYkvY"
  },
  shirt: {
    w: 900,
    h: 1125,
    ref: 0.8311,
    pxcm: 10.125,
    rot: 0,
    curve: 0,
    place: {
      pk: { n: "On the pocket", x: 587.8, y: 523.1, min: 4, max: 7, d: 6 },
      ap: { n: "Above the pocket", x: 587.8, y: 390.9, min: 5, max: 9, d: 7 }
    },
    credit: "https://unsplash.com/photos/ve2dwNxZ5Rg"
  },
  hoodie: {
    w: 900,
    h: 1125,
    ref: 0.9457,
    pxcm: 8.308,
    rot: 0,
    curve: 0,
    place: {
      cc: { n: "Centre chest", x: 432.7, y: 635.2, min: 10, max: 20, d: 14 },
      lc: { n: "Left chest", x: 562.5, y: 431, min: 5, max: 9, d: 8 }
    },
    credit: "https://unsplash.com/photos/kJXGTOY1wLQ"
  },
  cap: {
    w: 900,
    h: 1125,
    ref: 0.874,
    pxcm: 26.743,
    rot: 0,
    curve: 0.55,
    place: {
      fr: { n: "Front", x: 456.4, y: 462.9, min: 4, max: 11, d: 9 }
    },
    credit: "https://unsplash.com/photos/DT7ercyDWjs"
  },
  tote: {
    w: 900,
    h: 1125,
    ref: 0.7431,
    pxcm: 16.575,
    rot: 0,
    curve: 0,
    place: {
      cc: { n: "Centre", x: 451.9, y: 678.8, min: 8, max: 28, d: 22 },
      bc: { n: "Bottom corner", x: 648.8, y: 900, min: 5, max: 10, d: 7 }
    },
    credit: "https://unsplash.com/photos/smTDI-z1rlY"
  }
};

// src/render.ts
function sceneGeometry(S) {
  const a = GARMENTS[S.view], P = a.place[S.place] || Object.values(a.place)[0], D = S.D, wpx = S.size * a.pxcm, hpx = D ? wpx * D.h / D.w : wpx;
  return { a, P, wpx, hpx, cx: P.x + S.off[0], cy: P.y + S.off[1] };
}
var placementsOf = (view) => Object.keys(GARMENTS[view].place);
var fitSize = (box, D) => D ? Math.min(box[0], box[1] * D.w / D.h) : box[0];
function destBox(S, view) {
  const g = sceneGeometry(S), R = Math.hypot(g.wpx, g.hpx) * 0.62 + 12;
  const x0 = Math.max(0, Math.floor((g.cx - R - view.sx) * view.S)), y0 = Math.max(0, Math.floor((g.cy - R - view.sy) * view.S)), x1 = Math.min(OUT_W, Math.ceil((g.cx + R - view.sx) * view.S)), y1 = Math.min(OUT_H, Math.ceil((g.cy + R - view.sy) * view.S));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
function closeView(S, ck) {
  const g = sceneGeometry(S), a = g.a;
  const cw = clamp(g.wpx * (ck || 2.4), 170, a.w), ch = cw * 1.25, sx = clamp(g.cx - cw / 2, 0, a.w - cw), sy = clamp(g.cy - ch / 2, 0, a.h - ch);
  return { sx, sy, S: OUT_W / cw, cw, ch };
}
function stitchPixels(Sc, G, img, X0, Y0, view) {
  const D = Sc.D;
  if (!D) return;
  const g = sceneGeometry(Sc), a = g.a, W = a.w, H = a.h, wcm = Sc.size, hcm = wcm * D.h / D.w;
  const rot = (a.rot || 0) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot), curve = a.curve || 0, sc = Math.sin(curve), S = view.S;
  const foot = 1 / (a.pxcm * S), amp = clamp(1.5 - foot / 0.03, 0, 1), per = 0.045, cmPx = wcm / D.w, sdx = 0.05 / cmPx, sdy = 0.1 / cmPx;
  const cosA = D.ang.map((t) => Math.cos(t)), sinA = D.ang.map((t) => Math.sin(t)), sheen = D.ang.map((t) => 0.9 + 0.12 * Math.cos(2 * (t - LIGHT)));
  const d = img.data, IW = img.width, IH = img.height, hw = g.wpx / 2, hh = g.hpx / 2;
  const blur = G.blur, lum = G.lum, as = D.as, dmap = D.dist, idx = D.idx, near = D.near, tcol = D.tcol;
  for (let y = 0; y < IH; y++) {
    const gy = view.sy + (Y0 + y + 0.5) / S;
    for (let x = 0; x < IW; x++) {
      const gx = view.sx + (X0 + x + 0.5) / S;
      const lx = bl(blur, W, H, gx + 2, gy) - bl(blur, W, H, gx - 2, gy), ly = bl(blur, W, H, gx, gy + 2) - bl(blur, W, H, gx, gy - 2);
      const ux = gx - g.cx - lx * DISP, uy = gy - g.cy - ly * DISP;
      let u = (cr * ux + sr * uy) / hw, v = (-sr * ux + cr * uy) / hh;
      if (curve) {
        const t = u * sc;
        if (t <= -1 || t >= 1) continue;
        u = Math.asin(t) / curve;
        v -= (1 - Math.cos(u * curve)) * 0.16;
      }
      if (u < -1.2 || u > 1.2 || v < -1.2 || v > 1.2) continue;
      const du = (u + 1) * 0.5 * D.w - 0.5, dv = (v + 1) * 0.5 * D.h - 0.5, al = blz(as, D.w, D.h, du, dv), sh = blz(as, D.w, D.h, du - sdx, dv - sdy);
      if (al <= 4e-3 && sh <= 4e-3) continue;
      const j = (y * IW + x) * 4, Lf = bl(lum, W, H, gx, gy) / a.ref, fs = Lf < 0.4 ? 0.4 : Lf > 1.1 ? 1.1 : Lf, shd = 1 - 0.4 * sh * (1 - al);
      let r = d[j] * shd, gg = d[j + 1] * shd, b = d[j + 2] * shd;
      if (al > 4e-3) {
        const ii = clamp(Math.round(du), 0, D.w - 1) + clamp(Math.round(dv), 0, D.h - 1) * D.w;
        let c = idx[ii];
        if (c === 255) c = near[ii];
        const xc = u * wcm * 0.5, yc = v * hcm * 0.5, s = (xc * cosA[c] + yc * sinA[c]) / per, ridge = 0.5 - 0.5 * Math.cos(6.2832 * s);
        const dist = bl(dmap, D.w, D.h, du, dv) * cmPx, edge = dist < 0.1 ? 0.72 + 2.8 * dist : 1;
        const k = (1 + amp * 0.3 * (ridge - 0.5)) * sheen[c] * edge * (0.52 + 0.5 * fs) * 1.05, t = tcol[c];
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
var stitchCount = (S) => {
  const D = S.D;
  if (!D) return 0;
  return Math.round(S.size * S.size * D.h / D.w * D.cov * 165 / 100) * 100;
};

// src/engine.ts
var DEFAULT_ANALYSE = { bgOn: true, k: 4, auto: true };
function createStitchEngine(options = {}) {
  const base0 = options.assetBase ?? "/mockups/", assetBase = base0.endsWith("/") ? base0 : base0 + "/", crossOrigin = options.crossOrigin === void 0 ? "anonymous" : options.crossOrigin, families = { ...options.fontFamilies }, fontTimeoutMs = options.fontTimeoutMs ?? 2500, cache = /* @__PURE__ */ new Map();
  const probes = [
    ...FONT_PROBES,
    ...FONT_KEYS.filter((k) => families[k] && families[k] !== FONTS[k].fam).map((k) => fontStr(k, 120, families[k]))
  ];
  const garmentUrls = (view) => ({
    photo: `${assetBase}${view}.jpg`,
    mask: `${assetBase}${view}-mask.png`
  });
  function garmentReady(view) {
    const hit = cache.get(view);
    if (hit) return hit.promise;
    const a = GARMENTS[view];
    if (!a) return Promise.reject(new Error(`@store/stitch: unknown garment view "${String(view)}"`));
    if (!hasDom())
      return Promise.reject(new Error("@store/stitch: garment photos can only be loaded in a browser"));
    const e = { promise: Promise.resolve(), data: null, base: null, baseCol: null }, u = garmentUrls(view);
    e.promise = Promise.all([loadImage(u.photo, crossOrigin), loadImage(u.mask, crossOrigin)]).then(
      ([im, mk]) => {
        const W = a.w, H = a.h, c = createCanvas(W, H), x = ctx2d(c, { willReadFrequently: true });
        x.drawImage(im, 0, 0, W, H);
        const pd = x.getImageData(0, 0, W, H).data;
        x.clearRect(0, 0, W, H);
        x.drawImage(mk, 0, 0, W, H);
        const md = x.getImageData(0, 0, W, H).data;
        e.data = prepareGarment(pd, md, W, H);
      },
      (err) => {
        cache.delete(view);
        throw err;
      }
    );
    cache.set(view, e);
    return e.promise;
  }
  function need(view) {
    const e = cache.get(view);
    if (!e || !e.data)
      throw new Error(`@store/stitch: garment "${String(view)}" is not loaded yet; await engine.garmentReady(view) first`);
    return e;
  }
  function baseFor(view, colour) {
    const o = need(view);
    if (o.base && o.baseCol === colour) return o.base;
    const gc = GC[colour];
    if (!gc) throw new Error(`@store/stitch: unknown garment colour "${String(colour)}"`);
    const a = GARMENTS[view], W = a.w, H = a.h, c = o.base || createCanvas();
    c.width = W;
    c.height = H;
    const x = ctx2d(c), img = x.createImageData(W, H);
    recolourGarment(o.data, a.ref, gc[1], img.data);
    x.putImageData(img, 0, 0);
    o.base = c;
    o.baseCol = colour;
    return c;
  }
  function renderTo(S, c, mode = "front", ck) {
    const G = need(S.view).data, g = sceneGeometry(S), a = g.a, base = baseFor(S.view, S.col);
    let view;
    if (mode === "close") {
      const cw = clamp(g.wpx * (ck || 2.4), 170, a.w), ch = cw * 1.25, sx = clamp(g.cx - cw / 2, 0, a.w - cw), sy = clamp(g.cy - ch / 2, 0, a.h - ch);
      view = { sx, sy, S: OUT_W / cw };
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
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
  function snapshot(S, mode = "front", w, ck) {
    const off = createCanvas(OUT_W, OUT_H);
    renderTo(S, ctx2d(off, { willReadFrequently: true }), mode, ck);
    if (!w) return off;
    const t = createCanvas(w, Math.round(w * 1.25)), tx = ctx2d(t);
    tx.imageSmoothingQuality = "high";
    tx.drawImage(off, 0, 0, t.width, t.height);
    return t;
  }
  const analyse = (src, opts = DEFAULT_ANALYSE) => analysePixels(pixels(src), opts);
  const analyseKnown = (src, palette) => analyseKnownPixels(pixels(src), palette);
  const designFrom = (spec) => drawDesign(spec, families);
  const hasDesign = (spec) => !!spec && (!!spec.motif && spec.motif !== "none" || !!(spec.text || "").trim());
  async function prepare(spec) {
    if (!hasDesign(spec)) return null;
    const r = await designFrom(spec);
    return analyseKnown(r.canvas, r.palette);
  }
  async function buildScene(spec) {
    if (hasDesign(spec.design) && spec.design.text) await engine.fontsLoaded();
    const [, D] = await Promise.all([garmentReady(spec.view), spec.design ? prepare(spec.design) : null]);
    const dflt = GARMENTS[spec.view].place[spec.place] ?? Object.values(GARMENTS[spec.view].place)[0];
    const size = spec.box ? fitSize(spec.box, D) : spec.size ?? dflt.d;
    return { view: spec.view, col: spec.col, place: spec.place, size, off: spec.off ?? [0, 0], D };
  }
  const engine = {
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
    fontStr: (font, px) => fontStr(font, px, families[font] ?? FONTS[font].fam)
  };
  return engine;
}

// src/samples.ts
var SAMPLE_NAMES = {
  chai: "Chai Co. badge (sample)",
  mono: "R \u2665 P monogram (sample)",
  team: "Team Titans crest (sample)"
};
var SAMPLE_KINDS = Object.keys(SAMPLE_NAMES);
function sampleLogo(kind) {
  const c = createCanvas();
  c.width = c.height = 640;
  const x = ctx2d(c);
  x.lineJoin = "round";
  x.lineCap = "round";
  x.textAlign = "center";
  const circle = (cx, cy, r, f2) => {
    x.fillStyle = f2;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  };
  if (kind === "chai") {
    circle(320, 320, 304, "#0F766E");
    circle(320, 320, 268, "#FFF3DC");
    circle(320, 320, 250, "#0F766E");
    x.fillStyle = "#FFF3DC";
    x.beginPath();
    x.moveTo(228, 190);
    x.lineTo(372, 190);
    x.quadraticCurveTo(368, 318, 300, 322);
    x.quadraticCurveTo(232, 318, 228, 190);
    x.fill();
    x.strokeStyle = "#FFF3DC";
    x.lineWidth = 16;
    x.beginPath();
    x.arc(378, 236, 30, -1.2, 1.4);
    x.stroke();
    x.fillRect(196, 330, 208, 14);
    x.strokeStyle = "#FF8A00";
    x.lineWidth = 13;
    const steam = [
      [262, 0],
      [300, -8],
      [338, 0]
    ];
    steam.forEach(([sx, o]) => {
      x.beginPath();
      x.moveTo(sx, 176 + o);
      x.bezierCurveTo(sx - 22, 150 + o, sx + 22, 128 + o, sx, 100 + o);
      x.stroke();
    });
    x.fillStyle = "#FFF3DC";
    x.font = '84px "Archivo Black", Impact, sans-serif';
    x.fillText("CHAI CO.", 320, 452);
    x.fillStyle = "#FF8A00";
    x.font = '800 32px "Plus Jakarta Sans", sans-serif';
    x.fillText("EST. 2019 \xB7 PUNE", 320, 504);
  } else if (kind === "mono") {
    x.strokeStyle = "#C99A2E";
    x.lineWidth = 7;
    x.beginPath();
    x.arc(320, 330, 262, Math.PI * 0.62, Math.PI * 1.38);
    x.stroke();
    x.beginPath();
    x.arc(320, 330, 262, -Math.PI * 0.38, Math.PI * 0.38);
    x.stroke();
    x.fillStyle = "#C99A2E";
    for (let i = 0; i < 9; i++) {
      [-1, 1].forEach((sg) => {
        const t = (sg < 0 ? Math.PI * 0.66 : -Math.PI * 0.34) + i * Math.PI * 0.075, px = 320 + Math.cos(t) * 262, py = 330 + Math.sin(t) * 262;
        x.save();
        x.translate(px, py);
        x.rotate(t + (sg < 0 ? -0.5 : 0.5));
        x.beginPath();
        x.ellipse(0, -16, 9, 20, 0, 0, Math.PI * 2);
        x.fill();
        x.restore();
      });
    }
    x.fillStyle = "#7A1F33";
    x.font = 'italic 700 260px "Playfair Display", Georgia, serif';
    x.fillText("R", 196, 410);
    x.fillText("P", 448, 410);
    x.fillStyle = "#E4007C";
    x.beginPath();
    x.moveTo(322, 352);
    x.bezierCurveTo(262, 312, 262, 248, 302, 244);
    x.bezierCurveTo(314, 243, 320, 252, 322, 262);
    x.bezierCurveTo(324, 252, 330, 243, 342, 244);
    x.bezierCurveTo(382, 248, 382, 312, 322, 352);
    x.fill();
    x.fillStyle = "#7A1F33";
    x.font = '800 30px "Plus Jakarta Sans", sans-serif';
    x.fillText("14 \xB7 02 \xB7 2027", 320, 520);
  } else {
    x.fillStyle = "#1B2A55";
    const shield = () => {
      x.beginPath();
      x.moveTo(320, 40);
      x.lineTo(560, 110);
      x.lineTo(548, 330);
      x.quadraticCurveTo(520, 500, 320, 604);
      x.quadraticCurveTo(120, 500, 92, 330);
      x.lineTo(80, 110);
      x.closePath();
    };
    shield();
    x.fill();
    x.strokeStyle = "#FFB300";
    x.lineWidth = 16;
    x.save();
    x.translate(320, 322);
    x.scale(0.88, 0.88);
    x.translate(-320, -322);
    shield();
    x.stroke();
    x.restore();
    x.fillStyle = "#FFB300";
    x.beginPath();
    x.moveTo(350, 120);
    x.lineTo(236, 330);
    x.lineTo(310, 330);
    x.lineTo(286, 468);
    x.lineTo(410, 250);
    x.lineTo(334, 250);
    x.closePath();
    x.fill();
    x.fillStyle = "#FBFBF8";
    x.fillRect(118, 356, 404, 86);
    x.fillStyle = "#1B2A55";
    x.font = '74px "Archivo Black", Impact, sans-serif';
    x.fillText("TITANS", 320, 425);
    x.fillStyle = "#FBFBF8";
    x.font = '800 34px "Plus Jakarta Sans", sans-serif';
    x.fillText("TEAM", 320, 122);
  }
  return c;
}
export {
  ANG,
  DISP,
  FONTS,
  FONT_KEYS,
  FONT_PROBES,
  GARMENTS,
  GARMENT_COLOURS,
  GARMENT_VIEWS,
  GC,
  GOOGLE_FONTS_CSS,
  HEART,
  LIGHT,
  MAX_DESIGN_PX,
  MOTIFS,
  MOTIF_KEYS,
  MOTIF_PX,
  NO_DESIGN_ERROR,
  OUT_H,
  OUT_W,
  PAISLEY,
  PAISLEY_POINTS,
  SAMPLE_KINDS,
  SAMPLE_NAMES,
  STITCH_FILTER_DEFS,
  TH,
  THREADS,
  TLAB,
  TNAME,
  TPAL,
  analyseKnownPixels,
  analysePixels,
  bl,
  blz,
  borderMedian,
  boxBlur,
  chain,
  chamfer,
  clamp,
  closeView,
  col,
  createStitchEngine,
  destBox,
  esc,
  f,
  finalize,
  fitSize,
  fontStr,
  fontsLoaded,
  garmentFringe,
  grp,
  hexRgb,
  inner,
  isAnalyseError,
  isFontKey,
  isThreadKey,
  kmeans,
  knot,
  lab,
  leaf,
  lin,
  motifColours,
  motifSvg,
  nearestThread,
  petal,
  pixels,
  placementsOf,
  prepareGarment,
  recolourGarment,
  relLum,
  run,
  sample,
  sampleLogo,
  samplePathPure,
  sceneGeometry,
  setTcol,
  shade,
  smoothIdx,
  star,
  stitchCount,
  stitchPixels,
  trimCanvas
};
//# sourceMappingURL=stitch.bundle.js.map
