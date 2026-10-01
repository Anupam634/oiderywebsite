import { describe, expect, it } from 'vitest';
import { motifColours, motifSvg } from '../src/design';
import { MOTIFS, MOTIF_KEYS, PAISLEY, PAISLEY_POINTS, grp, inner, knot, leaf, sample } from '../src/motifs';
import { samplePathPure } from '../src/svg-path';
import { TH, col } from '../src/threads';

describe('motif library', () => {
  it('lists every motif, phoolwari first', () => {
    expect(MOTIF_KEYS[0]).toBe('phoolwari');
    expect([...MOTIF_KEYS].sort()).toEqual(Object.keys(MOTIFS).sort());
  });

  it.each(MOTIF_KEYS)('%s draws SVG strings with its default colours', (k) => {
    const m = MOTIFS[k],
      parts = m.draw(m.def.map((t) => col(t)!));
    const layers = Object.values(parts).filter((v): v is string => typeof v === 'string');
    expect(layers.length).toBeGreaterThan(0);
    for (const s of layers) {
      expect(s.startsWith('<')).toBe(true);
      expect(s).not.toMatch(/undefined|NaN/);
      expect(s.split('<').length).toBe(s.split('>').length);
    }
    expect(inner(parts)).toContain('filter="url(#');
    expect(grp(parts, 'scale(2)')).toMatch(/^<g transform="scale\(2\)">/);
  });

  it('phoolwari takes an optional 4th colour for the small rose', () => {
    const three = MOTIFS.phoolwari.draw([TH.rani, TH.neel, TH.mehendi]).s!,
      four = MOTIFS.phoolwari.draw([TH.rani, TH.neel, TH.mehendi, '#123456']).s!;
    expect(three).not.toContain('#123456');
    expect(four).toContain('#123456');
    expect(four).not.toMatch(/filter=/);
  });

  it('primitives produce exact markup', () => {
    expect(knot(1, 2, 3, '#ff0000')).toBe(
      '<circle cx="1" cy="2" r="3" fill="#ff0000"/><circle cx="0.1" cy="1.04" r="1.14" fill="#fff" opacity=".55"/>',
    );
    expect(leaf(0, 0, 10, 45, '#00ff00')).toBe(
      '<g transform="translate(0 0) rotate(45)"><path d="M0 0Q5 -3.8 10 0Q5 3.8 0 0Z" fill="#00ff00"/><path d="M0 0Q5 -3.8 10 0Z" fill="#00cc00"/></g>',
    );
  });

  it('motifSvg strips knot highlights and lists the colours used', () => {
    const { svg, used } = motifSvg(
      'phoolwari',
      motifColours('phoolwari', ['rani', 'neel', 'mehendi', 'gulaab']),
    );
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="-62 -62 124 124" width="620" height="620">/,
    );
    expect(svg).not.toContain('fill="#fff"');
    expect(used).toContain('#e4007c');
    expect(used.every((h) => /^#[0-9a-f]{6}$/.test(h))).toBe(true);
  });

  it('motifColours falls back to the defaults and rejects unknown threads', () => {
    expect(motifColours('mor', undefined)).toEqual([TH.haldi, TH.neel, TH.mor]);
    expect(() => motifColours('mor', ['nope', 'neel', 'mor'])).toThrow(/unknown thread colour/);
  });
});

describe('path sampling without a DOM', () => {
  it('the pure sampler agrees with the Chromium table for the paisley', () => {
    const pts = sample(PAISLEY, 15); // no document in node → pure fallback
    expect(pts).toHaveLength(15);
    pts.forEach(([x, y], i) => {
      const [cx, cy] = PAISLEY_POINTS[i]!;
      expect(Math.hypot(x - cx, y - cy)).toBeLessThan(0.05);
    });
  });

  it('handles relative and smooth commands', () => {
    expect(samplePathPure('M0 0h10v10h-10z', 4)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(() => samplePathPure('M0 0A5 5 0 0 1 10 0', 2)).toThrow(/not supported/);
  });
});
