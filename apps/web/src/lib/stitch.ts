'use client';
import localFont from 'next/font/local';
import { createStitchEngine } from '@store/stitch';
import { jakarta } from './fonts';
import { prepareGarmentOffThread } from './stitch-worker';

/* The name fonts the embroidery machine files are digitized from, self-hosted (src/fonts). The engine draws names
   on a canvas with the family names next/font generates, and loads each face itself (engine.fontsLoaded()), so
   none of them is preloaded: pages without a live preview never download them. */
const pacifico = localFont({ src: '../fonts/pacifico.woff2', weight: '400', display: 'swap', preload: false, adjustFontFallback: false });
const playfair = localFont({ src: '../fonts/playfair-bold-italic.woff2', weight: '700', style: 'italic', display: 'swap', preload: false, adjustFontFallback: false });
const archivo = localFont({ src: '../fonts/archivo-black.woff2', weight: '400', display: 'swap', preload: false, adjustFontFallback: false });
const yatra = localFont({ src: '../fonts/yatra-one.woff2', weight: '400', display: 'swap', preload: false, adjustFontFallback: false });

export const NAME_FONT_CSS: Record<string, string> = {
  script: pacifico.style.fontFamily,
  classic: playfair.style.fontFamily,
  bold: archivo.style.fontFamily,
  hindi: yatra.style.fontFamily,
};

export const engine = createStitchEngine({
  assetBase: '/mockups/',
  fontFamilies: NAME_FONT_CSS,
  sansFamily: jakarta.style.fontFamily,
  prepareGarment: prepareGarmentOffThread,
});
