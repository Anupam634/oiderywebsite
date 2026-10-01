import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginView } from '@/components/account/LoginView';
import '@/styles/checkout.css';
import '@/styles/account.css';

export const metadata: Metadata = { title: 'Log in', robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="co-page">
      <div className="wrap">
        <Suspense>
          <LoginView />
        </Suspense>
      </div>
    </main>
  );
}
