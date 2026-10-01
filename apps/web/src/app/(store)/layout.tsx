import type { ReactNode } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { Header } from '@/components/Header';
import { getCategories } from '@/lib/catalog';

/* Home and shop: phone search row + bottom tab bar. */
export default async function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="has-bnav">
      <Header categories={await getCategories()} showMobileSearch />
      {children}
      <BottomNav />
    </div>
  );
}
