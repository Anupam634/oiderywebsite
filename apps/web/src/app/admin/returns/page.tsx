import { Suspense } from 'react';
import { Returns } from '@/components/admin/Returns';

export const metadata = { title: 'Returns' };

export default function AdminReturnsPage() {
  return (
    <Suspense>
      <Returns />
    </Suspense>
  );
}
