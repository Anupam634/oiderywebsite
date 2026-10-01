'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { formatPhone, type AdminCategory, type AdminCoupon } from '@store/shared';
import { ApiError } from '@/lib/api';
import { adminApi, useAdmin } from '@/lib/admin-api';
import { ui } from '@/lib/store';
import { Plus } from '../icons';
import { Loading, PageHead, Pill, SearchBox, day, rupees, useLoad } from './ui';

const err = (e: unknown) => ui.toast(e instanceof ApiError ? e.message : 'That didn’t work');

/* ---------------- categories ---------------- */
export function Categories() {
  const { data, setData } = useLoad(() => adminApi.categories(), []);
  const [edit, setEdit] = useState<Partial<AdminCategory> | null>(null);
  if (!data) return <Loading />;
  const tops = data.filter((c) => !c.parentId);
  const save = async () => {
    if (!edit) return;
    try {
      const body = { slug: edit.slug ?? '', name: edit.name ?? '', blurb: edit.blurb ?? null, image: edit.image ?? null, sortOrder: edit.sortOrder ?? 0, parentId: edit.parentId ?? null };
      setData(edit.id ? await adminApi.updateCategory(edit.id, body) : await adminApi.addCategory(body));
      setEdit(null);
      ui.toast('Saved');
    } catch (e) {
      err(e);
    }
  };
  return (
    <>
      <PageHead title="Categories" sub="The shop menu: top categories and the groups inside them.">
        <button className="btn btn-grad" type="button" onClick={() => setEdit({ sortOrder: 0, parentId: tops[0]?.id ?? null })}><Plus />New category</button>
      </PageHead>
      <div className="grid2">
        <div>
          {tops.map((t) => (
            <div key={t.id} className="card">
              <h2 style={{ justifyContent: 'space-between' }}>
                <span>{t.name} <span className="muted">/{t.slug}</span></span>
                <button className="btn line sm" type="button" onClick={() => setEdit(t)}>Edit</button>
              </h2>
              <table className="tbl">
                <tbody>
                  {data.filter((c) => c.parentId === t.id).map((c) => (
                    <tr key={c.id} onClick={() => setEdit(c)}>
                      <td><b>{c.name}</b><div className="muted">/{c.slug}</div></td>
                      <td className="num">{c.productCount} product{c.productCount === 1 ? '' : 's'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        {edit && (
          <div className="card" style={{ position: 'sticky', top: 20 }}>
            <h2>{edit.id ? `Edit ${edit.name}` : 'New category'}</h2>
            <div className="fg">
              <label className="f"><span>Name</span><input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value, ...(edit.id ? {} : { slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }) })} /></label>
              <label className="f"><span>Link</span><input value={edit.slug ?? ''} onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></label>
              <label className="f"><span>Inside</span><select value={edit.parentId ?? ''} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || null })}><option value="">(top level)</option>{tops.filter((t) => t.id !== edit.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label className="f"><span>Order</span><input inputMode="numeric" value={edit.sortOrder ?? 0} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value.replace(/\D/g, '')) })} /></label>
              <label className="f full"><span>Short line <i>(optional)</i></span><input value={edit.blurb ?? ''} onChange={(e) => setEdit({ ...edit, blurb: e.target.value || null })} /></label>
              <label className="f full"><span>Image path <i>(e.g. photos/kurta.jpg)</i></span><input value={edit.image ?? ''} onChange={(e) => setEdit({ ...edit, image: e.target.value || null })} /></label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-grad" type="button" disabled={!edit.name || !edit.slug} onClick={() => void save()}>Save</button>
              <button className="btn line" type="button" onClick={() => setEdit(null)}>Close</button>
              <span className="sp" />
              {edit.id && <button className="btn danger" type="button" onClick={async () => { try { setData(await adminApi.removeCategory(edit.id!)); setEdit(null); ui.toast('Removed'); } catch (e) { err(e); } }}>Remove</button>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------- coupons ---------------- */
const EMPTY_COUPON: Omit<AdminCoupon, 'usedCount'> = { code: '', label: '', percent: 10, maxDiscountPaise: 30_000, minSubtotalPaise: 0, firstOrderOnly: false, maxUses: null, active: true, startsAt: null, endsAt: null };

export function Coupons() {
  const { data, setData } = useLoad(() => adminApi.coupons(), []);
  const [edit, setEdit] = useState<(Omit<AdminCoupon, 'usedCount'> & { isNew?: boolean }) | null>(null);
  if (!data) return <Loading />;
  const save = async () => {
    if (!edit) return;
    const { isNew, ...c } = edit;
    try {
      setData(isNew ? await adminApi.addCoupon(c) : await adminApi.updateCoupon(c.code, { ...c, code: undefined } as never));
      setEdit(null);
      ui.toast('Saved');
    } catch (e) {
      err(e);
    }
  };
  const dateIn = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
  return (
    <>
      <PageHead title="Coupons" sub="Offers shoppers can apply at checkout. The better of a coupon and “Buy 2, get 10%” applies.">
        <button className="btn btn-grad" type="button" onClick={() => setEdit({ ...EMPTY_COUPON, isNew: true })}><Plus />New coupon</button>
      </PageHead>
      <div className="grid2">
        <div className="card">
          <table className="tbl">
            <thead><tr><th>Code</th><th>Offer</th><th>Used</th><th>Status</th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.code} onClick={() => setEdit(c)}>
                  <td><b>{c.code}</b></td>
                  <td>{c.percent}% off, up to {rupees(c.maxDiscountPaise)}<div className="muted">{c.label}{c.minSubtotalPaise ? ` · min ${rupees(c.minSubtotalPaise)}` : ''}{c.firstOrderOnly ? ' · first order' : ''}</div></td>
                  <td>{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                  <td><Pill v={c.active ? 'ACTIVE' : 'ARCHIVED'} text={c.active ? (c.endsAt && new Date(c.endsAt) < new Date() ? 'Ended' : 'On') : 'Off'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {edit && (
          <div className="card">
            <h2>{edit.isNew ? 'New coupon' : edit.code}</h2>
            <div className="fg">
              {edit.isNew && <label className="f"><span>Code</span><input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="DIWALI20" /></label>}
              <label className="f"><span>Shown as</span><input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="20% off for Diwali" /></label>
              <label className="f"><span>% off</span><input inputMode="numeric" value={edit.percent} onChange={(e) => setEdit({ ...edit, percent: Number(e.target.value.replace(/\D/g, '')) })} /></label>
              <label className="f"><span>Most it can take off (₹)</span><input inputMode="numeric" value={edit.maxDiscountPaise / 100} onChange={(e) => setEdit({ ...edit, maxDiscountPaise: Number(e.target.value.replace(/\D/g, '')) * 100 })} /></label>
              <label className="f"><span>Minimum bag (₹)</span><input inputMode="numeric" value={edit.minSubtotalPaise / 100} onChange={(e) => setEdit({ ...edit, minSubtotalPaise: Number(e.target.value.replace(/\D/g, '')) * 100 })} /></label>
              <label className="f"><span>Total uses <i>(blank = unlimited)</i></span><input inputMode="numeric" value={edit.maxUses ?? ''} onChange={(e) => setEdit({ ...edit, maxUses: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} /></label>
              <label className="f"><span>Starts</span><input type="date" value={dateIn(edit.startsAt)} onChange={(e) => setEdit({ ...edit, startsAt: e.target.value ? new Date(`${e.target.value}T00:00:00+05:30`).toISOString() : null })} /></label>
              <label className="f"><span>Ends</span><input type="date" value={dateIn(edit.endsAt)} onChange={(e) => setEdit({ ...edit, endsAt: e.target.value ? new Date(`${e.target.value}T23:59:59+05:30`).toISOString() : null })} /></label>
              <label className="chk"><input type="checkbox" checked={edit.firstOrderOnly} onChange={(e) => setEdit({ ...edit, firstOrderOnly: e.target.checked })} />First order only</label>
              <label className="chk"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Switched on</label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-grad" type="button" disabled={!edit.code || edit.label.length < 3 || !edit.percent} onClick={() => void save()}>Save</button>
              <button className="btn line" type="button" onClick={() => setEdit(null)}>Close</button>
              <span className="sp" />
              {!edit.isNew && <button className="btn danger" type="button" onClick={async () => { try { setData(await adminApi.removeCoupon(edit.code)); setEdit(null); ui.toast('Removed (used coupons are switched off instead)'); } catch (e) { err(e); } }}>Remove</button>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------- reviews ---------------- */
export function Reviews() {
  const me = useAdmin();
  const [status, setStatus] = useState<'PENDING' | 'PUBLISHED' | 'HIDDEN'>('PENDING');
  const { data, reload } = useLoad(() => adminApi.reviews(status), [status]);
  const set = async (id: string, s: string) => {
    try {
      await adminApi.setReview(id, s);
      ui.toast(s === 'PUBLISHED' ? 'Published' : 'Hidden');
      await reload();
    } catch (e) {
      err(e);
    }
  };
  return (
    <>
      <PageHead title="Reviews" sub="Reviews from verified buyers wait here until you publish them." />
      {me?.role === 'OWNER' && !!data?.samples && (
        <div className="note" style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="sp">{data.samples} demo reviews from the design phase are still showing. Remove them before launch: showing made-up reviews to real shoppers isn’t allowed.</span>
          <button className="btn danger sm" type="button" onClick={async () => { if (!confirm('Delete all demo reviews and recount ratings?')) return; try { const r = await adminApi.removeSampleReviews(); ui.toast(`Removed ${r.removed} demo reviews`); await reload(); } catch (e) { err(e); } }}>Remove demo reviews</button>
        </div>
      )}
      <div className="tabs">
        {(['PENDING', 'PUBLISHED', 'HIDDEN'] as const).map((s) => <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{s === 'PENDING' ? 'To check' : s === 'PUBLISHED' ? 'Published' : 'Hidden'}</button>)}
      </div>
      {!data ? (
        <Loading />
      ) : !data.items.length ? (
        <div className="card empty">Nothing here.</div>
      ) : (
        data.items.map((r) => (
          <div key={r.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div><b>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</b> <span className="muted">{r.productName}</span> {r.isSample && <Pill v="DRAFT" text="Demo" />}</div>
              <span className="muted">{r.authorName}{r.city ? `, ${r.city}` : ''} · {day(r.createdAt)}</span>
            </div>
            <p style={{ margin: '8px 0 12px' }}>{r.body}</p>
            <div className="row">
              {r.status !== 'PUBLISHED' && <button className="btn btn-grad sm" type="button" onClick={() => void set(r.id, 'PUBLISHED')}>Publish</button>}
              {r.status !== 'HIDDEN' && <button className="btn line sm" type="button" onClick={() => void set(r.id, 'HIDDEN')}>Hide</button>}
            </div>
          </div>
        ))
      )}
    </>
  );
}

/* ---------------- customers ---------------- */
export function Customers() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get('q') ?? '';
  const { data } = useLoad(() => adminApi.customers(new URLSearchParams(q ? { q } : {})), [q]);
  return (
    <>
      <PageHead title="Customers" sub={data ? `${data.total} customer${data.total === 1 ? '' : 's'}` : ' '}>
        <SearchBox value={q} onChange={(v) => router.replace(`/admin/customers${v ? `?q=${encodeURIComponent(v)}` : ''}`)} placeholder="Phone, name or email" />
      </PageHead>
      {!data ? (
        <Loading />
      ) : (
        <div className="card">
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th>Customer</th><th>Orders</th><th className="num">Spent</th><th>Last order</th><th>Joined</th></tr></thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/admin/customers/${c.id}`)}>
                    <td><b>{c.name ?? 'No name yet'}</b> {c.codBlocked && <Pill v="CANCELLED" text="COD blocked" />}<div className="muted">{formatPhone(c.phone)}{c.email ? ` · ${c.email}` : ''}</div></td>
                    <td>{c.orders}</td>
                    <td className="num"><b>{rupees(c.spentPaise)}</b></td>
                    <td>{day(c.lastOrderAt)}</td>
                    <td className="muted">{day(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export function CustomerDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data, reload } = useLoad(() => adminApi.customer(id), [id]);
  const [notes, setNotes] = useState<string | null>(null);
  if (!data) return <Loading />;
  const c = data.customer;
  return (
    <>
      <PageHead title={c.name ?? formatPhone(c.phone)} sub={<>{formatPhone(c.phone)}{c.email ? ` · ${c.email}` : ''} · joined {day(c.createdAt)}</>}>
        <a className="btn btn-wa" href={`https://wa.me/91${c.phone}`} target="_blank" rel="noopener">WhatsApp</a>
      </PageHead>
      <div className="grid2">
        <div className="card">
          <h2>Orders</h2>
          {data.orders.length ? (
            <table className="tbl">
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.number} onClick={() => router.push(`/admin/orders/${o.number}`)}>
                    <td><b>{o.number}</b><div className="muted">{day(o.createdAt)} · {o.itemCount} items</div></td>
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
        <div>
          <div className="card">
            <h2>Studio notes</h2>
            <label className="chk" style={{ marginBottom: 10 }}>
              <input type="checkbox" checked={c.codBlocked} onChange={async (e) => { try { await adminApi.updateCustomer(c.id, { codBlocked: e.target.checked }); await reload(); ui.toast(e.target.checked ? 'Cash on delivery blocked' : 'Cash on delivery allowed'); } catch (x) { err(x); } }} />
              Block cash on delivery (e.g. after refused parcels)
            </label>
            <label className="f"><textarea value={notes ?? c.notes ?? ''} onChange={(e) => setNotes(e.target.value)} placeholder="Preferences, sizes, past issues…" /></label>
            <button className="btn line sm" style={{ marginTop: 8 }} type="button" disabled={notes === null} onClick={async () => { try { await adminApi.updateCustomer(c.id, { notes: notes ?? '' }); setNotes(null); await reload(); ui.toast('Saved'); } catch (x) { err(x); } }}>Save notes</button>
          </div>
          <div className="card">
            <h2>Addresses</h2>
            {data.addresses.map((a) => (
              <p key={a.id} style={{ margin: '0 0 10px', lineHeight: 1.5 }}><b>{a.name}</b>{a.isDefault ? ' (default)' : ''}<br />{a.line1}, {a.line2}<br />{a.city}, {a.state} {a.pincode}</p>
            ))}
            {!data.addresses.length && <div className="muted">None saved</div>}
          </div>
        </div>
      </div>
    </>
  );
}
