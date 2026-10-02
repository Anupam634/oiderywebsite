'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  COURIERS,
  PAY_METHOD_LABEL,
  RETURN_KIND_LABEL,
  RETURN_STATUS_LABEL,
  formatPhone,
  returnReason,
  type AdminReturnDetail,
  type PayMethod,
} from '@store/shared';
import { ApiError } from '@/lib/api';
import { adminApi, useAdmin } from '@/lib/admin-api';
import { media } from '@/lib/media';
import { ui } from '@/lib/store';
import { Chat } from '../icons';
import { Loading, ModalCard, PageHead, Pill, day, dayTime, rupees, useLoad } from './ui';

/* Return and exchange requests: the queue, and one request with its next steps. */

const TABS = [
  ['open', 'To do'],
  ['done', 'Done'],
  ['all', 'All'],
] as const;
const PILL: Record<string, string> = { REQUESTED: 'PENDING', APPROVED: 'IN_PRODUCTION', RECEIVED: 'IN_PRODUCTION', EXCHANGED: 'DELIVERED', REFUNDED: 'DELIVERED', REJECTED: 'CANCELLED', CANCELLED: 'CANCELLED' };

export function Returns() {
  const router = useRouter();
  const sp = useSearchParams();
  const status = (sp.get('status') ?? 'open') as 'open' | 'done' | 'all';
  const { data, error } = useLoad(() => adminApi.returns(status), [status]);
  return (
    <>
      <PageHead title="Returns & exchanges" sub={data ? `${data.length} request${data.length === 1 ? '' : 's'}` : ' '} />
      <div className="chips">
        {TABS.map(([k, l]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => router.replace(`/admin/returns?status=${k}`)}>{l}</button>)}
      </div>
      {error && <div className="note">{error}</div>}
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <div className="panel blank">{status === 'open' ? 'No requests waiting. Customers ask from their order page after delivery.' : 'Nothing here yet.'}</div>
      ) : (
        <div className="panel">
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr><th /><th>Request</th><th>Customer</th><th>Wants</th><th>Reason</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.number} onClick={() => router.push(`/admin/returns/${r.number}`)}>
                    <td><div className="stack">{r.images.map((s, i) => <img key={i} src={media(s)} alt="" />)}</div></td>
                    <td><b>{r.number}</b><div className="muted">{dayTime(r.createdAt)} · order {r.orderNumber}</div></td>
                    <td>{r.customerName}<div className="muted">{r.city} · {PAY_METHOD_LABEL[r.paymentMethod as PayMethod] ?? r.paymentMethod}</div></td>
                    <td>{RETURN_KIND_LABEL[r.kind]}<div className="muted">{r.pieces} piece{r.pieces === 1 ? '' : 's'}</div></td>
                    <td>{returnReason(r.reason)?.label ?? r.reason}</td>
                    <td><Pill v={PILL[r.status]!} text={RETURN_STATUS_LABEL[r.status]} /></td>
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

type Modal = 'approve' | 'reject' | 'pickup' | 'receive' | 'exchange' | 'refund' | null;
type Act = (fn: () => Promise<AdminReturnDetail>, ok?: string) => Promise<boolean>;

export function ReturnDetail({ number }: { number: string }) {
  const me = useAdmin();
  const { data: r, setData, error } = useLoad(() => adminApi.returnRequest(number), [number]);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <div className="note">{error}</div>;
  if (!r) return <Loading />;

  const act: Act = async (fn, ok) => {
    setBusy(true);
    try {
      setData(await fn());
      if (ok) ui.toast(ok);
      return true;
    } catch (e) {
      ui.toast(e instanceof ApiError ? e.message : 'That didn’t work');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const open = r.status === 'APPROVED' || r.status === 'RECEIVED';
  const owner = me?.role === 'OWNER';
  const why = returnReason(r.reason);

  return (
    <>
      <PageHead
        title={`${RETURN_KIND_LABEL[r.kind]} ${r.number}`}
        sub={
          <>
            <Pill v={PILL[r.status]!} text={RETURN_STATUS_LABEL[r.status]} /> <span className="muted">Asked {dayTime(r.createdAt)} · order <Link href={`/admin/orders/${r.orderNumber}`}>{r.orderNumber}</Link></span>
          </>
        }
      >
        {r.status === 'REQUESTED' && <button className="btn btn-grad" type="button" disabled={busy} onClick={() => setModal('approve')}>Approve</button>}
        {r.status === 'APPROVED' && <button className="btn btn-ink" type="button" disabled={busy} onClick={() => setModal('receive')}>Mark received</button>}
        {open && r.kind === 'EXCHANGE' && <button className="btn btn-grad" type="button" disabled={busy} onClick={() => setModal('exchange')}>Send replacement</button>}
        {open && owner && <button className={`btn ${r.kind === 'REFUND' ? 'btn-grad' : 'line'}`} type="button" disabled={busy} onClick={() => setModal('refund')}>{r.kind === 'REFUND' ? 'Refund' : 'Refund instead'}</button>}
        {r.status === 'APPROVED' && <button className="btn line" type="button" disabled={busy} onClick={() => setModal('pickup')}>{r.pickup ? 'Change pickup' : 'Add pickup'}</button>}
        {(r.status === 'REQUESTED' || r.status === 'APPROVED') && <button className="btn danger" type="button" disabled={busy} onClick={() => setModal('reject')}>Decline</button>}
      </PageHead>
      {open && r.kind === 'REFUND' && !owner && <div className="note blue" style={{ marginBottom: 14 }}>Only the owner can send refunds.</div>}

      <div className="grid2">
        <div>
          <div className="panel">
            <h2>Pieces</h2>
            <div className="pieces">
              {r.items.map((i) => (
                <div key={i.orderItemId} className="rtx-item">
                  {i.image ? <img src={media(i.image)} alt="" /> : <span />}
                  <div>
                    <b>{i.name}</b> × {i.qty}
                    <div className="muted">{i.description} · {i.sku}</div>
                    {i.exchangeLabel && <div>Send instead: <b>{i.exchangeLabel}</b>{i.stockReserved ? <span className="muted"> (set aside)</span> : null}</div>}
                    <div className="muted">Worth {rupees(i.unitRefundPaise)} a piece after discounts</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>What the customer says</h2>
            <p style={{ margin: '0 0 8px' }}><b>{why?.label ?? r.reason}</b></p>
            {r.details ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>“{r.details}”</p> : <p className="muted" style={{ margin: 0 }}>No note.</p>}
            {r.photos.length > 0 && (
              <div className="rtx-photos">
                {r.photos.map((p, n) => <a key={n} href={media(p)} target="_blank" rel="noopener"><img src={media(p)} alt={`Customer photo ${n + 1}`} /></a>)}
              </div>
            )}
          </div>
          <div className="panel">
            <h2>Progress</h2>
            <dl className="kv">
              <dt>Asked</dt><dd>{dayTime(r.createdAt)}</dd>
              {r.approvedAt && <><dt>Approved</dt><dd>{dayTime(r.approvedAt)}</dd></>}
              {r.pickup && <><dt>Pickup</dt><dd>{[r.pickup.courier, r.pickup.awb].filter(Boolean).join(' · ')}</dd></>}
              {r.receivedAt && <><dt>Received</dt><dd>{dayTime(r.receivedAt)}{r.restocked ? ' · back in stock' : ''}</dd></>}
              {r.replacement && <><dt>Replacement</dt><dd>{[r.replacement.courier, r.replacement.awb].filter(Boolean).join(' · ')}</dd></>}
              {r.refundPaise > 0 && <><dt>Refunded</dt><dd>{rupees(r.refundPaise)}{r.refundReference ? ` · ${r.refundReference}` : ''}</dd></>}
              {r.closedAt && <><dt>Closed</dt><dd>{day(r.closedAt)}</dd></>}
            </dl>
            {r.studioNote && <div className="note blue" style={{ marginTop: 10 }}>Told the customer: {r.studioNote}</div>}
          </div>
        </div>
        <div>
          <div className="panel">
            <h2>Customer</h2>
            <dl className="kv">
              <dt>Name</dt><dd>{r.customer.name}</dd>
              <dt>Mobile</dt><dd><a href={`tel:+91${r.customer.phone}`}>{formatPhone(r.customer.phone)}</a></dd>
              {r.customer.email && <><dt>Email</dt><dd><a href={`mailto:${r.customer.email}`}>{r.customer.email}</a></dd></>}
              <dt>Pickup from</dt><dd>{r.customer.address}</dd>
            </dl>
            <div className="row">
              <a className="btn btn-wa sm" href={`https://wa.me/91${r.customer.phone}?text=${encodeURIComponent(`Hi ${r.customer.name.split(' ')[0]}! About your request ${r.number}: `)}`} target="_blank" rel="noopener"><Chat />WhatsApp</a>
              <button className="btn line sm" type="button" onClick={() => { void navigator.clipboard?.writeText(`${r.customer.name}\n${r.customer.address}\n+91 ${r.customer.phone}`); ui.toast('Address copied'); }}>Copy address</button>
            </div>
          </div>
          <div className="panel">
            <h2>Money</h2>
            <dl className="kv">
              <dt>Order total</dt><dd>{rupees(r.orderTotalPaise)}</dd>
              <dt>Paid by</dt><dd>{PAY_METHOD_LABEL[r.paymentMethod as PayMethod] ?? r.paymentMethod}</dd>
              {r.orderRefundedPaise > 0 && <><dt>Refunded so far</dt><dd>{rupees(r.orderRefundedPaise)}</dd></>}
              {r.kind === 'REFUND' && <><dt>Suggested refund</dt><dd><b>{rupees(r.suggestedRefundPaise)}</b></dd></>}
              {r.refundUpi && <><dt>Refund to UPI</dt><dd>{r.refundUpi}</dd></>}
            </dl>
          </div>
        </div>
      </div>

      {modal === 'approve' && <ApproveModal r={r} act={act} onClose={() => setModal(null)} />}
      {modal === 'reject' && <RejectModal r={r} act={act} onClose={() => setModal(null)} />}
      {modal === 'pickup' && <TrackModal title="Pickup" action="pickup" r={r} act={act} onClose={() => setModal(null)} />}
      {modal === 'exchange' && <TrackModal title="Send the replacement" action="exchange" r={r} act={act} onClose={() => setModal(null)} />}
      {modal === 'receive' && <ReceiveModal r={r} act={act} onClose={() => setModal(null)} />}
      {modal === 'refund' && <RefundModal r={r} act={act} onClose={() => setModal(null)} />}
    </>
  );
}

function ApproveModal({ r, act, onClose }: { r: AdminReturnDetail; act: Act; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [courier, setCourier] = useState('');
  const [awb, setAwb] = useState('');
  return (
    <ModalCard title={`Approve ${r.number}`} onClose={onClose}>
      <div className="formgrid">
        <label className="f full"><span>What happens next <i>(sent to the customer; leave empty for the usual pickup message from Settings)</i></span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="We’ll arrange a pickup in 2–3 days…" /></label>
        <label className="f"><span>Pickup courier <i>(optional)</i></span><select value={courier} onChange={(e) => setCourier(e.target.value)}><option value="">Not booked yet</option>{COURIERS.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
        <label className="f"><span>Pickup tracking number</span><input value={awb} onChange={(e) => setAwb(e.target.value)} /></label>
      </div>
      {r.kind === 'EXCHANGE' && <p className="muted">The replacement size is set aside from stock now, so it’s there when the piece comes back.</p>}
      <div className="row">
        <button className="btn btn-grad" type="button" onClick={async () => { if (await act(() => adminApi.returnAction(r.number, 'approve', { note: note.trim() || undefined, pickupCourier: courier || undefined, pickupAwb: awb.trim() || undefined }), 'Approved: the customer has been told')) onClose(); }}>Approve</button>
        <button className="btn line" type="button" onClick={onClose}>Close</button>
      </div>
    </ModalCard>
  );
}

function RejectModal({ r, act, onClose }: { r: AdminReturnDetail; act: Act; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <ModalCard title={`Decline ${r.number}`} onClose={onClose}>
      <label className="f"><span>Why <i>(the customer sees this)</i></span><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the piece has been worn and the tags removed." /></label>
      <div className="row">
        <button className="btn danger" type="button" disabled={reason.trim().length < 5} onClick={async () => { if (await act(() => adminApi.returnAction(r.number, 'reject', { reason: reason.trim() }), 'Declined: the customer has been told')) onClose(); }}>Decline request</button>
        <button className="btn line" type="button" onClick={onClose}>Close</button>
      </div>
    </ModalCard>
  );
}

function TrackModal({ title, action, r, act, onClose }: { title: string; action: 'pickup' | 'exchange'; r: AdminReturnDetail; act: Act; onClose: () => void }) {
  const [courier, setCourier] = useState(action === 'pickup' ? (r.pickup?.courier ?? COURIERS[0]!.name) : COURIERS[0]!.name);
  const [awb, setAwb] = useState(action === 'pickup' ? (r.pickup?.awb ?? '') : '');
  return (
    <ModalCard title={title} onClose={onClose}>
      <div className="formgrid">
        <label className="f"><span>Courier</span><select value={courier} onChange={(e) => setCourier(e.target.value)}>{COURIERS.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
        <label className="f"><span>Tracking number</span><input value={awb} onChange={(e) => setAwb(e.target.value)} /></label>
      </div>
      {action === 'exchange' && <p className="muted">The customer gets a WhatsApp and email with the tracking number. This closes the request.</p>}
      <div className="row">
        <button className="btn btn-grad" type="button" disabled={awb.trim().length < 3} onClick={async () => { if (await act(() => adminApi.returnAction(r.number, action, { courier, awb: awb.trim() }), action === 'exchange' ? 'Replacement sent' : 'Pickup saved')) onClose(); }}>{action === 'exchange' ? 'Mark replacement sent' : 'Save pickup'}</button>
        <button className="btn line" type="button" onClick={onClose}>Close</button>
      </div>
    </ModalCard>
  );
}

function ReceiveModal({ r, act, onClose }: { r: AdminReturnDetail; act: Act; onClose: () => void }) {
  const [restock, setRestock] = useState(true);
  const [note, setNote] = useState('');
  return (
    <ModalCard title="The pieces are back" onClose={onClose}>
      <label className="chk"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />Put them back in stock (they’re unused and can be sold again)</label>
      <label className="f" style={{ marginTop: 10 }}><span>Note on their condition <i>(optional, the customer sees it)</i></span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Checked, all good" /></label>
      <p className="muted">{r.kind === 'EXCHANGE' ? 'Next: send the replacement.' : 'Next: send the refund.'}</p>
      <div className="row">
        <button className="btn btn-grad" type="button" onClick={async () => { if (await act(() => adminApi.returnAction(r.number, 'receive', { restock, note: note.trim() || undefined }), 'Marked as received')) onClose(); }}>Mark received</button>
        <button className="btn line" type="button" onClick={onClose}>Close</button>
      </div>
    </ModalCard>
  );
}

function RefundModal({ r, act, onClose }: { r: AdminReturnDetail; act: Act; onClose: () => void }) {
  const [amount, setAmount] = useState(String(Math.round(r.suggestedRefundPaise / 100)));
  const [method, setMethod] = useState<'GATEWAY' | 'MANUAL'>(r.paidOnline ? 'GATEWAY' : 'MANUAL');
  const [reference, setReference] = useState('');
  const paise = Math.round(Number(amount) * 100) || 0;
  const left = r.orderTotalPaise - r.orderRefundedPaise;
  return (
    <ModalCard title={`Refund ${r.number}`} onClose={onClose}>
      <div className="formgrid">
        <label className="f"><span>Amount (₹) <i>suggested {rupees(r.suggestedRefundPaise)}, up to {rupees(left)}</i></span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <div className="f">
          <span>How</span>
          {r.paidOnline && <label className="chk"><input type="radio" name="rtx-m" checked={method === 'GATEWAY'} onChange={() => setMethod('GATEWAY')} />Back to the customer’s online payment (Razorpay)</label>}
          <label className="chk"><input type="radio" name="rtx-m" checked={method === 'MANUAL'} onChange={() => setMethod('MANUAL')} />I paid it myself by UPI or bank transfer</label>
        </div>
        {method === 'MANUAL' && (
          <>
            {r.refundUpi && <div className="f full"><span>Customer’s UPI ID</span><div className="row"><b style={{ fontSize: 16 }}>{r.refundUpi}</b><button className="btn line sm" type="button" onClick={() => { void navigator.clipboard?.writeText(r.refundUpi!); ui.toast('UPI ID copied'); }}>Copy</button></div></div>}
            <label className="f full"><span>Transfer reference (UPI UTR or bank reference)</span><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 4321098765" /></label>
          </>
        )}
      </div>
      <div className="row">
        <button className="btn btn-grad" type="button" disabled={paise < 100 || paise > left || (method === 'MANUAL' && reference.trim().length < 4)} onClick={async () => { if (await act(() => adminApi.returnAction(r.number, 'refund', { amountPaise: paise, method, ...(method === 'MANUAL' ? { reference: reference.trim() } : {}) }), 'Refund recorded: the customer has been told')) onClose(); }}>Refund {paise ? rupees(paise) : ''}</button>
        <button className="btn line" type="button" onClick={onClose}>Close</button>
      </div>
    </ModalCard>
  );
}
