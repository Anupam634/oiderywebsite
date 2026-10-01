import type { MetadataRoute } from 'next';

/* Search engines stay out until launch (NEXT_PUBLIC_INDEXABLE=1), and always out of private pages. */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  if (process.env.NEXT_PUBLIC_INDEXABLE !== '1') return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/account', '/checkout', '/login', '/proof', '/api'] },
    sitemap: `${site}/sitemap.xml`,
  };
}
