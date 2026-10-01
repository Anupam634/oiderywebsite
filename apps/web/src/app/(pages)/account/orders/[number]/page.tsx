import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrderView } from '@/components/account/OrderView';
import '@/styles/checkout.css';
import '@/styles/account.css';

export const metadata: Metadata = { title: 'Your order', robots: { index: false, follow: false } };

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return (
    <main className="co-page">
      <div className="wrap">
        <Suspense>
          <OrderView number={decodeURIComponent(number)} />
        </Suspense>
      </div>
    </main>
  );
}
