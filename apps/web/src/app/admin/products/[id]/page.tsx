import { ProductEditor } from '@/components/admin/ProductEditor';

export const metadata = { title: 'Edit product' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  return <ProductEditor id={(await params).id} />;
}
