'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BRAND,
  ORDER_STATUS_LABEL,
  PAYMENT_STATE_LABEL,
  PAY_METHOD_LABEL,
  PRODUCTION_LABEL,
  formatINR,
  formatPhone,
  type OrderDto,
} from '@store/shared';
import { api, ApiError } from '@/lib/api';
import { media } from '@/lib/media';
import { useMe } from '@/lib/session';
import { ui } from '@/lib/store';
import { usePayment } from '../checkout/Payment';
import { Arrow, Chat, Check, Info, Truck } from '../icons';
import { ReturnsSection } from './Returns';

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const COLOURS = ['#E4007C', '#FFB300', '#00A39A', '#3D2BD6', '#FF4B2B', '#5DAA3A', '#FF8A00', '#7B2CBF'];

export function OrderView({ number }: { number: string }) {
  const router = useRouter();
  const placed = useSearchParams().get('placed') === '1';
  const me = useMe();
  const [o, setO] = useState<OrderDto | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const payment = usePayment();

  const load = useCallback(
    () =>
      api.myOrder(number).then(setO, (e) => {
        if (e instanceof ApiError && e.status === 401) router.replace(`/login?next=/account/orders/${number}`);
        else setMissing(true);
      }),
    [number, router],
  );
  useEffect(() => {
    if (me === null) router.replace(`/login?next=/account/orders/${number}`);
    else if (me) void load();
  }, [me, load, number, router]);

  const confetti = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => ({
        left: `${(Math.random() * 100).toFixed(1)}%`,
        background: COLOURS[i % COLOURS.length],
        ['--t' as string]: `${(2.6 + Math.random() * 2.4).toFixed(2)}s`,
        ['--d' as string]: `${(Math.random() * 0.9).toFixed(2)}s`,
        ['--x' as string]: `${Math.round(Math.random() * 160 - 80)}px`,
        ['--r' as string]: `${Math.round(Math.random() * 720 - 360)}deg`,
      })),
    [],
  );

  if (missing)
    return (
      <div className="co-card acc-empty" style={{ margin: '40px 0' }}>
        <b>We couldn’t find that order</b>It may belong to another account.
        <div><Link className="btn btn-grad" href="/account">My orders</Link></div>
      </div>
    );
  if (!o) return <div style={{ minHeight: 500 }} aria-busy="true" />;

  const custom = o.items.some((i) => i.productionStatus !== 'NOT_NEEDED');
  const first = o.ship.name.split(/\s+/)[0];
  const stepIndex = { PENDING_PAYMENT: -1, PLACED: 0, IN_PRODUCTION: 1, SHIPPED: 2, DELIVERED: 3, CANCELLED: -1 }[o.status];
  const steps = ['Order placed', custom ? 'Being stitched' : 'Packed', 'Shipped', 'Delivered'];
  const proofWaiting = o.items.filter((i) => i.proof && i.proof.status === 'SENT');

  async function cancel() {
    if (!o || !confirm(`Cancel order ${o.number}?${o.paymentState === 'PAID' ? ' We’ll refund the full amount.' : ''}`)) return;
    setBusy(true);
    try {
      setO(await api.cancelOrder(o.number));
      ui.toast('Your order has been cancelled');
    } catch (e) {
      ui.toast(e instanceof ApiError ? e.message : 'Could not cancel. Please WhatsApp us.');
    } finally {
      setBusy(false);
    }
  }
  async function payNow() {
    if (!o) return;
    setBusy(true);
    try {
      const outcome = await payment.open(await api.payAgain(o.number));
      if (outcome.kind === 'paid') {
        setO(outcome.order);
        ui.toast('Payment received. Thank you!');
      } else if (outcome.kind === 'failed') ui.toast(outcome.reason);
    } catch (e) {
      ui.toast(e instanceof ApiError ? e.message : 'Please try again');
      void load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {placed && o.status !== 'PENDING_PAYMENT' && o.status !== 'CANCELLED' ? (
        <section className="done" aria-live="polite">
          <div className="confetti">{confetti.map((s, i) => <i key={i} style={s} />)}</div>
          <div className="done-in">
            <svg className="okring" viewBox="0 0 120 120" aria-hidden="true">
              <defs><linearGradient id="okg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FF2E93" /><stop offset="1" stopColor="#FF8A00" /></linearGradient></defs>
              <circle cx="60" cy="60" r="43" fill="#E9F7EC" stroke="#217E36" strokeWidth="2" strokeDasharray="4 4" opacity=".7" />
              <circle className="ring" cx="60" cy="60" r="54" fill="none" stroke="url(#okg)" strokeWidth="7" strokeLinecap="round" pathLength={1} transform="rotate(-90 60 60)" />
              <path className="tick" d="M40 62l14 14 28-30" fill="none" stroke="#217E36" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
            </svg>
            <span className="kicker">Order placed</span>
            <h1>Thank you, <em>{first}!</em></h1>
            <p className="lead">
              Order <b>{o.number}</b> is confirmed{o.paymentState === 'PAID' ? ' and paid' : ''}. {custom ? 'We’ll send your stitch proof within 24 hours.' : 'We’ll pack it with a handwritten note within 1–2 days.'} Expected delivery: <b>{day(o.etaDate)}</b>.
            </p>
          </div>
        </section>
      ) : (
        <div className="ohero">
          <div>
            <Link className="link" href="/account" style={{ fontSize: 14 }}>← My orders</Link>
            <h1>Order {o.number}</h1>
            <p>Placed {day(o.placedAt ?? o.createdAt)} · <span className={`st ${o.status}`}>{ORDER_STATUS_LABEL[o.status]}</span></p>
          </div>
          <div className="acts">
            {o.invoice && <a className="btn btn-ink" href={media(o.invoice.url)} target="_blank" rel="noopener">GST invoice</a>}
            {o.canCancel && o.status !== 'PENDING_PAYMENT' && <button className="btn" type="button" style={{ border: '1.5px solid var(--line)' }} disabled={busy} onClick={() => void cancel()}>Cancel order</button>}
            {o.returnOptions?.open && <a className="btn" href="#returns" style={{ border: '1.5px solid var(--line)' }}>Return or exchange</a>}
          </div>
        </div>
      )}

      {o.canPay && (
        <div className="opay">
          <Info />
          <span>This order is waiting for payment of <b>{formatINR(o.totalPaise)}</b>. We hold your pieces for 30 minutes from checkout.</span>
          <button className="btn btn-grad" type="button" disabled={busy} onClick={() => void payNow()}>Pay now</button>
        </div>
      )}
      {o.status === 'CANCELLED' && (
        <div className="opay" style={{ background: '#F4F2F7', borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
          <Info />
          <span>This order was cancelled{o.cancelledAt ? ` on ${day(o.cancelledAt)}` : ''}.{o.refundedPaise ? ` ${formatINR(o.refundedPaise)} is being refunded to your original payment method (5–7 working days).` : ''}</span>
        </div>
      )}
      {proofWaiting.length > 0 && (
        <div className="opay" style={{ background: '#EDE9FF', borderColor: '#C9C0FF', color: '#2B1FA0' }}>
          <Info />
          <span>Your stitch proof is ready. Please approve it so we can start stitching.</span>
          <Link className="btn btn-grad" href={`/proof/${proofWaiting[0]!.proof!.token}`}>Review proof</Link>
        </div>
      )}

      {stepIndex >= 0 && (
        <ol className="steps4" aria-label="Order progress">
          {steps.map((s, i) => (
            <li key={s} className={`${i <= stepIndex ? 'ok' : ''}${i === stepIndex ? ' cur' : ''}`}>
              <i>{i <= stepIndex ? <Check strokeWidth={3} /> : i + 1}</i>
              {s}
            </li>
          ))}
        </ol>
      )}

      <div className="acc-grid">
        <div>
          <section className="co-card">
            <div className="co-h"><span className="n">{o.itemCount}</span><h2>Your pieces</h2></div>
            <div className="oitems">
              {o.items.map((i) => (
                <div key={i.id} className="oitem">
                  {i.image ? <img src={media(i.image)} alt="" /> : <span />}
                  <div>
                    {i.productSlug ? <Link href={`/p/${i.productSlug}`}><b>{i.name}</b></Link> : <b>{i.name}</b>}
                    <small>{i.description}</small>
                    <small>Qty {i.qty}{i.extraPaise ? ` · includes ${formatINR(i.extraPaise)} logo digitizing` : ''}</small>
                    {i.productionStatus !== 'NOT_NEEDED' && o.status !== 'CANCELLED' && (
                      <span className={`prod${i.productionStatus === 'CHANGES_REQUESTED' ? ' attn' : i.productionStatus === 'APPROVED' || i.productionStatus === 'DONE' ? ' ok' : ''}`}>
                        {PRODUCTION_LABEL[i.productionStatus]}
                        {i.proof && <> · <Link href={`/proof/${i.proof.token}`}>{i.proof.status === 'SENT' ? 'Review proof' : 'See proof'}</Link></>}
                      </span>
                    )}
                  </div>
                  <div className="pp">{formatINR(i.qty * i.unitPricePaise + i.extraPaise)}</div>
                  {(i.canReview || i.reviewed) && <ReviewBox itemId={i.id} reviewed={i.reviewed} onDone={() => void load()} />}
                </div>
              ))}
            </div>
          </section>
          <ReturnsSection order={o} onChange={setO} />
          {o.tracking && (
            <section className="co-card">
              <div className="co-h"><span className="n"><Truck /></span><h2>Tracking</h2></div>
              <div className="kv">
                {o.tracking.courier && <div><span>Courier</span><b>{o.tracking.courier}</b></div>}
                {o.tracking.awb && <div><span>Tracking number</span><b>{o.tracking.awb}</b></div>}
              </div>
              {o.tracking.url && <a className="btn btn-grad" style={{ marginTop: 16, height: 48 }} href={o.tracking.url} target="_blank" rel="noopener">Track your parcel <Arrow /></a>}
            </section>
          )}
          <section className="co-card">
            <div className="co-h"><span className="n">✦</span><h2>Updates</h2></div>
            <ul className="otl">
              {[...o.events].reverse().map((e, i) => (
                <li key={i}><div>{e.message}<time>{when(e.createdAt)}</time></div></li>
              ))}
            </ul>
          </section>
        </div>
        <aside>
          <section className="co-card">
            <h3 style={{ fontSize: 22, margin: '0 0 12px' }}>Payment</h3>
            <dl className="tot" style={{ marginTop: 0 }}>
              <div><dt>Subtotal</dt><dd>{formatINR(o.subtotalPaise)}</dd></div>
              {o.discountPaise > 0 && <div className="save"><dt>{o.discountLabel}</dt><dd>−{formatINR(o.discountPaise)}</dd></div>}
              {o.upiDiscountPaise > 0 && <div className="save"><dt>UPI discount</dt><dd>−{formatINR(o.upiDiscountPaise)}</dd></div>}
              <div><dt>Shipping{o.shippingSpeed === 'EXPRESS' ? ' (express)' : ''}</dt><dd className={o.shippingPaise ? '' : 'free'}>{o.shippingPaise ? formatINR(o.shippingPaise) : 'Free'}</dd></div>
              {o.codFeePaise > 0 && <div><dt>Cash handling</dt><dd>{formatINR(o.codFeePaise)}</dd></div>}
              <div className="grand"><dt>Total</dt><dd>{formatINR(o.totalPaise)}</dd></div>
            </dl>
            <div className="kv" style={{ marginTop: 14 }}>
              <div><span>Method</span><b>{PAY_METHOD_LABEL[o.paymentMethod]}</b></div>
              <div><span>Status</span><b>{o.status === 'CANCELLED' && (o.paymentState === 'PENDING' || o.paymentState === 'COD_PENDING') ? 'Nothing charged' : PAYMENT_STATE_LABEL[o.paymentState]}</b></div>
              {o.refundedPaise > 0 && <div><span>Refunded</span><b style={{ color: '#217E36' }}>{formatINR(o.refundedPaise)}</b></div>}
            </div>
          </section>
          <section className="co-card">
            <h3 style={{ fontSize: 22, margin: '0 0 10px' }}>Delivering to</h3>
            <p className="oaddr" style={{ margin: 0 }}>
              <b>{o.ship.name}</b><br />{o.ship.line1}, {o.ship.line2}{o.ship.landmark ? `, ${o.ship.landmark}` : ''}<br />{o.ship.city}, {o.ship.state} {o.ship.pincode}<br />{formatPhone(o.ship.phone)}
            </p>
            {o.etaDate && o.status !== 'CANCELLED' && o.status !== 'DELIVERED' && <p className="oaddr" style={{ margin: '12px 0 0' }}>Expected by <b>{day(o.etaDate)}</b></p>}
            {o.giftNote && <p className="oaddr" style={{ margin: '12px 0 0' }}>Gift note: “{o.giftNote}”</p>}
          </section>
          <section className="co-card">
            <h3 style={{ fontSize: 22, margin: '0 0 8px' }}>Need help?</h3>
            <p style={{ margin: '0 0 14px', color: 'var(--ink-2)', fontSize: 14.5 }}>Message the studio on WhatsApp with your order number.</p>
            <a className="btn btn-wa" style={{ width: '100%', height: 50 }} href={`https://wa.me/${BRAND.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi! About my order ${o.number}`)}`} target="_blank" rel="noopener"><Chat />WhatsApp us</a>
            {placed && <Link className="btn btn-ink" style={{ width: '100%', height: 50, marginTop: 10 }} href="/shop">Continue shopping</Link>}
          </section>
        </aside>
      </div>
      {payment.sheet}
    </>
  );
}

/** a delivered piece can be reviewed once; the studio checks reviews before they show */
function ReviewBox({ itemId, reviewed, onDone }: { itemId: string; reviewed: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  if (reviewed) return <div className="prod ok" style={{ gridColumn: '1 / -1' }}>Thanks for your review!</div>;
  if (!open)
    return (
      <button className="link" type="button" style={{ gridColumn: '1 / -1', justifySelf: 'start' }} onClick={() => setOpen(true)}>
        Write a review
      </button>
    );
  return (
    <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 10 }}>
      <div role="radiogroup" aria-label="Rating" style={{ display: 'flex', gap: 4, fontSize: 26 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} style={{ color: n <= rating ? '#FFB300' : '#D9CFE3' }}>★</button>
        ))}
      </div>
      <textarea value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} placeholder="How do you like it? What did people say?" style={{ width: '100%', minHeight: 90, padding: 12, borderRadius: 14, border: '1.5px solid var(--line)', font: 'inherit' }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-grad" type="button" style={{ height: 44 }} disabled={busy || body.trim().length < 10} onClick={async () => {
          setBusy(true);
          try {
            await api.addReview(itemId, rating, body.trim());
            ui.toast('Thank you! We’ll publish it after a quick check.');
            onDone();
          } catch (e) {
            ui.toast(e instanceof ApiError ? e.message : 'Could not send your review');
          } finally {
            setBusy(false);
          }
        }}>Send review</button>
        <button className="btn" type="button" style={{ height: 44, border: '1.5px solid var(--line)' }} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
