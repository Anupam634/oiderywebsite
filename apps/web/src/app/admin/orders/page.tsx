import { Suspense } from 'react';
import { Orders } from '@/components/admin/Orders';

export const metadata = { title: 'Orders' };

export default function AdminOrdersPage() {
  return (
    <Suspense>
      <Orders />
    </Suspense>
  );
}
