import type { ReactNode } from 'react';
import { Analytics } from '@/components/Analytics';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { getCategories } from '@/lib/catalog';

export default async function PagesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header categories={await getCategories()} />
      {children}
      <Footer />
      <Analytics />
    </>
  );
}
