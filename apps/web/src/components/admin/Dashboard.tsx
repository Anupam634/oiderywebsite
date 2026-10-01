'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminApi, useAdmin } from '@/lib/admin-api';
import { media } from '@/lib/media';
import { Loading, PageHead, Pill, day, rupees, useLoad } from './ui';

export function Dashboard() {
  const me = useAdmin();
  const router = useRouter();
  const { data: d, error } = useLoad(() => adminApi.dashboard(), []);
  if (error) return <div className="note">{error}</div>;
  if (!d) return <Loading />;
  const max = Math.max(1, ...d.days.map((x) => x.revenuePaise));
  const hour = new Date().getHours();
  const todo = [
    { n: d.todo.proofsToMake, t: 'Proofs to make', href: '/admin/production?status=AWAITING_PROOF' },
    { n: d.todo.changesRequested, t: 'Proofs with changes', href: '/admin/production?status=CHANGES_REQUESTED' },
    { n: d.todo.toShip, t: 'Orders ready to ship', href: '/admin/orders?status=OPEN' },
    { n: d.todo.awaitingCustomer, t: 'Proofs waiting on customers', href: '/admin/production?status=PROOF_SENT' },
    { n: d.todo.reviewsToCheck, t: 'Reviews to check', href: '/admin/reviews' },
    { n: d.todo.unpaid, t: 'Checkouts waiting for payment', href: '/admin/orders?status=PENDING_PAYMENT' },
  ];
  return (
    <>
      <PageHead title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${me?.name.split(' ')[0] ?? ''}`} sub="Here’s the studio at a glance." />
      <div className="grid4">
        <div className="kpi k1"><small>Today</small><b>{rupees(d.today.revenuePaise)}</b><span>{d.today.orders} order{d.today.orders === 1 ? '' : 's'}</span></div>
        <div className="kpi k2"><small>Last 7 days</small><b>{rupees(d.week.revenuePaise)}</b><span>{d.week.orders} orders</span></div>
        <div className="kpi k3"><small>Last 30 days</small><b>{rupees(d.month.revenuePaise)}</b><span>{d.month.orders} orders</span></div>
        <div className="kpi k4"><small>Average order</small><b>{rupees(d.month.orders ? d.month.revenuePaise / d.month.orders : 0)}</b><span>last 30 days</span></div>
      </div>
      <div className="grid2" style={{ marginTop: 16 }}>
        <div>
          <div className="card">
            <h2>To do</h2>
            <div className="todo">
              {todo.map((t) => (
                <Link key={t.t} href={t.href} className={t.n ? '' : 'zero'}><b>{t.n}</b>{t.t}</Link>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Sales, last 14 days</h2>
            <div className="bars" aria-label="Revenue per day">
              {d.days.map((x) => (
                <div key={x.day} title={`${day(x.day)}: ${rupees(x.revenuePaise)} from ${x.orders} orders`}>
                  <i style={{ height: `${Math.max(2, (x.revenuePaise / max) * 100)}%` }} />
                  <small>{new Date(x.day).getDate()}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="card">
            <h2>Latest orders</h2>
            {d.recent.length ? (
              <table className="tbl">
                <tbody>
                  {d.recent.map((o) => (
                    <tr key={o.number} onClick={() => router.push(`/admin/orders/${o.number}`)}>
                      <td><div className="thumbs">{o.images.slice(0, 2).map((s, i) => <img key={i} src={media(s)} alt="" />)}</div></td>
                      <td><b>{o.number}</b><div className="muted">{o.customerName} · {o.city}</div></td>
                      <td><Pill v={o.status} /></td>
                      <td className="num"><b>{rupees(o.totalPaise)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">No orders yet</div>
            )}
          </div>
          <div className="card">
            <h2>Running low</h2>
            {d.lowStock.length ? (
              <table className="tbl">
                <tbody>
                  {d.lowStock.map((v) => (
                    <tr key={v.sku} onClick={() => router.push(`/admin/products/${v.productId}`)}>
                      <td><b>{v.name}</b><div className="muted">{v.sku}</div></td>
                      <td className="num"><Pill v={v.stock ? 'PENDING' : 'CANCELLED'} text={v.stock ? `${v.stock} left` : 'Sold out'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Stock looks healthy</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
