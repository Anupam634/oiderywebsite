import { OrderDetail } from '@/components/admin/OrderDetail';

export const metadata = { title: 'Order' };

export default async function AdminOrderPage({ params }: { params: Promise<{ number: string }> }) {
  return <OrderDetail number={decodeURIComponent((await params).number)} />;
}
