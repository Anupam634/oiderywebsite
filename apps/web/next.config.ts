import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@store/shared', '@store/stitch'],
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  images: { formats: ['image/avif', 'image/webp'] },
};

export default config;
