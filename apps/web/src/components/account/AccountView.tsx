'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ORDER_STATUS_LABEL, formatINR, formatPhone, type AddressDto, type OrderSummaryDto } from '@store/shared';
import { api, ApiError } from '@/lib/api';
import { media } from '@/lib/media';
import { logout, setMe, useMe } from '@/lib/session';
import { ui } from '@/lib/store';
import { Plus } from '../icons';
import { AddressForm, type AddressInput } from './AddressForm';

type Tab = 'orders' | 'addresses' | 'profile';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function AccountView() {
  const router = useRouter();
  const me = useMe();
  const [tab, setTab] = useState<Tab>('orders');
  useEffect(() => {
    if (me === null) router.replace('/login?next=/account');
  }, [me, router]);
  if (!me) return <div style={{ minHeight: 400 }} aria-busy="true" />;
  const first = me.name?.trim().split(/\s+/)[0];
  return (
    <>
      <div className="acc-head">
        <div>
          <span className="kicker">My account</span>
          <h1>{first ? <>Hi, <em>{first}</em></> : <>Hi <em>there</em></>}</h1>
          <p style={{ margin: '8px 0 0', color: 'var(--ink-2)' }}>Logged in as <b>{formatPhone(me.phone)}</b></p>
        </div>
        <button className="pill" type="button" onClick={async () => { await logout(); router.replace('/'); }}>Log out</button>
      </div>
      <div className="acc-tabs" role="tablist">
        {(['orders', 'addresses', 'profile'] as const).map((t) => (
          <button key={t} className="pill" type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'orders' ? 'My orders' : t === 'addresses' ? 'Addresses' : 'Profile'}
          </button>
        ))}
      </div>
      <div className="acc-grid">
        <div>{tab === 'orders' ? <Orders /> : tab === 'addresses' ? <Addresses /> : <Profile />}</div>
        <aside className="co-card">
          <h3 style={{ fontSize: 22, margin: '0 0 8px' }}>Need help?</h3>
          <p style={{ margin: '0 0 14px', color: 'var(--ink-2)', fontSize: 14.5 }}>Questions about an order, a proof or a custom piece? The studio replies on WhatsApp, usually within the hour.</p>
          <Link className="btn btn-ink" href="/shop" style={{ width: '100%', height: 50 }}>Continue shopping</Link>
        </aside>
      </div>
    </>
  );
}

function Orders() {
  const [data, setData] = useState<{ items: OrderSummaryDto[]; total: number } | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => {
    api.myOrders(page).then(setData, () => setData({ items: [], total: 0 }));
  }, [page]);
  if (!data) return <div className="co-card" aria-busy="true" style={{ height: 200 }} />;
  if (!data.items.length)
    return (
      <div className="co-card acc-empty">
        <b>No orders yet</b>Your orders will show up here, with their stitch proofs and tracking.
        <div><Link className="btn btn-grad" href="/shop">Start shopping</Link></div>
      </div>
    );
  return (
    <div className="olist">
      {data.items.map((o) => (
        <Link key={o.number} className="ocard" href={`/account/orders/${o.number}`}>
          <div className="othumbs">{o.images.slice(0, 3).map((src, i) => <img key={i} src={media(src)} alt="" />)}</div>
          <div>
            <b>{o.number}</b>
            <small>{day(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}</small>
            <div style={{ marginTop: 6 }}><span className={`st ${o.status}`}>{ORDER_STATUS_LABEL[o.status]}</span></div>
          </div>
          <div className="ototal">{formatINR(o.totalPaise)}</div>
        </Link>
      ))}
      {data.total > 10 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
          <button className="pill" type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Newer</button>
          <button className="pill" type="button" disabled={page * 10 >= data.total} onClick={() => setPage((p) => p + 1)}>Older</button>
        </div>
      )}
    </div>
  );
}

function Addresses() {
  const [items, setItems] = useState<AddressDto[] | null>(null);
  const [editing, setEditing] = useState<AddressDto | 'new' | null>(null);
  const me = useMe();
  const load = useCallback(() => api.addresses().then(setItems, () => setItems([])), []);
  useEffect(() => void load(), [load]);
  if (!items) return <div className="co-card" aria-busy="true" style={{ height: 200 }} />;
  const save = async (a: AddressInput) => {
    if (editing === 'new') await api.addAddress(a);
    else if (editing) await api.updateAddress(editing.id, a);
    setEditing(null);
    ui.toast('Address saved');
    await load();
  };
  if (editing)
    return (
      <div className="co-card">
        <div className="co-h"><span className="n">{editing === 'new' ? '+' : '✎'}</span><h2>{editing === 'new' ? 'New address' : 'Edit address'}</h2></div>
        <AddressForm initial={editing === 'new' ? { phone: me?.phone ?? '', name: me?.name ?? '', isDefault: !items.length } : editing} onSave={save} onCancel={() => setEditing(null)} />
      </div>
    );
  return (
    <div className="addrs">
      {items.map((a) => (
        <div key={a.id} className="addr">
          <b>{a.name}</b>
          <span className="tag">{a.type[0] + a.type.slice(1).toLowerCase()}</span>
          {a.isDefault && <span className="tag def">Default</span>}
          <div>{a.line1}, {a.line2}{a.landmark ? `, ${a.landmark}` : ''}</div>
          <div>{a.city}, {a.state} {a.pincode} · {formatPhone(a.phone)}</div>
          <div className="acts">
            <button className="link" type="button" onClick={() => setEditing(a)}>Edit</button>
            {!a.isDefault && <button className="link" type="button" onClick={async () => { await api.updateAddress(a.id, { isDefault: true }); await load(); }}>Make default</button>}
            <button className="link" type="button" style={{ color: '#B91C1C' }} onClick={async () => { await api.deleteAddress(a.id); ui.toast('Address removed'); await load(); }}>Remove</button>
          </div>
        </div>
      ))}
      <button className="addr-new" type="button" onClick={() => setEditing('new')}><Plus />Add a new address</button>
    </div>
  );
}

function Profile() {
  const me = useMe();
  const [name, setName] = useState(me?.name ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  const [wa, setWa] = useState(me?.whatsappOptIn ?? true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setMsg('');
    try {
      setMe(await api.updateMe({ ...(name.trim() ? { name: name.trim() } : {}), email: email.trim(), whatsappOptIn: wa }));
      ui.toast('Profile saved');
    } catch (x) {
      setMsg(x instanceof ApiError ? x.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="co-card">
      <div className="co-h"><span className="n">✦</span><h2>Profile</h2></div>
      <div className="fgrid2">
        <label className="fld"><span>Full name</span><div className="inp"><input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div></label>
        <label className="fld"><span>Email <i>(for invoices)</i></span><div className="inp"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div></label>
        <label className="chk full"><input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} /><span>Send order updates and stitch proofs on WhatsApp</span></label>
        {msg && <p className="full" style={{ color: '#B91C1C', fontWeight: 700, margin: 0 }}>{msg}</p>}
        <div className="full"><button className="btn btn-grad" type="button" disabled={busy} onClick={save} style={{ height: 50 }}>{busy ? 'Saving…' : 'Save'}</button></div>
      </div>
    </div>
  );
}
