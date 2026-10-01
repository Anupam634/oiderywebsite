/* ---------- fonts for names ---------- */

export type FontKey = 'script' | 'classic' | 'bold' | 'hindi';

export interface FontDef {
  /** CSS font-family list */
  fam: string;
  /** CSS font-weight */
  w: number;
  /** italic */
  it?: boolean;
  /** size factor for SVG text (fonts differ in apparent size) */
  k: number;
  /** picker label */
  name: string;
  /** picker sample text */
  lbl: string;
}

export const FONTS: Readonly<Record<FontKey, FontDef>> = {
  script: { fam: 'Pacifico, cursive', w: 400, k: 1, name: 'Script', lbl: 'Aa' },
  classic: {
    fam: "'Playfair Display', Georgia, serif",
    w: 700,
    it: true,
    k: 1.1,
    name: 'Classic',
    lbl: 'Aa',
  },
  bold: { fam: "'Archivo Black', Impact, sans-serif", w: 400, k: 0.88, name: 'Bold', lbl: 'AA' },
  hindi: {
    fam: "'Yatra One', 'Noto Sans Devanagari', sans-serif",
    w: 400,
    k: 1.08,
    name: 'हिंदी',
    lbl: 'अआ',
  },
};

export const FONT_KEYS: readonly FontKey[] = ['script', 'classic', 'bold', 'hindi'];

export const isFontKey = (k: unknown): k is FontKey =>
  typeof k === 'string' && Object.prototype.hasOwnProperty.call(FONTS, k);

/** canvas `font` string for a name font at px size (fam overrides the family list, e.g. a next/font family) */
export const fontStr = (k: FontKey, px: number, fam: string = FONTS[k].fam): string => {
  const F = FONTS[k];
  return `${F.it ? 'italic ' : ''}${F.w} ${px}px ${fam}`;
};

/** the faces fontsLoaded() waits for (name fonts + the sample logos' fonts) */
export const FONT_PROBES: readonly string[] = [
  '84px "Archivo Black"',
  'italic 700 260px "Playfair Display"',
  '800 32px "Plus Jakarta Sans"',
  '120px Pacifico',
  '120px "Yatra One"',
];

/** the Google Fonts stylesheets the prototype loaded (name fonts + Plus Jakarta Sans used by the sample logos) */
export const GOOGLE_FONTS_CSS: readonly string[] = [
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Pacifico&family=Playfair+Display:ital,wght@1,700&family=Archivo+Black&family=Yatra+One&family=Mukta:wght@500;600;700;800&display=swap',
];

/**
 * Resolves once the fonts are ready, or after timeoutMs (2.5 s like the prototype) so a slow font
 * never blocks the preview. Resolves at once without a DOM (SSR).
 */
export function fontsLoaded(probes: readonly string[] = FONT_PROBES, timeoutMs = 2500): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const all = Promise.all(probes.map((f) => document.fonts.load(f))).then(
    () => undefined,
    () => undefined,
  );
  return Promise.race([all, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
