import { CustomerDetail } from '@/components/admin/Simple';

export const metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  return <CustomerDetail id={(await params).id} />;
}
