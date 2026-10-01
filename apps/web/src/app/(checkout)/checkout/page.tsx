import type { Metadata } from 'next';
import { CheckoutView } from '@/components/checkout/CheckoutView';
import { api, type Offer } from '@/lib/api';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  // offers are a nice-to-have here: checkout still works if the list can't load
  const offers: Offer[] = await api.coupons().catch(() => []);
  return <CheckoutView offers={offers} />;
}
