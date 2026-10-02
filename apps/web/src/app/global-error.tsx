'use client';
import { useEffect } from 'react';
import { reportError } from '@/lib/report';

/** last resort when even the root layout fails */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error.digest) reportError(error);
  }, [error]);
  return (
    <html lang="en-IN">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#FFF8EE', fontFamily: 'system-ui, sans-serif', color: '#1B1030' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 30 }}>Something went wrong</h1>
          <p>Please try again in a moment.</p>
          <button type="button" onClick={reset} style={{ padding: '12px 22px', borderRadius: 999, border: 0, background: '#E4007C', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
