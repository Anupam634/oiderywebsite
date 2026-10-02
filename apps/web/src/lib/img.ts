import { getImageProps } from 'next/image';
import { media } from './media';

/* Photos go through Next's image optimizer: AVIF or WebP, resized to the width the layout needs. `sizes` says how
   wide the photo shows (CSS px or vw) and the browser picks the smallest file that is sharp enough.
   Absolute URLs are optimized only for hosts listed in NEXT_PUBLIC_IMAGE_HOSTS (see next.config.ts). */

const HOSTS = (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);

function optimizable(src: string): boolean {
  if (src.startsWith('/')) return !src.startsWith('//');
  try {
    return HOSTS.includes(new URL(src).hostname);
  } catch {
    return false;
  }
}

/** Common `sizes` for the shop's layouts. */
export const SIZES = {
  /** product cards in the shop grid: 2 columns on phones, 3 on tablets, 4 on desktop */
  card: '(max-width: 760px) 48vw, (max-width: 1100px) 32vw, 300px',
  /** product cards in a sideways rail: 3, 4 or 5 across */
  rail: '(max-width: 860px) 31vw, (max-width: 1100px) 24vw, 240px',
  /** small thumbnails (bag, search, menus) */
  thumb: 72,
};

export interface PhotoOptions {
  /** how wide the photo shows: CSS px for a fixed size (gives 1x/2x files), or a `sizes` list for layouts that change */
  sizes: number | string;
  /** intrinsic size of the source (sets the aspect ratio; product photos are 4:5) */
  width?: number;
  height?: number;
  /** the page's main photo: load it first */
  priority?: boolean;
  /** above the fold but not the main photo: load now, at normal priority */
  eager?: boolean;
}

/** Props for an <img> showing a catalogue photo; spread them and add className etc. */
export function photo(path: string, alt: string, { sizes, width = 800, height = 1000, priority = false, eager = false }: PhotoOptions) {
  const src = media(path);
  const fixed = typeof sizes === 'number';
  const { props } = getImageProps({
    src,
    alt,
    width: fixed ? sizes : width,
    height: fixed ? Math.round((sizes * height) / width) : height,
    sizes: fixed ? undefined : sizes,
    unoptimized: !optimizable(src),
    loading: priority || eager ? 'eager' : 'lazy',
    fetchPriority: priority ? 'high' : undefined,
  });
  const { style: _style, ...rest } = props;
  return rest;
}
