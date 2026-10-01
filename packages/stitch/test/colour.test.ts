import { describe, expect, it } from 'vitest';
import { esc, f, hexRgb, lab, relLum, shade } from '../src/colour';
import { GC, TH, THREADS, TNAME, TPAL, col, nearestThread } from '../src/threads';

describe('colour maths', () => {
  it('hexRgb parses #rrggbb in either case', () => {
    expect(hexRgb('#E4007C')).toEqual([228, 0, 124]);
    expect(hexRgb('#ffb300')).toEqual([255, 179, 0]);
  });

  it('lab matches the usual D65 values', () => {
    const [L, a, b] = lab(255, 0, 0);
    expect(L).toBeCloseTo(53.23, 2);
    expect(a).toBeCloseTo(80.11, 2);
    expect(b).toBeCloseTo(67.22, 2);
    expect(lab(0, 0, 0)).toEqual([0, 0, 0]);
    expect(lab(255, 255, 255)[0]).toBeCloseTo(100, 6);
  });

  it('relLum spans 0..1', () => {
    expect(relLum('#000000')).toBe(0);
    expect(relLum('#ffffff')).toBeCloseTo(1, 10);
  });

  it('shade mixes towards white or black and returns lower-case hex', () => {
    expect(shade('#E4007C', 0.5)).toBe('#f280be');
    expect(shade('#FFB300', -0.38)).toBe('#9e6f00');
    expect(shade('#3D2BD6', 0.78)).toBe('#d4d0f6');
    expect(shade('#123456', 0)).toBe('#123456');
    expect(shade('#123456', 1)).toBe('#ffffff');
    expect(shade('#123456', -1)).toBe('#000000');
  });

  it('f rounds to 2 decimals and esc escapes markup', () => {
    expect(f(1.23456)).toBe(1.23);
    expect(f(-7.005)).toBe(-7);
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('threads', () => {
  it('nearestThread maps TH.rani to the Rani thread', () => {
    expect(TPAL[nearestThread(lab(...hexRgb(TH.rani)))]![0]).toBe('Rani');
  });

  it('every TPAL colour maps to itself', () => {
    TPAL.forEach(([, hex], i) => expect(nearestThread(lab(...hexRgb(hex)))).toBe(i));
  });

  it('studio thread colours map to their namesakes', () => {
    expect(TPAL[nearestThread(lab(...hexRgb(TH.kajal)))]![0]).toBe('Kajal');
    expect(TPAL[nearestThread(lab(...hexRgb(TH.moti)))]![0]).toBe('Moti');
    expect(TPAL[nearestThread(lab(...hexRgb(TH.neel)))]![0]).toBe('Neel');
  });

  it('palette tables are consistent', () => {
    expect(TPAL).toHaveLength(23);
    expect(THREADS.map(([k]) => k).sort()).toEqual(Object.keys(TH).sort());
    expect(TNAME.mor).toBe('Mor Pankh');
    expect(GC.white[1]).toBeNull();
    expect(GC.kajal).toEqual(['Kajal black', '#1d1b21']);
  });

  it('col resolves keys and passes hex through', () => {
    expect(col('haldi')).toBe('#FFB300');
    expect(col('#abcdef')).toBe('#abcdef');
    expect(col('toString')).toBeUndefined();
    expect(col(undefined)).toBeUndefined();
  });
});
