'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  COURIERS,
  FLOWER_PRESETS,
  FONT_LABEL,
  PAY_METHOD_LABEL,
  PRODUCTION_LABEL,
  THREAD_LABEL,
  formatPhone,
  formatRate,
  type AdminOrderDetail,
  type AdminOrderItem,
  type FontKey,
  type ThreadKey,
} from '@store/shared';
import { ApiError } from '@/lib/api';
import { adminApi, useAdmin } from '@/lib/admin-api';
import { media } from '@/lib/media';
import { ui } from '@/lib/store';
import { Chat } from '../icons';
import { Loading, PageHead, Pill, dayTime, label, rupees, useLoad } from './ui';

type Modal = 'ship' | 'cancel' | 'refund' | null;

export function OrderDetail({ number }: { number: string }) {
  const me = useAdmin();
  const { data: o, setData, error } = useLoad(() => adminApi.order(number), [number]);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <div className="note">{error}</div>;
  if (!o) return <Loading />;

  /** run an admin action, show its error, keep the fresh order */
  const act = async (fn: () => Promise<AdminOrderDetail>, ok?: string) => {
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
  const canRefund = me?.role === 'OWNER' && o.payments.some((p) => p.status === 'CAPTURED') && o.refundedPaise < o.totalPaise;

  return (
    <>
      <PageHead
        title={`Order ${o.number}`}
        sub={
          <>
            <Pill v={o.status} /> <Pill v={o.paymentState} /> {o.shippingSpeed === 'EXPRESS' && <Pill v="express" text="Express" />} <span className="muted">Placed {dayTime(o.placedAt ?? o.createdAt)} · due {o.etaDate ? new Date(o.etaDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</span>
          </>
        }
      >
        {o.next.includes('IN_PRODUCTION') && <button className="btn btn-ink" type="button" disabled={busy} onClick={() => void act(() => adminApi.advance(o.number, { to: 'IN_PRODUCTION' }), 'Marked as being stitched')}>Start stitching</button>}
        {o.next.includes('SHIPPED') && <button className="btn btn-grad" type="button" disabled={busy} onClick={() => setModal('ship')}>Mark shipped</button>}
        {o.next.includes('DELIVERED') && <button className="btn btn-grad" type="button" disabled={busy} onClick={() => void act(() => adminApi.advance(o.number, { to: 'DELIVERED' }), 'Marked as delivered')}>Mark delivered</button>}
        <a className="btn line" href={`/admin/orders/${o.number}/slip`} target="_blank" rel="noopener">Print slip</a>
        {o.invoice ? (
          <a className="btn line" href={media(o.invoice.url)} target="_blank" rel="noopener">Invoice {o.invoice.number}</a>
        ) : (
          o.status !== 'CANCELLED' && o.status !== 'PENDING_PAYMENT' && <button className="btn line" type="button" disabled={busy} onClick={() => void act(() => adminApi.invoice(o.number), 'Invoice issued')}>Issue invoice</button>
        )}
        {canRefund && <button className="btn line" type="button" onClick={() => setModal('refund')}>Refund</button>}
        {o.status !== 'CANCELLED' && o.status !== 'DELIVERED' && <button className="btn danger" type="button" onClick={() => setModal('cancel')}>Cancel</button>}
      </PageHead>

      {o.status === 'CANCELLED' && <div className="note" style={{ marginBottom: 14 }}>Cancelled{o.cancelReason ? `: ${o.cancelReason}` : ''}.{o.refundedPaise ? ` Refunded ${rupees(o.refundedPaise)}.` : ''}</div>}

      <div className="grid2">
        <div>
          <div className="card">
            <h2>Pieces <span className="muted">({o.itemCount})</span></h2>
            <div className="items">
              {o.items.map((i) => (
                <Item key={i.id} i={i} busy={busy} act={act} />
              ))}
            </div>
          </div>
          <Timeline o={o} act={act} busy={busy} />
        </div>
        <div>
          <div className="card">
            <h2>Customer</h2>
            <dl className="kv">
              <dt>Name</dt><dd>{o.customer.name ?? o.ship.name}</dd>
              <dt>Mobile</dt><dd><a href={`tel:+91${o.phone}`}>{formatPhone(o.phone)}</a></dd>
              {o.email && <><dt>Email</dt><dd><a href={`mailto:${o.email}`}>{o.email}</a></dd></>}
              <dt>Orders</dt><dd>{o.customer.orders}{o.customer.codBlocked && <> · <Pill v="CANCELLED" text="COD blocked" /></>}</dd>
            </dl>
            {o.customer.notes && <div className="note info" style={{ marginBottom: 10 }}>{o.customer.notes}</div>}
            <div className="row">
              <a className="btn btn-wa sm" href={`https://wa.me/91${o.phone}?text=${encodeURIComponent(`Hi ${o.ship.name.split(' ')[0]}! About your order ${o.number}: `)}`} target="_blank" rel="noopener"><Chat />WhatsApp</a>
              <Link className="btn line sm" href={`/admin/customers/${o.customer.id}`}>Customer page</Link>
            </div>
          </div>
          <div className="card">
            <h2>Deliver to</h2>
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              <b>{o.ship.name}</b><br />{o.ship.line1}, {o.ship.line2}{o.ship.landmark ? `, ${o.ship.landmark}` : ''}<br />{o.ship.city}, {o.ship.state} {o.ship.pincode}<br />{formatPhone(o.ship.phone)}
            </p>
            <button className="btn line sm" type="button" style={{ marginTop: 10 }} onClick={() => { void navigator.clipboard?.writeText(`${o.ship.name}\n${o.ship.line1}, ${o.ship.line2}${o.ship.landmark ? `, ${o.ship.landmark}` : ''}\n${o.ship.city}, ${o.ship.state} ${o.ship.pincode}\n+91 ${o.ship.phone}`); ui.toast('Address copied'); }}>Copy address</button>
            {o.giftNote && <div className="note info" style={{ marginTop: 10 }}>Gift note: “{o.giftNote}” (hide prices on the slip)</div>}
            {o.gst && <div className="note info" style={{ marginTop: 10 }}>GST invoice for {o.gst.business} · {o.gst.gstin}</div>}
            {o.tracking && (
              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>Courier</dt><dd>{o.tracking.courier}</dd>
                {o.tracking.awb && <><dt>Tracking</dt><dd>{o.tracking.url ? <a href={o.tracking.url} target="_blank" rel="noopener">{o.tracking.awb}</a> : o.tracking.awb}</dd></>}
              </dl>
            )}
          </div>
          <div className="card">
            <h2>Payment</h2>
            <dl className="kv">
              <dt>Subtotal</dt><dd>{rupees(o.subtotalPaise)}</dd>
              {o.discountPaise > 0 && <><dt>{o.discountLabel}</dt><dd>−{rupees(o.discountPaise)}</dd></>}
              {o.upiDiscountPaise > 0 && <><dt>UPI discount</dt><dd>−{rupees(o.upiDiscountPaise)}</dd></>}
              <dt>Shipping</dt><dd>{o.shippingPaise ? rupees(o.shippingPaise) : 'Free'}{o.shippingSpeed === 'EXPRESS' ? ' (express)' : ''}</dd>
              {o.codFeePaise > 0 && <><dt>Cash handling</dt><dd>{rupees(o.codFeePaise)}</dd></>}
              <dt><b>Total</b></dt><dd><b>{rupees(o.totalPaise)}</b></dd>
              <dt>Method</dt><dd>{PAY_METHOD_LABEL[o.paymentMethod]}</dd>
              {o.refundedPaise > 0 && <><dt>Refunded</dt><dd>{rupees(o.refundedPaise)}</dd></>}
            </dl>
            {o.payments.map((p, n) => (
              <div key={n} className="muted" style={{ marginTop: 6 }}>
                {p.provider} · <Pill v={p.status === 'CAPTURED' ? 'PAID' : p.status === 'CREATED' ? 'PENDING' : p.status} text={label(p.status)} /> {p.method ? `· ${p.method}` : ''} {p.providerPaymentId ? `· ${p.providerPaymentId}` : ''}
                {p.errorReason && <div style={{ color: '#B91C1C' }}>{p.errorReason}</div>}
              </div>
            ))}
            {o.refunds.map((r, n) => (
              <div key={n} className="muted" style={{ marginTop: 6 }}>Refund {rupees(r.amountPaise)} · {label(r.status)} · {r.reason}</div>
            ))}
          </div>
          <Notes o={o} act={act} />
        </div>
      </div>

      {modal === 'ship' && <ShipModal o={o} onClose={() => setModal(null)} act={act} />}
      {modal === 'cancel' && <CancelModal o={o} onClose={() => setModal(null)} act={act} />}
      {modal === 'refund' && <RefundModal o={o} onClose={() => setModal(null)} act={act} />}
    </>
  );
}

type Act = (fn: () => Promise<AdminOrderDetail>, ok?: string) => Promise<boolean>;

function Item({ i, busy, act }: { i: AdminOrderItem; busy: boolean; act: Act }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [stitch, setStitch] = useState<File | null>(null);
  const needsProof = i.productionStatus !== 'NOT_NEEDED';
  const p = i.personalisation;
  const s = i.studio as { garment?: string; colour?: string; placement?: string; widthCm?: number; stitches?: number; source?: string; sizes?: Record<string, number>; threads?: { hex: string; name: string }[] } | null;
  const latest = i.proofs[0];
  return (
    <div className="item">
      {i.image ? <img src={media(i.image)} alt="" /> : <span />}
      <div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3>{i.name}</h3>
            <div className="muted">{i.description}</div>
          </div>
          <b>{rupees(i.qty * i.unitPricePaise + i.extraPaise)}</b>
        </div>
        <dl className="kv">
          <dt>Qty</dt><dd>{i.qty} × {rupees(i.unitPricePaise)}{i.extraPaise ? ` + ${rupees(i.extraPaise)} digitizing` : ''}</dd>
          <dt>SKU</dt><dd>{i.sku} · HSN {i.hsnCode} · GST {i.gstRule === 'threshold' ? '5% / 18% by price' : formatRate(i.gstRateBp)}</dd>
          {p && <><dt>Name</dt><dd><b style={{ fontSize: 16 }}>“{p.text}”</b> · {FONT_LABEL[p.font as FontKey] ?? p.font} font · {THREAD_LABEL[p.thread as ThreadKey] ?? p.thread} thread{p.flowers !== undefined ? ` · ${FLOWER_PRESETS[p.flowers]?.name} flowers` : ''}</dd></>}
          {i.petName && <><dt>Pet name</dt><dd><b>“{i.petName}”</b></dd></>}
          {i.giftWrap && <><dt>Gift</dt><dd>Gift wrap</dd></>}
          {s && (
            <>
              <dt>Garment</dt><dd>{s.garment} · {s.colour} · {s.placement}, {s.widthCm} cm</dd>
              <dt>Design</dt><dd>{s.source === 'upload' ? 'Customer’s logo (needs digitizing)' : 'Our motif / name'} · about {s.stitches?.toLocaleString('en-IN')} stitches</dd>
              {s.sizes && <><dt>Sizes</dt><dd>{Object.entries(s.sizes).map(([k, n]) => `${k} × ${n}`).join(', ')}</dd></>}
              {s.threads?.length ? <><dt>Threads</dt><dd className="row" style={{ gap: 8 }}>{s.threads.map((t, n) => <span key={n}><span className="sw" style={{ background: t.hex }} /> {t.name}</span>)}</dd></> : null}
            </>
          )}
        </dl>
        {i.files.length > 0 && (
          <div className="files">
            {i.files.map((f) => (
              <a key={f.id} href={media(f.url)} target="_blank" rel="noopener" download={f.kind === 'LOGO' ? f.name ?? 'logo' : undefined}>
                {f.mime.startsWith('image/') && f.mime !== 'image/svg+xml' ? <img src={media(f.url)} alt="" /> : null}
                {f.kind === 'LOGO' ? 'Logo file' : f.kind === 'PET_PHOTO' ? 'Pet photo' : f.kind === 'PREVIEW' ? 'Mockup' : label(f.kind)}
              </a>
            ))}
          </div>
        )}

        {needsProof && (
          <div style={{ marginTop: 12 }}>
            <div className="row">
              <Pill v={i.productionStatus} text={PRODUCTION_LABEL[i.productionStatus]} />
              {latest && <button className="btn line sm" type="button" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/proof/${latest.token}`); ui.toast('Proof link copied'); }}>Copy proof link</button>}
              {i.productionStatus === 'PROOF_SENT' && <button className="btn line sm" type="button" disabled={busy} onClick={() => void act(() => adminApi.itemStatus(i.id, 'APPROVED'), 'Marked approved')}>Approved on call/WhatsApp</button>}
              {i.productionStatus === 'APPROVED' && <button className="btn line sm" type="button" disabled={busy} onClick={() => void act(() => adminApi.itemStatus(i.id, 'IN_PRODUCTION'), 'Stitching started')}>Start stitching</button>}
              {i.productionStatus === 'IN_PRODUCTION' && <button className="btn line sm" type="button" disabled={busy} onClick={() => void act(() => adminApi.itemStatus(i.id, 'DONE'), 'Marked stitched')}>Stitched &amp; checked</button>}
            </div>
            {i.proofs.length > 0 && (
              <div className="proofs">
                {i.proofs.map((pr) => (
                  <a key={pr.id} className="proof" href={media(pr.imageUrl)} target="_blank" rel="noopener">
                    <img src={media(pr.imageUrl)} alt={`Proof version ${pr.version}`} />
                    <div><b>v{pr.version}</b> <Pill v={pr.status} />{pr.customerComment && <p>“{pr.customerComment}”</p>}</div>
                  </a>
                ))}
              </div>
            )}
            {['AWAITING_PROOF', 'CHANGES_REQUESTED', 'PROOF_SENT'].includes(i.productionStatus) && (
              <div className="fg" style={{ marginTop: 10 }}>
                <label className="drop full">
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  {file ? `Proof: ${file.name}` : latest ? 'Choose a new proof image' : 'Choose the proof image (a mockup or photo of the stitch-out)'}
                </label>
                <label className="f full"><span>Note for the customer <i>(optional)</i></span><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 8 cm wide, Neel thread, Classic font" /></label>
                <div className="full">
                  <button className="btn btn-grad sm" type="button" disabled={!file || busy} onClick={async () => { if (file && (await act(() => adminApi.sendProof(i.id, file, note), 'Proof sent to the customer'))) { setFile(null); setNote(''); } }}>
                    Send proof{latest ? ` v${latest.version + 1}` : ''} on WhatsApp &amp; email
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {(needsProof || i.stitchFiles.length > 0) && (
          <div style={{ marginTop: 14 }}>
            <h3>Machine files</h3>
            {i.stitchFiles.map((f) => (
              <div key={f.id} className="row" style={{ marginBottom: 8 }}>
                {f.previewUrl && <img src={media(f.previewUrl)} alt="" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 10, background: '#fff', border: '1px solid var(--line)' }} />}
                <div className="sp">
                  <b>{f.label}</b> <span className="muted">{f.format.toUpperCase()} · {f.stitches.toLocaleString('en-IN')} stitches · {f.widthMm.toFixed(0)}×{f.heightMm.toFixed(0)} mm · {f.colourChanges + 1} colour{f.colourChanges ? 's' : ''}</span>
                  <div className="row" style={{ gap: 4, marginTop: 4 }}>{f.threads.map((t, n) => <span key={n} className="sw" title={`${t.name}${t.code ? ` (${t.code})` : ''}`} style={{ background: t.hex }} />)}</div>
                </div>
                {f.pesUrl && <a className="btn btn-ink sm" href={media(f.pesUrl)} download>PES for the machine</a>}
                <a className="btn line sm" href={media(f.sourceUrl)} download>Original</a>
              </div>
            ))}
            <div className="row">
              <label className="drop" style={{ flex: 1 }}>
                <input type="file" accept=".pes,.dst,.exp,.jef,.vp3,.xxx,.pec,.u01" onChange={(e) => setStitch(e.target.files?.[0] ?? null)} />
                {stitch ? stitch.name : 'Add a PES / DST / JEF / EXP file from the digitizer'}
              </label>
              <button className="btn btn-ink sm" type="button" disabled={!stitch || busy} onClick={async () => { if (stitch && (await act(() => adminApi.addStitchFile(i.id, stitch, stitch.name.replace(/\.[^.]+$/, '')), 'Machine file added'))) setStitch(null); }}>Upload</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Timeline({ o, act, busy }: { o: AdminOrderDetail; act: Act; busy: boolean }) {
  const [msg, setMsg] = useState('');
  return (
    <div className="card">
      <h2>Timeline</h2>
      <ul className="tl2">
        {[...o.allEvents].reverse().map((e, n) => (
          <li key={n} className={e.visible ? '' : 'hid'}>
            <div>{e.message}<time>{dayTime(e.createdAt)} · {e.actor.toLowerCase()}{e.visible ? '' : ' · studio only'}</time></div>
          </li>
        ))}
      </ul>
      <div className="row" style={{ marginTop: 14 }}>
        <label className="f sp"><span>Add an update the customer sees</span><input value={msg} maxLength={300} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. Your hoodie is on the machine today!" /></label>
        <button className="btn btn-ink sm" style={{ alignSelf: 'flex-end' }} type="button" disabled={busy || msg.trim().length < 3} onClick={async () => { if (await act(() => adminApi.message(o.number, msg.trim()), 'Update added')) setMsg(''); }}>Add</button>
      </div>
    </div>
  );
}

function Notes({ o, act }: { o: AdminOrderDetail; act: Act }) {
  const [notes, setNotes] = useState(o.adminNotes ?? '');
  return (
    <div className="card">
      <h2>Studio notes</h2>
      <label className="f"><span>Only the team sees these</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thread brand codes, packing notes, call summary…" /></label>
      <button className="btn line sm" style={{ marginTop: 8 }} type="button" disabled={notes === (o.adminNotes ?? '')} onClick={() => void act(() => adminApi.notes(o.number, notes), 'Notes saved')}>Save notes</button>
    </div>
  );
}

function ModalCard({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ShipModal({ o, onClose, act }: { o: AdminOrderDetail; onClose: () => void; act: Act }) {
  const [courier, setCourier] = useState<string>('shiprocket');
  const [awb, setAwb] = useState('');
  const [url, setUrl] = useState('');
  const [force, setForce] = useState(false);
  const pending = o.items.filter((i) => !['NOT_NEEDED', 'APPROVED', 'IN_PRODUCTION', 'DONE'].includes(i.productionStatus));
  const template = COURIERS.find((c) => c.id === courier)?.track;
  return (
    <ModalCard title="Mark as shipped" onClose={onClose}>
      {pending.length > 0 && <div className="note" style={{ marginBottom: 12 }}>{pending.length} piece(s) don’t have an approved proof yet.</div>}
      <div className="fg">
        <label className="f"><span>Courier</span><select value={courier} onChange={(e) => setCourier(e.target.value)}>{COURIERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="f"><span>Tracking number (AWB)</span><input value={awb} onChange={(e) => setAwb(e.target.value)} /></label>
        <label className="f full"><span>Tracking link <i>{template ? '(filled in from the courier if empty)' : '(paste it from the courier)'}</i></span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={template ? template.replace('{awb}', awb || 'AWB') : 'https://…'} /></label>
        {pending.length > 0 && <label className="chk full"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />Ship anyway</label>}
      </div>
      <p className="muted">The customer gets a WhatsApp and email with the tracking link, and the GST invoice is issued and emailed.</p>
      <div className="row">
        <button className="btn btn-grad" type="button" disabled={(pending.length > 0 && !force)} onClick={async () => { if (await act(() => adminApi.advance(o.number, { to: 'SHIPPED', courier, awb, trackingUrl: url, force }), 'Marked as shipped')) onClose(); }}>Mark shipped</button>
        <button className="btn line" type="button" onClick={onClose}>Close</button>
      </div>
    </ModalCard>
  );
}

function CancelModal({ o, onClose, act }: { o: AdminOrderDetail; onClose: () => void; act: Act }) {
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  return (
    <ModalCard title={`Cancel ${o.number}`} onClose={onClose}>
      {o.paymentState === 'PAID' && <div className="note" style={{ marginBottom: 12 }}>The full payment of {rupees(o.totalPaise - o.refundedPaise)} will be refunded.</div>}
      <div className="fg">
        <label className="f full"><span>Reason (the customer sees this)</span><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out of stock in this colour" /></label>
        <label className="chk full"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Tell the customer on WhatsApp and email</label>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn danger" type="button" disabled={reason.trim().length < 3} onClick={async () => { if (await act(() => adminApi.cancel(o.number, reason.trim(), notify), 'Order cancelled')) onClose(); }}>Cancel order</button>
        <button className="btn line" type="button" onClick={onClose}>Keep it</button>
      </div>
    </ModalCard>
  );
}

function RefundModal({ o, onClose, act }: { o: AdminOrderDetail; onClose: () => void; act: Act }) {
  const left = o.totalPaise - o.refundedPaise;
  const [amount, setAmount] = useState(String(Math.round(left / 100)));
  const [reason, setReason] = useState('');
  const paise = Math.round(Number(amount) * 100);
  return (
    <ModalCard title="Refund" onClose={onClose}>
      <div className="fg">
        <label className="f"><span>Amount in ₹ <i>(up to {rupees(left)})</i></span><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <label className="f"><span>Reason</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Thread colour differed" /></label>
      </div>
      <p className="muted">The money goes back to the customer’s original payment method through Razorpay (5–7 working days).</p>
      <div className="row">
        <button className="btn btn-grad" type="button" disabled={!paise || paise > left || reason.trim().length < 3} onClick={async () => { if (await act(() => adminApi.refund(o.number, paise, reason.trim()), 'Refund started')) onClose(); }}>Refund {paise ? rupees(paise) : ''}</button>
        <button className="btn line" type="button" onClick={onClose}>Close</button>
      </div>
    </ModalCard>
  );
}
