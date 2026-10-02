import { ReturnDetail } from '@/components/admin/Returns';

export const metadata = { title: 'Return' };

export default async function AdminReturnPage({ params }: { params: Promise<{ number: string }> }) {
  return <ReturnDetail number={decodeURIComponent((await params).number)} />;
}
