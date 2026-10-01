import { Suspense } from 'react';
import { AdminLogin } from '@/components/admin/AdminLogin';

export const metadata = { title: 'Log in' };

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLogin />
    </Suspense>
  );
}
