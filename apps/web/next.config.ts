import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
const imageHosts = (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
// analytics hosts, only when their IDs are set (see src/lib/track.ts)
const pixel = !!process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ga = !!process.env.NEXT_PUBLIC_GA_ID;
const trackScripts = [pixel && 'https://connect.facebook.net', ga && 'https://www.googletagmanager.com'].filter(Boolean).join(' ');
const trackConnect = [
  pixel && 'https://www.facebook.com https://connect.facebook.net',
  ga && 'https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com',
].filter(Boolean).join(' ');

/* Content Security Policy: our own scripts plus Razorpay's checkout (script, iframe, API calls) and, when
   switched on, Meta Pixel and Google Analytics. Next.js needs inline scripts for hydration; dev mode also
   needs eval and the HMR websocket. */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${trackScripts ? ` ${trackScripts}` : ''}${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.razorpay.com${trackConnect ? ` ${trackConnect}` : ''}${dev ? ' ws: wss:' : ''}`,
  'frame-src https://*.razorpay.com',
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const security = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  ...(dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
];

const config: NextConfig = {
  transpilePackages: ['@store/shared', '@store/stitch'],
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    // widths for full-width photos and for cards/thumbnails (sources are 800–2000 px wide)
    deviceSizes: [480, 640, 828, 1080, 1280, 1600, 1920],
    imageSizes: [64, 96, 128, 192, 256, 384],
    // product photos never change at the same address (new uploads get new names)
    minimumCacheTTL: 7 * 24 * 3600,
    // a CDN or public bucket for photos, e.g. NEXT_PUBLIC_IMAGE_HOSTS=media.example.com (see lib/img.ts)
    remotePatterns: imageHosts.map((hostname) => ({ protocol: 'https' as const, hostname })),
  },
  // a self-contained server bundle for Docker; harmless on Vercel
  output: 'standalone',
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../'),
  async headers() {
    return [
      { source: '/:path*', headers: security },
      // private pages: never cache
      { source: '/(account|checkout|admin|login|proof)/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
};

export default config;
