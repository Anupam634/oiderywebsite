import { describe, expect, it } from 'vitest';

describe('SSR safety', () => {
  it('imports without a DOM and creates an engine', async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    const S = await import('../src/index');
    const engine = S.createStitchEngine({ assetBase: '/cdn/mockups' });
    expect(engine.assetBase).toBe('/cdn/mockups/');
    expect(engine.garmentUrls('cap')).toEqual({
      photo: '/cdn/mockups/cap.jpg',
      mask: '/cdn/mockups/cap-mask.png',
    });
    expect(engine.isGarmentReady('cap')).toBe(false);
    await expect(engine.fontsLoaded()).resolves.toBeUndefined();
    await expect(engine.garmentReady('cap')).rejects.toThrow(/browser/);
    expect(() =>
      engine.snapshot({ view: 'cap', col: 'kajal', place: 'fr', size: 7, off: [0, 0], D: null }),
    ).toThrow(/browser/);
    expect(engine.fontStr('classic', 120)).toBe("italic 700 120px 'Playfair Display', Georgia, serif");
    expect(S.createStitchEngine({ fontFamilies: { script: '__Pacifico_x' } }).fontStr('script', 80)).toBe(
      '400 80px __Pacifico_x',
    );
  });
});
