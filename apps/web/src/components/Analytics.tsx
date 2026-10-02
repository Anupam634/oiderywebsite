'use client';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { ANALYTICS_ON, GA_ID, PIXEL_ID, track } from '@/lib/track';

/* Page views for Meta Pixel and Google Analytics, and their libraries, loaded once the page is idle so they
   never slow the shop down. Renders nothing unless an ID is set (see lib/track.ts). */
export function Analytics() {
  const path = usePathname();
  useEffect(() => {
    track.pageView(path);
  }, [path]);
  if (!ANALYTICS_ON) return null;
  return (
    <>
      {PIXEL_ID ? <Script id="meta-pixel" src="https://connect.facebook.net/en_US/fbevents.js" strategy="lazyOnload" /> : null}
      {GA_ID ? <Script id="ga4" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`} strategy="lazyOnload" /> : null}
    </>
  );
}
