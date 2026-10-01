'use client';
import { Archivo_Black, Pacifico, Playfair_Display, Yatra_One } from 'next/font/google';
import { createStitchEngine } from '@store/stitch';

/* The name fonts the embroidery machine files are digitized from, self-hosted by Next.js.
   The engine draws names on a canvas, so it needs the real family names next/font generates. */
const pacifico = Pacifico({ weight: '400', subsets: ['latin'], display: 'swap' });
const playfair = Playfair_Display({ weight: '700', style: 'italic', subsets: ['latin'], display: 'swap' });
const archivo = Archivo_Black({ weight: '400', subsets: ['latin'], display: 'swap' });
const yatra = Yatra_One({ weight: '400', subsets: ['devanagari', 'latin'], display: 'swap' });

export const NAME_FONT_CSS: Record<string, string> = {
  script: pacifico.style.fontFamily,
  classic: playfair.style.fontFamily,
  bold: archivo.style.fontFamily,
  hindi: yatra.style.fontFamily,
};

export const engine = createStitchEngine({ assetBase: '/mockups/', fontFamilies: NAME_FONT_CSS });
