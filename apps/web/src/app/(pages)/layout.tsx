import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { getCategories } from '@/lib/catalog';

export default async function PagesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header categories={await getCategories()} />
      {children}
    </>
  );
}
