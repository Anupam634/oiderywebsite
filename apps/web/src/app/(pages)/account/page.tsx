import type { Metadata } from 'next';
import { AccountView } from '@/components/account/AccountView';
import '@/styles/checkout.css';
import '@/styles/account.css';

export const metadata: Metadata = { title: 'My account', robots: { index: false, follow: false } };

export default function AccountPage() {
  return (
    <main className="co-page">
      <div className="wrap">
        <AccountView />
      </div>
    </main>
  );
}
