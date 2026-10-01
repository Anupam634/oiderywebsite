import Link from 'next/link';
import '@/styles/checkout.css';
import '@/styles/account.css';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="co-page" style={{ display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="acc-card" style={{ width: 'min(560px,100%)', textAlign: 'center' }}>
        <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true" style={{ margin: '0 auto 10px', display: 'block' }}>
          <circle cx="60" cy="62" r="44" fill="none" stroke="#FF8A00" strokeWidth="7" strokeDasharray="10 8" />
          <path d="M30 70q15-28 30 0t30 0" fill="none" stroke="#E4007C" strokeWidth="5" strokeLinecap="round" strokeDasharray="7 6" />
        </svg>
        <span className="kicker">404</span>
        <h2 style={{ fontSize: 36, margin: '10px 0 8px' }}>This thread came loose</h2>
        <p>We couldn’t find that page. It may have moved, or the link has a typo.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <Link className="btn btn-grad" href="/shop">Browse the shop</Link>
          <Link className="btn" href="/" style={{ border: '1.5px solid var(--line)' }}>Home</Link>
        </div>
      </div>
    </main>
  );
}
