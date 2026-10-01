'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { PAY_METHOD_LABEL } from '@store/shared';
import { adminApi } from '@/lib/admin-api';
import { media } from '@/lib/media';
import { Loading, PageHead, Pill, SearchBox, dayTime, rupees, useLoad } from './ui';

const TABS = [
  ['OPEN', 'To do'],
  ['PLACED', 'New'],
  ['IN_PRODUCTION', 'Stitching'],
  ['SHIPPED', 'Shipped'],
  ['DELIVERED', 'Delivered'],
  ['PENDING_PAYMENT', 'Unpaid'],
  ['CANCELLED', 'Cancelled'],
  ['ALL', 'All'],
] as const;

export function Orders() {
  const router = useRouter();
  const sp = useSearchParams();
  const status = sp.get('status') ?? 'OPEN';
  const q = sp.get('q') ?? '';
  const page = Number(sp.get('page') ?? '1');
  const query = new URLSearchParams({ status, page: String(page), ...(q ? { q } : {}) });
  const { data, error } = useLoad(() => adminApi.orders(query), [query.toString()]);
  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    router.replace(`/admin/orders?${next}`);
  };
  return (
    <>
      <PageHead title="Orders" sub={data ? `${data.total} order${data.total === 1 ? '' : 's'}` : ' '}>
        <SearchBox value={q} onChange={(v) => go({ q: v })} placeholder="Order no., phone, name or tracking" />
      </PageHead>
      <div className="chips">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={status === k} onClick={() => go({ status: k })}>{l}</button>
        ))}
      </div>
      {error && <div className="note">{error}</div>}
      {!data ? (
        <Loading />
      ) : !data.items.length ? (
        <div className="panel blank">Nothing here right now.</div>
      ) : (
        <div className="panel">
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr><th /><th>Order</th><th>Customer</th><th>Status</th><th>Proofs</th><th>Payment</th><th className="amt">Total</th></tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.number} onClick={() => router.push(`/admin/orders/${o.number}`)}>
                    <td><div className="stack">{o.images.slice(0, 3).map((s, i) => <img key={i} src={media(s)} alt="" />)}</div></td>
                    <td><b>{o.number}</b> {o.express && <Pill v="express" text="Express" />}<div className="muted">{dayTime(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}</div></td>
                    <td>{o.customerName}<div className="muted">{o.city} · {o.phone}</div></td>
                    <td><Pill v={o.status} /></td>
                    <td>
                      {o.proofs.toMake > 0 && <Pill v="AWAITING_PROOF" text={`${o.proofs.toMake} to make`} />} {o.proofs.changes > 0 && <Pill v="CHANGES_REQUESTED" text={`${o.proofs.changes} changes`} />}{' '}
                      {o.proofs.sent > 0 && <Pill v="PROOF_SENT" text={`${o.proofs.sent} sent`} />}
                      {!o.proofs.toMake && !o.proofs.changes && !o.proofs.sent && <span className="muted">—</span>}
                    </td>
                    <td><Pill v={o.paymentState} text={o.paymentMethod === 'COD' && o.paymentState === 'COD_PENDING' ? 'COD' : undefined} /><div className="muted">{PAY_METHOD_LABEL[o.paymentMethod]}</div></td>
                    <td className="amt"><b>{rupees(o.totalPaise)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.total > data.pageSize && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="btn line sm" type="button" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>Newer</button>
              <span className="muted">Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
              <button className="btn line sm" type="button" disabled={page * data.pageSize >= data.total} onClick={() => go({ page: String(page + 1) })}>Older</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
