import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { BRAND } from '@store/shared';
import { Footer } from '@/components/Footer';
import { Overlays } from '@/components/Overlays';
import { getCategories } from '@/lib/catalog';
import { fraunces, jakarta, mukta } from '@/lib/fonts';
import '@/styles/base.css';

const indexable = process.env.NEXT_PUBLIC_INDEXABLE === '1';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: `${BRAND.name} · Embroidery Studio`, template: `%s · ${BRAND.name}` },
  description: `${BRAND.tagline}. Personalise with a name, upload your logo, see it stitched before you buy.`,
  robots: indexable ? undefined : { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
  openGraph: { type: 'website', siteName: BRAND.name, images: ['/photos/og-share.jpg'] },
};
export const viewport: Viewport = { themeColor: '#1B1030' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const categories = await getCategories();
  return (
    <html lang="en-IN" className={`js ${fraunces.variable} ${jakarta.variable} ${mukta.variable}`}>
      <body>
        {children}
        <Footer />
        <Overlays categories={categories} />
      </body>
    </html>
  );
}
