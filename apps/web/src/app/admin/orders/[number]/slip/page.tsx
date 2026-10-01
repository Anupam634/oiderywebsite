import { Slip } from '@/components/admin/Slip';

export const metadata = { title: 'Packing slip' };

export default async function SlipPage({ params }: { params: Promise<{ number: string }> }) {
  return <Slip number={decodeURIComponent((await params).number)} />;
}
