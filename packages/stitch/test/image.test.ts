import { describe, expect, it } from 'vitest';
import { bl, blz, borderMedian, boxBlur, chamfer, smoothIdx } from '../src/image';

const at = (a: ArrayLike<number>, w: number, x: number, y: number) => a[y * w + x];

describe('chamfer', () => {
  it('measures distance to the nearest edge on a 5×5 single-thread grid', () => {
    const D = chamfer(new Uint8Array(25), 5, 5);
    for (let i = 0; i < 5; i++) {
      expect(at(D, 5, i, 0)).toBe(0.5);
      expect(at(D, 5, 0, i)).toBe(0.5);
      expect(at(D, 5, i, 4)).toBe(0.5);
    }
    expect(at(D, 5, 1, 1)).toBe(1.5);
    expect(at(D, 5, 2, 1)).toBe(1.5);
    expect(at(D, 5, 2, 2)).toBe(2.5);
  });

  it('is 0 on empty pixels and 0.5 where threads meet', () => {
    // 4×3: left half thread 0, right half thread 1, one empty pixel
    const idx = new Uint8Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 255]);
    const D = chamfer(idx, 4, 3);
    expect(at(D, 4, 3, 2)).toBe(0);
    expect(at(D, 4, 1, 1)).toBe(0.5); // next to thread 1
    expect(at(D, 4, 2, 1)).toBe(0.5);
  });

  it('uses 1.414 for diagonal steps', () => {
    const w = 7,
      D = chamfer(new Uint8Array(w * w), w, w);
    expect(at(D, w, 3, 3)).toBe(3.5);
    expect(at(D, w, 2, 2)).toBe(2.5);
  });
});

describe('smoothIdx', () => {
  it('removes an isolated pixel', () => {
    const idx = new Uint8Array(25).fill(1);
    idx[12] = 2;
    const out = smoothIdx(idx, 5, 5);
    expect(out[12]).toBe(1);
    expect(idx[12]).toBe(2); // input untouched
  });

  it('keeps a pixel without a 5-of-9 majority and never touches the border', () => {
    // rows alternate 0 / 1 / 255: no value reaches 5 of 9 in any window
    const w = 5,
      rows = [0, 1, 255, 0, 1],
      idx = new Uint8Array(rows.flatMap((v) => Array<number>(w).fill(v)));
    expect([...smoothIdx(idx, w, 5)]).toEqual([...idx]);
    const one = new Uint8Array(9).fill(3);
    one[0] = 7;
    expect(smoothIdx(one, 3, 3)[0]).toBe(7);
  });

  it('treats empty (255) as its own value', () => {
    const idx = new Uint8Array(25).fill(255);
    idx[12] = 0;
    expect(smoothIdx(idx, 5, 5)[12]).toBe(255);
  });
});

describe('blur + sampling', () => {
  it('boxBlur keeps a constant image constant', () => {
    const a = new Float32Array(30).fill(0.25);
    expect([...boxBlur(a, 6, 5, 2)].every((v) => Math.abs(v - 0.25) < 1e-6)).toBe(true);
  });

  it('bl interpolates and clamps; blz fades to 0 outside', () => {
    const a = new Float32Array([0, 1, 2, 3]); // 2×2
    expect(bl(a, 2, 2, 0.5, 0)).toBeCloseTo(0.5, 6);
    expect(bl(a, 2, 2, -5, -5)).toBe(0);
    expect(blz(a, 2, 2, 0, 0)).toBe(0);
    expect(blz(a, 2, 2, 1, 1)).toBe(3);
    expect(blz(a, 2, 2, 1.5, 1)).toBe(1.5);
    expect(blz(a, 2, 2, 9, 9)).toBe(0);
  });

  it('borderMedian finds the background colour', () => {
    const w = 6,
      h = 6,
      d = new Uint8ClampedArray(w * h * 4).fill(200);
    d.set([10, 20, 30, 255], (2 * w + 2) * 4); // an interior pixel does not count
    d.set([0, 0, 0, 255], 0);
    expect(borderMedian(d, w, h)).toEqual([200, 200, 200]);
  });
});
