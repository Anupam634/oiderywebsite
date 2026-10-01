import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

/* Content Security Policy: our own scripts plus Razorpay's checkout (script, iframe, API calls). Next.js
   needs inline scripts for hydration; dev mode also needs eval and the HMR websocket. */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.razorpay.com${dev ? ' ws: wss:' : ''}`,
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
  images: { formats: ['image/avif', 'image/webp'] },
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
