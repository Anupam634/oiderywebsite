'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PRODUCT_TYPES, TYPE_LABEL } from '@store/shared';
import { ApiError } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { media } from '@/lib/media';
import { ui } from '@/lib/store';
import { Plus } from '../icons';
import { Loading, PageHead, Pill, SearchBox, day, rupees, useLoad } from './ui';

export function Products() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get('q') ?? '';
  const status = sp.get('status') ?? '';
  const low = sp.get('low') === '1';
  const query = new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(low ? { lowStock: 'true' } : {}) });
  const { data, error } = useLoad(() => adminApi.products(query), [query.toString()]);
  const [adding, setAdding] = useState(false);
  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    router.replace(`/admin/products?${next}`);
  };
  return (
    <>
      <PageHead title="Products" sub={data ? `${data.length} product${data.length === 1 ? '' : 's'}` : ' '}>
        <SearchBox value={q} onChange={(v) => go({ q: v })} placeholder="Name, code or SKU" />
        <button className="btn btn-grad" type="button" onClick={() => setAdding(true)}><Plus />New product</button>
      </PageHead>
      <div className="chips">
        {[['', 'All'], ['ACTIVE', 'In the shop'], ['DRAFT', 'Drafts'], ['ARCHIVED', 'Archived']].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={!low && status === k} onClick={() => go({ status: k!, low: '' })}>{l}</button>
        ))}
        <button type="button" aria-pressed={low} onClick={() => go({ low: low ? '' : '1', status: '' })}>Low stock</button>
      </div>
      {error && <div className="note">{error}</div>}
      {!data ? (
        <Loading />
      ) : (
        <div className="panel">
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th /><th>Product</th><th>Status</th><th>Type</th><th className="amt">Price</th><th className="amt">Stock</th><th>Edited</th></tr></thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} onClick={() => router.push(`/admin/products/${p.id}`)}>
                    <td><div className="stack">{p.image && <img src={media(p.image)} alt="" />}</div></td>
                    <td><b>{p.name}</b><div className="muted">{p.category} · {p.code}</div></td>
                    <td><Pill v={p.status} text={p.status === 'ACTIVE' ? 'In the shop' : undefined} /></td>
                    <td>{TYPE_LABEL[p.type as keyof typeof TYPE_LABEL] ?? p.type}</td>
                    <td className="amt"><b>{rupees(p.pricePaise)}</b>{p.mrpPaise && p.mrpPaise > p.pricePaise ? <div className="muted"><s>{rupees(p.mrpPaise)}</s></div> : null}</td>
                    <td className="amt">{p.tracked ? <Pill v={p.stock === 0 ? 'CANCELLED' : p.stock <= 2 ? 'PENDING' : 'DONE'} text={p.stock === 0 ? 'Sold out' : String(p.stock)} /> : <span className="muted">made to order</span>}</td>
                    <td className="muted">{day(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {adding && <NewProduct onClose={() => setAdding(false)} onMade={(id) => router.push(`/admin/products/${id}`)} />}
    </>
  );
}

function NewProduct({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const { data: cats } = useLoad(() => adminApi.categories(), []);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<string>('READY');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const leaves = (cats ?? []).filter((c) => c.parentId);
  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label="New product" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel">
        <h2>New product</h2>
        <div className="formgrid">
          <label className="f full"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neel Bagh Cushion Cover" /></label>
          <label className="f"><span>Category</span><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Choose…</option>{leaves.map((c) => <option key={c.id} value={c.id}>{(cats ?? []).find((p) => p.id === c.parentId)?.name} › {c.name}</option>)}</select></label>
          <label className="f"><span>Type</span><select value={type} onChange={(e) => setType(e.target.value)}>{PRODUCT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
          <label className="f"><span>Price (₹)</span><input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} /></label>
        </div>
        <p className="muted">It starts as a draft: add photos, details and stock, then put it in the shop.</p>
        <div className="row">
          <button className="btn btn-grad" type="button" disabled={busy || name.trim().length < 2 || !categoryId || !price} onClick={async () => {
            setBusy(true);
            try {
              onMade((await adminApi.createProduct({ name: name.trim(), categoryId, type, pricePaise: Number(price) * 100 })).id);
            } catch (e) {
              ui.toast(e instanceof ApiError ? e.message : 'Could not create it');
              setBusy(false);
            }
          }}>Create draft</button>
          <button className="btn line" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
