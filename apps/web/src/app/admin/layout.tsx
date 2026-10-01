import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import '@/styles/checkout.css';
import '@/styles/account.css';
import '@/styles/admin.css';

export const metadata: Metadata = { title: { default: 'Studio admin', template: '%s · Studio admin' }, robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
