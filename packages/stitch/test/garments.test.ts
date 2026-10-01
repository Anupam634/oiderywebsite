/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GARMENTS, GARMENT_VIEWS } from '../src/garments';
import { closeView, destBox, fitSize, placementsOf, sceneGeometry, stitchCount } from '../src/render';
import type { PreparedDesign, Scene } from '../src/types';

const MOCKUPS = fileURLToPath(new URL('../../../apps/web/public/mockups/', import.meta.url));

/** width/height from a JPEG's SOF marker */
function jpegSize(b: Buffer): [number, number] {
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1]!,
      len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error('no SOF marker');
}

describe('GARMENTS manifest', () => {
  it('has the 7 views', () => {
    expect(GARMENT_VIEWS).toEqual(['tee', 'model', 'polo', 'shirt', 'hoodie', 'cap', 'tote']);
    expect(Object.keys(GARMENTS)).toEqual([...GARMENT_VIEWS]);
  });

  it.each(GARMENT_VIEWS)('%s has sane numbers and placements', (v) => {
    const a = GARMENTS[v];
    expect([a.w, a.h]).toEqual([900, 1125]);
    expect(a.pxcm).toBeGreaterThan(0);
    expect(a.ref).toBeGreaterThan(0);
    expect(a.ref).toBeLessThanOrEqual(1);
    expect(a.credit).toMatch(/^https:\/\/unsplash\.com\/photos\//);
    const keys = placementsOf(v);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      const p = a.place[k]!;
      expect(p.n.length).toBeGreaterThan(0);
      expect(p.min).toBeLessThanOrEqual(p.d);
      expect(p.d).toBeLessThanOrEqual(p.max);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(a.w);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(a.h);
    }
  });

  it('has the expected placement keys', () => {
    expect(placementsOf('tee')).toEqual(['lc', 'cc']);
    expect(placementsOf('hoodie')).toEqual(['cc', 'lc']);
    expect(placementsOf('cap')).toEqual(['fr']);
    expect(placementsOf('tote')).toEqual(['cc', 'bc']);
    expect(placementsOf('shirt')).toEqual(['pk', 'ap']);
  });

  it.each(GARMENT_VIEWS)('%s photo and mask exist with the manifest size', (v) => {
    const jpg = readFileSync(MOCKUPS + `${v}.jpg`),
      png = readFileSync(MOCKUPS + `${v}-mask.png`);
    expect(jpg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(jpegSize(jpg)).toEqual([GARMENTS[v].w, GARMENTS[v].h]);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([GARMENTS[v].w, GARMENTS[v].h]);
    expect(existsSync(MOCKUPS + `${v}.jpg`)).toBe(true);
  });
});

describe('scene geometry', () => {
  const D = { w: 200, h: 100, cov: 0.5 } as PreparedDesign;
  const scene: Scene = { view: 'tote', col: 'natural', place: 'cc', size: 20, off: [10, -5], D };

  it('places the design at the placement plus the drag offset', () => {
    const g = sceneGeometry(scene);
    expect(g.cx).toBeCloseTo(461.9, 6);
    expect(g.cy).toBeCloseTo(673.8, 6);
    expect(g.wpx).toBeCloseTo(20 * 16.575, 6);
    expect(g.hpx).toBeCloseTo(10 * 16.575, 6);
  });

  it('falls back to the first placement for an unknown key', () => {
    expect(sceneGeometry({ ...scene, place: 'fr' }).P).toBe(GARMENTS.tote.place.cc);
  });

  it('fits the design in a box like the product page', () => {
    expect(fitSize([20, 24], D)).toBe(20);
    expect(fitSize([20, 8], D)).toBe(16);
    expect(fitSize([20, 8], null)).toBe(20);
  });

  it('counts stitches and bounds the work area', () => {
    expect(stitchCount(scene)).toBe(Math.round((20 * 20 * 0.5 * 0.5 * 165) / 100) * 100);
    expect(stitchCount({ ...scene, D: null })).toBe(0);
    const b = destBox(scene, { sx: 0, sy: 0, S: 1 })!;
    expect(b.x).toBeGreaterThan(0);
    expect(b.x + b.w).toBeLessThanOrEqual(900);
    const cv = closeView(scene, 1.35);
    expect(cv.cw).toBeCloseTo(20 * 16.575 * 1.35, 6);
    expect(cv.S).toBeCloseTo(900 / cv.cw, 10);
  });
});
