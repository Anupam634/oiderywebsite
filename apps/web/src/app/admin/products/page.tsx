import { Suspense } from 'react';
import { Products } from '@/components/admin/Products';

export const metadata = { title: 'Products' };

export default function ProductsPage() {
  return (
    <Suspense>
      <Products />
    </Suspense>
  );
}
