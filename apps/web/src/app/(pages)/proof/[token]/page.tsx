import type { Metadata } from 'next';
import { ProofView } from '@/components/account/ProofView';
import '@/styles/checkout.css';
import '@/styles/account.css';

export const metadata: Metadata = { title: 'Your stitch proof', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function ProofPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="co-page">
      <div className="wrap">
        <ProofView token={(await params).token} />
      </div>
    </main>
  );
}
