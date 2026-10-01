import { Suspense } from 'react';
import { Customers } from '@/components/admin/Simple';

export const metadata = { title: 'Customers' };

export default function CustomersPage() {
  return (
    <Suspense>
      <Customers />
    </Suspense>
  );
}
