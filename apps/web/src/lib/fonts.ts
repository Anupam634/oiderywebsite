import { Fraunces, Mukta, Plus_Jakarta_Sans } from 'next/font/google';

/* Self-hosted at build time by Next.js (no runtime request to Google). */
export const fraunces = Fraunces({ subsets: ['latin'], style: ['normal', 'italic'], axes: ['SOFT', 'opsz'], variable: '--font-fraunces', display: 'swap' });
export const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-jakarta', display: 'swap' });
export const mukta = Mukta({ subsets: ['devanagari', 'latin'], weight: ['500', '600', '700', '800'], variable: '--font-mukta', display: 'swap' });
