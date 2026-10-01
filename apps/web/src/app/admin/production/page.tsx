import { Suspense } from 'react';
import { Production } from '@/components/admin/Production';

export const metadata = { title: 'Production' };

export default function ProductionPage() {
  return (
    <Suspense>
      <Production />
    </Suspense>
  );
}
