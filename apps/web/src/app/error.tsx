'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import '@/styles/checkout.css';
import '@/styles/account.css';

/** shown when a page fails to render; the shopper can retry without losing their bag */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="co-page" style={{ display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="acc-card" style={{ width: 'min(560px,100%)', textAlign: 'center' }}>
        <span className="kicker">Something snagged</span>
        <h2 style={{ fontSize: 34, margin: '10px 0 8px' }}>That didn’t load</h2>
        <p>Please try again. Your bag is safe.{error.digest ? ` (ref ${error.digest})` : ''}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <button className="btn btn-grad" type="button" onClick={reset}>Try again</button>
          <Link className="btn" href="/" style={{ border: '1.5px solid var(--line)' }}>Home</Link>
        </div>
      </div>
    </main>
  );
}
