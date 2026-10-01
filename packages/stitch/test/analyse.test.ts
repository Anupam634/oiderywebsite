import { describe, expect, it } from 'vitest';
import { analyseKnownPixels, analysePixels, finalize, isAnalyseError, kmeans, setTcol } from '../src/analyse';
import { ANG } from '../src/constants';
import { TPAL } from '../src/threads';

type V = [number, number, number];
function sampleSet(): V[] {
  const S: V[] = [];
  const centres: V[] = [
    [20, 10, -40],
    [60, 50, 30],
    [90, -5, 70],
  ];
  for (let i = 0; i < 90; i++) {
    const c = centres[i % 3]!,
      j = (i * 7) % 5;
    S.push([c[0] + j * 0.5, c[1] - j * 0.25, c[2] + (j % 2)]);
  }
  return S;
}

describe('kmeans', () => {
  it('is deterministic', () => {
    for (let k = 1; k <= 6; k++) expect(kmeans(sampleSet(), k)).toEqual(kmeans(sampleSet(), k));
  });

  it('finds the three clusters and the error drops with k', () => {
    const S = sampleSet(),
      r1 = kmeans(S, 1),
      r3 = kmeans(S, 3);
    expect(r3.sse).toBeLessThan(r1.sse * 0.01);
    const L = r3.c.map((c) => Math.round(c[0])).sort((a, b) => a - b);
    expect(L).toEqual([21, 61, 91]);
  });

  it('copes with fewer distinct samples than k', () => {
    const r = kmeans(
      [
        [1, 2, 3],
        [1, 2, 3],
      ],
      4,
    );
    expect(r.c).toHaveLength(4);
    expect(r.sse).toBe(0);
  });
});

/** w×h RGBA: white background with a red square and a navy square */
function logo(w = 60, h = 40, alpha = false) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      let c = [255, 255, 255],
        a = alpha ? 0 : 255;
      if (x >= 8 && x < 26 && y >= 10 && y < 30) ((c = [209, 31, 51]), (a = 255));
      if (x >= 34 && x < 52 && y >= 10 && y < 30) ((c = [27, 42, 85]), (a = 255));
      d.set([c[0]!, c[1]!, c[2]!, a], j);
    }
  return { d, w, h, sw: w, sh: h };
}

describe('analysePixels', () => {
  it('removes a plain background and matches threads', () => {
    const D = analysePixels(logo(), { bgOn: true, k: 4, auto: true });
    if (isAnalyseError(D)) throw new Error(D.err);
    expect(D.threads.map((t) => TPAL[t]![0]).sort()).toEqual(['Navy', 'Red']);
    expect(D.removed).toBe(true);
    expect(D.hasAlpha).toBe(false);
    expect(D.cov).toBeCloseTo((2 * 18 * 20) / (60 * 40), 1);
    expect(D.tcol).toHaveLength(D.threads.length);
    expect(D.ang).toEqual(D.threads.map((_, i) => ANG[i]));
  });

  it('keeps transparency from the source', () => {
    const D = analysePixels(logo(60, 40, true), { bgOn: true, k: 4, auto: true });
    if (isAnalyseError(D)) throw new Error(D.err);
    expect(D.hasAlpha).toBe(true);
    expect(D.threads).toHaveLength(2);
  });

  it('reports an empty image', () => {
    const w = 20,
      h = 20,
      d = new Uint8ClampedArray(w * h * 4).fill(255);
    const r = analysePixels({ d, w, h, sw: w, sh: h }, { bgOn: true });
    expect(isAnalyseError(r) && r.err).toMatch(/couldn’t find a design/);
  });
});

describe('analyseKnownPixels + finalize', () => {
  it('maps pixels to the given palette', () => {
    const D = analyseKnownPixels(logo(60, 40, true), ['#d11f33', '#1b2a55']);
    expect(D.threads.map((t) => TPAL[t]![0])).toEqual(['Red', 'Navy']);
    expect(D.count0).toEqual([356, 356]); // 18×20 squares, the 3×3 majority filter rounds off the 4 corners
    expect(D.idx[15 * 60 + 15]).toBe(0);
    expect(D.idx[15 * 60 + 40]).toBe(1);
    expect(D.idx[0]).toBe(255);
  });

  it('merges to at most 6 threads', () => {
    const pal = TPAL.slice(0, 10).map(([, h]) => h);
    expect(analyseKnownPixels(logo(60, 40, true), pal).threads.length).toBeLessThanOrEqual(6);
  });

  it('finalize applies dropped threads; near points empty pixels at a neighbour', () => {
    const D = analyseKnownPixels(logo(60, 40, true), ['#d11f33', '#1b2a55']);
    const cov = D.cov;
    expect(D.near[15 * 60 + 7]).toBe(0); // just left of the red square
    D.drop.add(1);
    finalize(D);
    setTcol(D);
    expect(D.cov).toBeCloseTo(cov / 2, 6);
    expect(D.idx[15 * 60 + 40]).toBe(255);
  });
});
