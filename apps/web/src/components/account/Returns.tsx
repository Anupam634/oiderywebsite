'use client';
import { useState } from 'react';
import {
  RETURN_KIND_LABEL,
  RETURN_REASONS,
  RETURN_STATUS_LABEL,
  UPI_RE,
  formatINR,
  returnReason,
  suggestedRefund,
  type OrderDto,
  type ReturnDto,
  type ReturnKind,
  type ReturnOptions,
  type ReturnReason,
} from '@store/shared';
import { api, ApiError } from '@/lib/api';
import { media } from '@/lib/media';
import { fitForUpload } from '@/lib/shrink';
import { ui } from '@/lib/store';
import { Camera, Check, Close, Info, Swap } from '../icons';

/* Returns and exchanges on the customer's order page: the requests so far, and the form for a new one. */

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const MAX_PHOTOS = 3;

export function ReturnsSection({ order, onChange }: { order: OrderDto; onChange: (o: OrderDto) => void }) {
  const opt = order.returnOptions;
  const [form, setForm] = useState(false);
  if (!order.returns.length && !opt) return null;
  return (
    <section className="co-card rt" id="returns">
      <div className="co-h"><span className="n"><Swap /></span><h2>Returns &amp; exchanges</h2></div>
      {order.returns.map((r) => <ReturnCard key={r.number} r={r} onChange={onChange} />)}
      {opt?.open && !form && (
        <div className="rt-cta">
          <p>Not quite right? Ask for {opt.allowExchange && opt.allowRefund ? 'an exchange or a refund' : opt.allowExchange ? 'an exchange' : 'a refund'} by <b>{day(opt.until)}</b>.</p>
          <button className="btn btn-grad" type="button" onClick={() => setForm(true)}>Return or exchange</button>
        </div>
      )}
      {opt && !opt.open && Date.now() > new Date(opt.until).getTime() && <p className="rt-mut">Returns for this order closed on {day(opt.until)}.</p>}
      {form && opt && <ReturnForm order={order} opt={opt} onCancel={() => setForm(false)} onDone={(o) => { setForm(false); onChange(o); }} />}
    </section>
  );
}

const STEPS: Record<ReturnKind, string[]> = { EXCHANGE: ['Requested', 'Approved', 'Received', 'Replacement sent'], REFUND: ['Requested', 'Approved', 'Received', 'Refunded'] };
const AT: Record<ReturnDto['status'], number> = { REQUESTED: 0, APPROVED: 1, RECEIVED: 2, EXCHANGED: 3, REFUNDED: 3, REJECTED: -1, CANCELLED: -1 };

function ReturnCard({ r, onChange }: { r: ReturnDto; onChange: (o: OrderDto) => void }) {
  const [busy, setBusy] = useState(false);
  const at = AT[r.status];
  async function withdraw() {
    if (!confirm(`Withdraw request ${r.number}?`)) return;
    setBusy(true);
    try {
      onChange(await api.cancelReturn(r.number));
      ui.toast('Your request has been withdrawn');
    } catch (e) {
      ui.toast(e instanceof ApiError ? e.message : 'Could not withdraw it. Please WhatsApp us.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={`rt-card st-${r.status.toLowerCase()}`}>
      <header>
        <b>{RETURN_KIND_LABEL[r.kind]} {r.number}</b>
        <span className="rt-st">{RETURN_STATUS_LABEL[r.status]}</span>
      </header>
      {at >= 0 && (
        <ol className="rt-steps" aria-label="Request progress">
          {STEPS[r.kind].map((s, i) => <li key={s} className={i <= at ? 'ok' : ''}><i>{i <= at ? <Check strokeWidth={3} /> : i + 1}</i>{s}</li>)}
        </ol>
      )}
      <ul className="rt-items">
        {r.items.map((i) => (
          <li key={i.orderItemId}>
            {i.image ? <img src={media(i.image)} alt="" /> : <span />}
            <span><b>{i.name}</b> × {i.qty}{i.exchangeLabel && <><br /><small>Instead: {i.exchangeLabel}</small></>}</span>
          </li>
        ))}
      </ul>
      {r.studioNote && <p className="rt-note"><Info />{r.studioNote}</p>}
      <dl className="rt-kv">
        {r.pickup && <div><dt>Pickup</dt><dd>{[r.pickup.courier, r.pickup.awb].filter(Boolean).join(' · ')}</dd></div>}
        {r.replacement && <div><dt>Replacement</dt><dd>{[r.replacement.courier, r.replacement.awb].filter(Boolean).join(' · ')}</dd></div>}
        {r.refundPaise > 0 && <div><dt>Refunded</dt><dd>{formatINR(r.refundPaise)}{r.refundUpi ? ` to ${r.refundUpi}` : ' to your original payment'}</dd></div>}
        {r.refundUpi && !r.refundPaise && <div><dt>Refund to</dt><dd>{r.refundUpi}</dd></div>}
        <div><dt>Asked on</dt><dd>{day(r.createdAt)}</dd></div>
      </dl>
      {r.canCancel && <button className="btn rt-line" type="button" disabled={busy} onClick={() => void withdraw()}>Withdraw request</button>}
    </article>
  );
}

type Pick = { on: boolean; qty: number; variantId: string };

function ReturnForm({ order, opt, onCancel, onDone }: { order: OrderDto; opt: ReturnOptions; onCancel: () => void; onDone: (o: OrderDto) => void }) {
  const items = opt.items.filter((i) => i.qty > 0);
  const [picks, setPicks] = useState<Record<string, Pick>>(() =>
    Object.fromEntries(items.map((i) => [i.orderItemId, { on: items.length === 1, qty: 1, variantId: i.exchange.find((e) => !e.current)?.variantId ?? i.exchange[0]?.variantId ?? '' }])),
  );
  const [kind, setKind] = useState<ReturnKind>(opt.allowExchange ? 'EXCHANGE' : 'REFUND');
  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [details, setDetails] = useState('');
  const [upi, setUpi] = useState('');
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const chosen = items.filter((i) => picks[i.orderItemId]?.on);
  const anyCustom = chosen.some((i) => i.custom);
  const reasons = RETURN_REASONS.filter((r) => !anyCustom || r.customOk);
  const why = reason ? returnReason(reason) : undefined;
  const lines = chosen.map((i) => ({ orderItemId: i.orderItemId, qty: picks[i.orderItemId]!.qty }));
  const estimate = reason ? suggestedRefund(opt, lines, reason) : 0;
  const set = (id: string, p: Partial<Pick>) => setPicks((x) => ({ ...x, [id]: { ...x[id]!, ...p } }));

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setErr('');
    try {
      for (const f of [...files].slice(0, MAX_PHOTOS - photos.length)) {
        const fit = await fitForUpload(f, { maxPx: 2000, kind: 'photo' });
        const up = await api.upload('return', fit.blob, fit.name);
        setPhotos((p) => [...p, { id: up.id, url: URL.createObjectURL(fit.blob) }]);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'A photo didn’t upload. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setErr('');
    if (!chosen.length) return setErr('Choose the piece you want to send back');
    if (!reason) return setErr('Tell us what happened');
    if (anyCustom && !why?.customOk) return setErr('Made-for-you pieces can come back only if they arrived damaged or wrong');
    if (kind === 'EXCHANGE' && chosen.some((i) => !i.custom && !picks[i.orderItemId]!.variantId)) return setErr('Choose what you’d like instead');
    if (why?.photo && !photos.length) return setErr('Please add a photo of the problem');
    if (kind === 'REFUND' && opt.cod && !UPI_RE.test(upi.trim())) return setErr('Enter the UPI ID for your refund, like name@okbank');
    setBusy(true);
    try {
      const r = await api.requestReturn(order.number, {
        kind,
        reason,
        details: details.trim(),
        items: chosen.map((i) => ({ orderItemId: i.orderItemId, qty: picks[i.orderItemId]!.qty, ...(kind === 'EXCHANGE' && !i.custom ? { exchangeVariantId: picks[i.orderItemId]!.variantId } : {}) })),
        photos: photos.map((p) => p.id),
        ...(kind === 'REFUND' && opt.cod ? { refundUpi: upi.trim() } : {}),
      });
      ui.toast(`Request ${r.request} sent. We’ll reply within a day.`);
      onDone(r.order);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not send it. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rt-form">
      <div className="rt-q">
        <h3><span>1</span>Which piece?</h3>
        {items.map((i) => {
          const p = picks[i.orderItemId]!;
          return (
            <label key={i.orderItemId} className={`rt-pick${p.on ? ' on' : ''}`}>
              <input type="checkbox" checked={p.on} onChange={(e) => set(i.orderItemId, { on: e.target.checked })} />
              {i.image ? <img src={media(i.image)} alt="" /> : <span className="ph" />}
              <span className="nm"><b>{i.name}</b><small>{i.description}</small>{i.custom && <small className="cu">Made for you: can come back only if it arrived damaged or wrong</small>}</span>
              {i.qty > 1 && (
                <select aria-label={`How many of ${i.name}`} value={p.qty} onChange={(e) => set(i.orderItemId, { qty: Number(e.target.value), on: true })}>
                  {Array.from({ length: i.qty }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}</option>)}
                </select>
              )}
            </label>
          );
        })}
      </div>

      <div className="rt-q">
        <h3><span>2</span>What happened?</h3>
        <div className="rt-reasons" role="radiogroup" aria-label="Reason">
          {reasons.map((r) => (
            <label key={r.key} className={`rt-chip${reason === r.key ? ' on' : ''}`}>
              <input type="radio" name="rt-reason" checked={reason === r.key} onChange={() => setReason(r.key)} />{r.label}
            </label>
          ))}
        </div>
      </div>

      <div className="rt-q">
        <h3><span>3</span>What would you like?</h3>
        {opt.allowExchange && opt.allowRefund && (
          <div className="rt-kind" role="radiogroup" aria-label="Exchange or refund">
            {(['EXCHANGE', 'REFUND'] as const).map((k) => (
              <label key={k} className={`rt-chip big${kind === k ? ' on' : ''}`}>
                <input type="radio" name="rt-kind" checked={kind === k} onChange={() => setKind(k)} />
                <b>{k === 'EXCHANGE' ? 'Exchange' : 'Refund'}</b><small>{k === 'EXCHANGE' ? 'Another size, or a fresh piece' : opt.cod ? 'Paid to your UPI ID' : 'Back to your original payment'}</small>
              </label>
            ))}
          </div>
        )}
        {kind === 'EXCHANGE' &&
          chosen.map((i) =>
            i.custom ? (
              <p key={i.orderItemId} className="rt-mut"><b>{i.name}</b>: we’ll stitch it again for you.</p>
            ) : i.exchange.length ? (
              <label key={i.orderItemId} className="fld rt-sel">
                <span>{i.name}: send me instead</span>
                <div className="inp sel">
                  <select value={picks[i.orderItemId]!.variantId} onChange={(e) => set(i.orderItemId, { variantId: e.target.value })}>
                    {i.exchange.map((e) => <option key={e.variantId} value={e.variantId}>{e.current ? `${e.label} (same, a fresh piece)` : e.label}</option>)}
                  </select>
                </div>
              </label>
            ) : (
              <p key={i.orderItemId} className="rt-mut"><b>{i.name}</b>: no other size is in stock right now. Choose a refund, or WhatsApp us.</p>
            ),
          )}
        {kind === 'REFUND' && (
          <>
            {chosen.length > 0 && reason && (
              <p className="rt-est">
                Refund: <b>{formatINR(estimate)}</b>
                {why?.customerChoice && opt.feePaise > 0 ? <small> after a {formatINR(opt.feePaise)} return pickup fee</small> : null}
                <small>{opt.cod ? 'Sent to your UPI ID' : 'To your original payment'} once we’ve checked the piece (5–7 working days to reach you).</small>
              </p>
            )}
            {opt.cod && (
              <label className="fld rt-sel">
                <span>Your UPI ID for the refund</span>
                <div className="inp"><input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okbank" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" /></div>
              </label>
            )}
          </>
        )}
      </div>

      <div className="rt-q">
        <h3><span>4</span>Tell us more <small>{why?.photo ? '(a photo is needed)' : '(optional)'}</small></h3>
        <label className="fld">
          <span className="vh">Details</span>
          <div className="inp"><textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Anything that helps us: what’s wrong, the fit, the colour…" /></div>
        </label>
        <div className="rt-photos">
          {photos.map((p) => (
            <span key={p.id} className="rt-ph">
              <img src={p.url} alt="Your photo" />
              <button type="button" aria-label="Remove photo" onClick={() => setPhotos((x) => x.filter((y) => y.id !== p.id))}><Close /></button>
            </span>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className={`rt-add${uploading ? ' busy' : ''}`}>
              <input type="file" accept="image/*" multiple onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} disabled={uploading} />
              <Camera />{uploading ? 'Uploading…' : 'Add photos'}
            </label>
          )}
        </div>
      </div>

      {err && <p className="rt-err" role="alert">{err}</p>}
      <div className="rt-acts">
        <button className="btn btn-grad" type="button" disabled={busy || uploading} onClick={() => void submit()}>{busy ? 'Sending…' : 'Send request'}</button>
        <button className="btn rt-line" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
