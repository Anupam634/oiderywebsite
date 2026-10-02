import localFont from 'next/font/local';

/* Self-hosted, subset fonts from src/fonts (made by scripts/build-fonts.py): no request to Google at build or run
   time, and only the body and heading fonts are preloaded. */

/** Headings and prices. Weights 400–800 and optical size are variable; the SOFT axis is fixed at 100. */
export const fraunces = localFont({
  src: [
    { path: '../fonts/fraunces.woff2', weight: '400 800', style: 'normal' },
    { path: '../fonts/fraunces-italic.woff2', weight: '400 800', style: 'italic' },
  ],
  variable: '--font-fraunces',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

/** Everything else, including ₹. One variable file for weights 400–800. */
export const jakarta = localFont({
  src: '../fonts/jakarta.woff2',
  weight: '400 800',
  variable: '--font-jakarta',
  display: 'swap',
});

/** Hindi text only (it follows Jakarta in --sans), so it downloads just on pages that show Devanagari. */
export const mukta = localFont({
  src: [
    { path: '../fonts/mukta-500.woff2', weight: '500' },
    { path: '../fonts/mukta-600.woff2', weight: '600' },
    { path: '../fonts/mukta-700.woff2', weight: '700' },
    { path: '../fonts/mukta-800.woff2', weight: '800' },
  ],
  variable: '--font-mukta',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  // the Devanagari range the files hold (DEVANAGARI in scripts/build-fonts.py); next/font needs it written out here
  declarations: [{ prop: 'unicode-range', value: 'U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+25CC, U+A830-A839, U+A8E0-A8FF' }],
});
