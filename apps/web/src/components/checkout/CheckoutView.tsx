'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import {
  FREE_SHIPPING_MIN_PAISE,
  INDIAN_STATES,
  PINCODE_RE,
  RULES,
  checkoutErrors,
  computeTotals,
  deliveryDays,
  formatINR,
  formatPhone,
  type AddressDto,
  type CheckoutDetails,
  type CheckoutField,
  type OrderDto,
  type PaymentStart,
  type Totals,
} from '@store/shared';
import { api, ApiError, type CartItemRequest, type CartPriceRequest, type CartPriceResponse, type Offer } from '@/lib/api';
import { MAKE_DAYS, PINS, dateIn } from '@/lib/delivery';
import { media } from '@/lib/media';
import { logout, setMe, useMe } from '@/lib/session';
import { cart, ui, useCart, type CartLine } from '@/lib/store';
import { OtpLogin } from '../auth/OtpLogin';
import { Bag, Bank, Card, Cash, Check, Eye, Info, Lock, Plus, Shield, Spark, Swap, Upi, Wallet } from '../icons';
import { usePayment } from './Payment';

type Ship = NonNullable<CartPriceRequest['shipping']>;
type Pay = NonNullable<CartPriceRequest['payment']>;

const PAYS: { id: Pay; name: string; sub: string; icon: ReactNode; colour: string }[] = [
  { id: 'upi', name: 'UPI', sub: 'Google Pay, PhonePe, Paytm or any UPI app', icon: <Upi />, colour: '#2E8B3A' },
  { id: 'card', name: 'Credit or debit card', sub: 'Visa, Mastercard, RuPay and more', icon: <Card />, colour: '#3D2BD6' },
  { id: 'netbanking', name: 'Net banking', sub: 'All major Indian banks', icon: <Bank />, colour: '#00A39A' },
  { id: 'wallet', name: 'Wallets', sub: 'Paytm, PhonePe, Amazon Pay', icon: <Wallet />, colour: '#FF8A00' },
  { id: 'cod', name: 'Cash on delivery', sub: 'Pay in cash or UPI when it arrives · ₹49 fee', icon: <Cash />, colour: '#E4007C' },
];

interface Form {
  phone: string; email: string; whatsappUpdates: boolean; pincode: string; name: string; line1: string; line2: string;
  landmark: string; city: string; state: string; addressType: 'home' | 'work' | 'other';
  gstOn: boolean; gstin: string; business: string; giftOn: boolean; giftNote: string;
}
const EMPTY_FORM: Form = {
  phone: '', email: '', whatsappUpdates: true, pincode: '', name: '', line1: '', line2: '', landmark: '', city: '', state: '',
  addressType: 'home', gstOn: false, gstin: '', business: '', giftOn: false, giftNote: '',
};
const DRAFT_KEY = 'store-checkout-v1';
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

const itemOf = (l: CartLine): CartItemRequest =>
  l.studio
    ? { qty: l.qty, studio: l.studio, ...(l.uploads?.length ? { uploads: l.uploads } : {}) }
    : {
        variantId: l.variantId,
        qty: l.qty,
        ...(l.personalisation ? { personalisation: l.personalisation } : {}),
        ...(l.giftWrap ? { giftWrap: true } : {}),
        ...(l.petName ? { petName: l.petName } : {}),
        ...(l.uploads?.length ? { uploads: l.uploads } : {}),
      };

const toRequest = (lines: CartLine[], coupon: string, shipping: Ship, payment: Pay): CartPriceRequest => ({
  items: lines.map(itemOf),
  ...(coupon ? { coupon } : {}),
  shipping,
  payment,
});

const fromAddress = (a: AddressDto): Partial<Form> => ({
  name: a.name, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode,
  addressType: a.type.toLowerCase() as Form['addressType'],
});

/** a made-for-you line's preview (a data URL in the bag) is uploaded once, so the studio sees what was ordered */
async function uploadPreviews(lines: CartLine[]) {
  for (const l of lines) {
    if (!l.image.startsWith('data:') || l.uploads?.length) continue;
    try {
      const blob = await (await fetch(l.image)).blob();
      const up = await api.upload('preview', blob, 'preview.jpg');
      cart.setUploads(l.key, [up.id]);
      l.uploads = [up.id];
    } catch {
      /* the order still works without the preview */
    }
  }
}

const useHydrated = () => useSyncExternalStore(() => () => {}, () => true, () => false);
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function CheckoutView({ offers }: { offers: Offer[] }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const lines = useCart();
  const me = useMe();
  const [ship, setShip] = useState<Ship>('standard');
  const [pay, setPay] = useState<Pay>('upi');
  const [coupon, setCoupon] = useState('');
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<CheckoutField, string>>>({});
  const [placing, setPlacing] = useState(false);
  const [saved, setSaved] = useState<AddressDto[] | null>(null);
  const [picked, setPicked] = useState<string | 'new' | null>(null);
  const [saveAddress, setSaveAddress] = useState(true);
  const [pending, setPending] = useState<{ number: string; reason: string } | null>(null);
  const [repriceKey, setRepriceKey] = useState(0);
  const attempt = useRef<{ key: string; sig: string } | null>(null);
  const payment = usePayment();

  // restore the saved pincode, coupon and address draft once in the browser
  useEffect(() => {
    let draft: Partial<Form> = {};
    try {
      draft = JSON.parse(read(DRAFT_KEY) ?? '{}') as Partial<Form>;
    } catch {
      /* bad JSON */
    }
    const pin = read('store-pin') ?? '';
    setForm((f) => ({ ...f, ...draft, ...(!draft.pincode && PINCODE_RE.test(pin) ? { pincode: pin, ...(PINS[pin] ? { city: PINS[pin][0], state: PINS[pin][1] } : {}) } : {}) }));
    setCoupon(read('store-coupon') ?? '');
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => write(DRAFT_KEY, JSON.stringify(form)), 400);
    return () => clearTimeout(t);
  }, [form, hydrated]);

  // logged in: prefill contact details and offer saved addresses
  useEffect(() => {
    if (!me) {
      setSaved(null);
      return;
    }
    setForm((f) => ({ ...f, phone: f.phone || me.phone, email: f.email || me.email || '', name: f.name || me.name || '', whatsappUpdates: me.whatsappOptIn }));
    api.addresses().then(
      (items) => {
        setSaved(items);
        const def = items.find((a) => a.isDefault) ?? items[0];
        if (def) {
          setPicked(def.id);
          setForm((f) => ({ ...f, ...fromAddress(def) }));
        } else setPicked('new');
      },
      () => setSaved([]),
    );
  }, [me]);

  const server = useServerPrice(lines, coupon, ship, pay, `${me?.id ?? ''}:${repriceKey}`);
  // instant estimate while the server answers; the server's number is the one we charge
  const estimate = useMemo(() => {
    const offer = offers.find((o) => o.code === coupon);
    return computeTotals(
      lines.map((l) => ({ qty: l.qty, pricePaise: l.unitPricePaise, mrpPaise: l.unitMrpPaise, custom: l.custom, extraPaise: l.extraPaise ?? 0 })),
      { coupon: offer ? { code: offer.code, percent: offer.percent, maxDiscountPaise: offer.maxDiscountPaise, minSubtotalPaise: offer.minSubtotalPaise, label: offer.label } : null, shipping: ship, payment: pay },
    );
  }, [lines, coupon, ship, pay, offers]);
  const T = server.data?.totals ?? estimate;

  useEffect(() => {
    if (pay === 'cod' && !T.codAllowed) setPay('upi');
  }, [pay, T.codAllowed]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k in errors) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const onPin = (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 6);
    const P = PINS[v];
    setForm((f) => ({ ...f, pincode: v, ...(P ? { city: P[0], state: P[1] } : {}) }));
    setErrors((e) => ({ ...e, pincode: undefined, ...(P ? { city: undefined, state: undefined } : {}) }));
    if (PINCODE_RE.test(v)) write('store-pin', v);
  };
  const applyCoupon = (code: string) => {
    const c = code.trim().toUpperCase();
    setCoupon(c);
    write('store-coupon', c || null);
  };
  const pickAddress = (a: AddressDto | 'new') => {
    if (a === 'new') {
      setPicked('new');
      setForm((f) => ({ ...f, name: me?.name ?? '', phone: me?.phone ?? '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', addressType: 'home' }));
    } else {
      setPicked(a.id);
      setForm((f) => ({ ...f, ...fromAddress(a) }));
    }
    setErrors({});
  };

  const okPin = PINCODE_RE.test(form.pincode);
  const make = T.hasCustom ? MAKE_DAYS.custom : MAKE_DAYS.ready;
  const eta = { standard: dateIn(deliveryDays(form.pincode, { express: false, makeDays: make })), express: dateIn(deliveryDays(form.pincode, { express: true, makeDays: make })) };
  const problems = server.data?.lines.some((l) => !l.available) ?? false;
  const usingSaved = !!saved?.length && picked !== 'new' && picked !== null;

  const details = (): CheckoutDetails =>
    ({
      phone: form.phone, email: form.email.trim(), whatsappUpdates: form.whatsappUpdates, pincode: form.pincode, name: form.name,
      line1: form.line1, line2: form.line2, landmark: form.landmark, city: form.city, state: form.state as CheckoutDetails['state'], addressType: form.addressType,
      gst: form.gstOn ? { gstin: form.gstin, business: form.business } : null, giftNote: form.giftOn ? form.giftNote : null,
    });

  const done = (order: OrderDto) => {
    cart.clear();
    write('store-coupon', null);
    write(DRAFT_KEY, null);
    attempt.current = null;
    router.push(`/account/orders/${order.number}?placed=1`);
  };

  async function runPayment(start: PaymentStart) {
    setPending(null);
    const outcome = await payment.open(start);
    if (outcome.kind === 'paid') return done(outcome.order);
    setPending({ number: start.orderNumber, reason: outcome.kind === 'failed' ? outcome.reason : 'You closed the payment window before paying.' });
    setTimeout(() => document.getElementById('pending')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  async function retryPayment() {
    if (!pending) return;
    setPlacing(true);
    try {
      await runPayment(await api.payAgain(pending.number));
    } catch (x) {
      ui.toast(x instanceof ApiError ? x.message : 'Please try again');
      if (x instanceof ApiError && (x.code === 'payment_window_closed' || x.code === 'not_payable')) setPending(null);
    } finally {
      setPlacing(false);
    }
  }

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!lines.length) return ui.toast('Your bag is empty');
    if (!me) {
      document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => document.getElementById('otp-phone')?.focus({ preventScroll: true }), 380);
      return ui.toast('Please verify your mobile number first');
    }
    const d = details();
    const errs = checkoutErrors(d);
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      if (usingSaved) setPicked('new');
      const el = document.getElementById(`f-${first}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => el?.focus({ preventScroll: true }), 380);
      return ui.toast('Please check the highlighted details');
    }
    setPlacing(true);
    try {
      await uploadPreviews(lines);
      const req = toRequest(lines, coupon, ship, pay);
      const sig = JSON.stringify([req, d, usingSaved ? false : saveAddress]);
      // same bag and details as the last try = same checkout attempt (the server returns that order)
      if (!attempt.current || attempt.current.sig !== sig) attempt.current = { key: newKey(), sig };
      const r = await api.placeOrder({
        ...req,
        shipping: ship,
        payment: pay,
        details: d,
        saveAddress: usingSaved ? false : saveAddress,
        clientKey: attempt.current.key,
        ...(server.data ? { expectedTotalPaise: server.data.totals.totalPaise } : {}),
      });
      if (!r.payment) return done(r.order);
      await runPayment(r.payment);
    } catch (x) {
      if (!(x instanceof ApiError)) return ui.toast('Something went wrong. Please try again.');
      if (x.status === 401) setMe(null);
      if (x.code === 'coupon_invalid') applyCoupon('');
      if (x.code.startsWith('cod_')) setPay('upi');
      if (['cart_changed', 'price_changed', 'sold_out', 'coupon_invalid'].includes(x.code)) setRepriceKey((n) => n + 1);
      if (x.code === 'cart_changed' || x.code === 'sold_out')
        [...document.querySelectorAll<HTMLElement>('.co-right, .co-sumbar')].find((el) => el.offsetParent)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ui.toast(x.message);
    } finally {
      setPlacing(false);
    }
  };

  if (!hydrated) return <main className="co-main"><div className="wrap co-grid" aria-busy="true" /></main>;
  if (!lines.length) {
    return (
      <main className="co-main">
        <div className="wrap" style={{ textAlign: 'center', padding: '60px 0' }}>
          <h1 style={{ fontSize: 34, marginBottom: 10 }}>Your bag is empty</h1>
          <p style={{ color: 'var(--mute)', fontWeight: 600, marginBottom: 22 }}>Add a piece or two and come back here to check out.</p>
          <Link className="btn btn-grad" href="/shop">Continue shopping</Link>
        </div>
      </main>
    );
  }

  const summary = (
    <Summary lines={lines} priced={server.data} busy={server.busy} totals={T} ship={ship} coupon={coupon} offers={offers} onCoupon={applyCoupon} />
  );
  const err = (k: CheckoutField) => errors[k];
  const fld = (k: CheckoutField) => `fld${err(k) ? ' bad' : ''}`;
  const payLabel = pay === 'cod' ? `Place order · pay ${formatINR(T.totalPaise)} on delivery` : `Pay ${formatINR(T.totalPaise)} securely`;

  return (
    <main className="co-main">
      <div className="wrap co-grid">
        <div className="co-left">
          <MobileSummary total={T.totalPaise}>{summary}</MobileSummary>

          <form id="coForm" noValidate onSubmit={submit}>
            <section className="co-card" id="contact">
              <div className="co-h">
                <span className="n">{me ? <Check strokeWidth={3} /> : '1'}</span>
                <h2>Contact</h2>
                {me && <button type="button" className="link" onClick={() => void logout()}>Not you? Log out</button>}
              </div>
              {me === undefined ? (
                <div style={{ height: 90 }} aria-busy="true" />
              ) : me === null ? (
                <>
                  <p style={{ margin: '0 0 14px', color: 'var(--ink-2)', fontSize: 14.5 }}>Verify your mobile number to place the order. We send your order updates and stitch proof here.</p>
                  <OtpLogin compact defaultPhone={form.phone} />
                </>
              ) : (
                <div className="fgrid2">
                  <div className="fld full">
                    <span>Mobile number</span>
                    <div className="verified"><Check strokeWidth={3} /><b>{formatPhone(me.phone)}</b><small>Verified</small></div>
                  </div>
                  <label className={`${fld('email')} full`}><span>Email <i>(optional, for your GST invoice)</i></span>
                    <div className="inp"><input id="f-email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
                    <small className="err">{err('email')}</small></label>
                  <label className="chk full"><input type="checkbox" checked={form.whatsappUpdates} onChange={(e) => set('whatsappUpdates', e.target.checked)} /><span>Send order updates and my stitch proof on WhatsApp</span></label>
                </div>
              )}
            </section>

            <section className="co-card">
              <div className="co-h"><span className="n">2</span><h2>Delivery address</h2></div>
              {!!saved?.length && (
                <div className="addrs" style={{ marginBottom: picked === 'new' ? 16 : 0 }}>
                  {saved.map((a) => (
                    <div key={a.id} role="radio" aria-checked={picked === a.id} tabIndex={0} className={`addr pick${picked === a.id ? ' on' : ''}`} onClick={() => pickAddress(a)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pickAddress(a)}>
                      <b>{a.name}</b><span className="tag">{a.type[0] + a.type.slice(1).toLowerCase()}</span>
                      <div>{a.line1}, {a.line2}{a.landmark ? `, ${a.landmark}` : ''}</div>
                      <div>{a.city}, {a.state} {a.pincode} · {formatPhone(a.phone)}</div>
                    </div>
                  ))}
                  {picked !== 'new' && <button className="addr-new" type="button" onClick={() => pickAddress('new')}><Plus />Deliver to a new address</button>}
                </div>
              )}
              {!usingSaved && (
                <div className="fgrid2">
                  <label className={fld('pincode')}><span>Pincode</span>
                    <div className="inp"><input id="f-pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" placeholder="400001" value={form.pincode} onChange={(e) => onPin(e.target.value)} /></div>
                    <small className="err">{err('pincode')}</small>
                    <small className="okm">{okPin ? (PINS[form.pincode] ? `✓ ${PINS[form.pincode]![0]}, ${PINS[form.pincode]![1]} · we deliver here` : '✓ We deliver to this pincode') : ''}</small></label>
                  <label className={fld('name')}><span>Full name</span>
                    <div className="inp"><input id="f-name" autoComplete="name" placeholder="Priya Sharma" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
                    <small className="err">{err('name')}</small></label>
                  <label className={`${fld('line1')} full`}><span>Flat, house number, building</span>
                    <div className="inp"><input id="f-line1" autoComplete="address-line1" placeholder="Flat 402, Gulmohar Apartments" value={form.line1} onChange={(e) => set('line1', e.target.value)} /></div>
                    <small className="err">{err('line1')}</small></label>
                  <label className={`${fld('line2')} full`}><span>Area, street, sector</span>
                    <div className="inp"><input id="f-line2" autoComplete="address-line2" placeholder="Linking Road, Bandra West" value={form.line2} onChange={(e) => set('line2', e.target.value)} /></div>
                    <small className="err">{err('line2')}</small></label>
                  <label className="fld"><span>Landmark <i>(optional)</i></span>
                    <div className="inp"><input placeholder="Near the post office" value={form.landmark} onChange={(e) => set('landmark', e.target.value)} /></div></label>
                  <label className={fld('city')}><span>City</span>
                    <div className="inp"><input id="f-city" autoComplete="address-level2" placeholder="City" value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
                    <small className="err">{err('city')}</small></label>
                  <label className={fld('state')}><span>State</span>
                    <div className="inp sel"><select id="f-state" autoComplete="address-level1" value={form.state} onChange={(e) => set('state', e.target.value)}>
                      <option value="">Select state</option>
                      {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                    </select></div>
                    <small className="err">{err('state')}</small></label>
                  <label className={fld('phone')}><span>Mobile for delivery</span>
                    <div className="inp pre"><em>+91</em><input id="f-phone" inputMode="numeric" maxLength={10} autoComplete="tel-national" placeholder="98765 43210" value={form.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} /></div>
                    <small className="err">{err('phone')}</small></label>
                  <div className="fld"><span>Save this address as</span>
                    <div className="seg2">
                      {(['home', 'work', 'other'] as const).map((t) => (
                        <button key={t} type="button" aria-pressed={form.addressType === t} onClick={() => set('addressType', t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>
                      ))}
                    </div></div>
                  {me && <label className="chk full"><input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /><span>Save this address for next time</span></label>}
                </div>
              )}
              <div className="fgrid2" style={{ marginTop: 14 }}>
                <label className="chk full"><input type="checkbox" checked={form.gstOn} onChange={(e) => set('gstOn', e.target.checked)} /><span>I need a GST invoice for my business</span></label>
                {form.gstOn && (
                  <div className="full fgrid2">
                    <label className={fld('gstin')}><span>GSTIN</span>
                      <div className="inp"><input id="f-gstin" maxLength={15} placeholder="27ABCDE1234F1Z5" autoComplete="off" style={{ textTransform: 'uppercase' }} value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} /></div>
                      <small className="err">{err('gstin')}</small></label>
                    <label className={fld('business')}><span>Business name</span>
                      <div className="inp"><input id="f-business" placeholder="Chai Co. Pvt Ltd" value={form.business} onChange={(e) => set('business', e.target.value)} /></div>
                      <small className="err">{err('business')}</small></label>
                  </div>
                )}
              </div>
            </section>

            <section className="co-card">
              <div className="co-h"><span className="n">3</span><h2>Delivery speed</h2></div>
              <div className="ropts" role="radiogroup" aria-label="Delivery speed">
                {([
                  ['standard', 'Standard delivery', T.afterDiscountPaise >= FREE_SHIPPING_MIN_PAISE ? 'Free' : formatINR(RULES.standardShippingPaise)],
                  ['express', 'Express delivery', formatINR(RULES.expressShippingPaise)],
                ] as const).map(([id, label, price]) => (
                  <label key={id} className={`ropt${ship === id ? ' on' : ''}`}>
                    <input type="radio" name="ship" value={id} checked={ship === id} onChange={() => setShip(id)} />
                    <div><b>{label}</b><small>Arrives by {eta[id]}{okPin ? '' : ' · add your pincode for an exact date'}</small></div>
                    <span className={`rp${price === 'Free' ? ' free' : ''}`}>{price}</span>
                  </label>
                ))}
              </div>
              <div className="mnote">{T.hasCustom && <><Info /><span>Your bag has a made-for-you piece. We WhatsApp you a stitch proof within 24 hours and ship once it&apos;s stitched, in 5–7 days.</span></>}</div>
              <label className="chk" style={{ marginTop: 14 }}><input type="checkbox" checked={form.giftOn} onChange={(e) => set('giftOn', e.target.checked)} /><span><b>Sending it as a gift?</b> We&apos;ll hide the prices on the invoice and add your note, free.</span></label>
              {form.giftOn && <div id="giftBox"><textarea maxLength={150} placeholder="Your message for the card" aria-label="Gift note" value={form.giftNote} onChange={(e) => set('giftNote', e.target.value)} /></div>}
            </section>

            <section className="co-card">
              <div className="co-h"><span className="n">4</span><h2>Payment</h2><span className="lockchip"><Lock />Encrypted &amp; secure</span></div>
              <div className="pays" role="radiogroup" aria-label="Payment method">
                {PAYS.map((p) => {
                  const dis = p.id === 'cod' && !T.codAllowed;
                  const sub = p.id === 'cod' && dis ? 'Not available: made-for-you pieces are prepaid' : p.sub;
                  const tag = p.id === 'upi' ? (T.afterDiscountPaise >= RULES.upiDiscountMinPaise ? `Save ${formatINR(RULES.upiDiscountPaise)}` : 'Fast & secure') : p.id === 'cod' ? null : 'Secure';
                  return (
                    <div key={p.id} className={`pm${pay === p.id ? ' on' : ''}${dis ? ' dis' : ''}`}>
                      <label>
                        <input type="radio" name="pay" value={p.id} checked={pay === p.id} disabled={dis} onChange={() => setPay(p.id)} />
                        <span className="pic" style={{ ['--c' as string]: p.colour }}>{p.icon}</span>
                        <div><b>{p.name}</b><small>{sub}</small></div>
                        {tag && <span className={`tagp${p.id === 'upi' ? '' : ' grey'}`}>{tag}</span>}
                      </label>
                      <div className="pbody2">
                        {p.id === 'cod' ? (
                          <div className="codnote"><Info /><span>A ₹49 cash-handling fee applies. Keep exact change ready, or pay the delivery partner by UPI.</span></div>
                        ) : (
                          <div className="paynote"><Shield /><span>You&apos;ll finish paying in the secure Razorpay window{p.id === 'upi' ? ': scan the QR or approve in your UPI app' : p.id === 'card' ? '. We never see or store your card number' : ''}.</span></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {pending && (
              <section className="co-card" id="pending" aria-live="polite">
                <div className="opay">
                  <Info />
                  <span>Order <b>{pending.number}</b> is waiting for payment. {pending.reason} We’ll hold your pieces for 30 minutes.</span>
                  <button className="btn btn-grad" type="button" disabled={placing} onClick={() => void retryPayment()}>Try again</button>
                </div>
                <p className="fine" style={{ margin: 0 }}>Want to pay another way? Pick a different payment method above and press pay.</p>
              </section>
            )}

            <div className="co-place">
              <button className="btn btn-grad big" type="submit" disabled={placing || problems}>
                {placing ? <><span className="spin" /><span>{pay === 'cod' ? 'Placing your order…' : 'Opening payment…'}</span></> : <><Lock /><span>{payLabel}</span></>}
              </button>
              <p className="fine">By placing this order you agree to our Terms and Refund policy. Personalised pieces can&apos;t be returned.</p>
            </div>
          </form>
        </div>
        <aside className="co-right" aria-label="Order summary"><div className="co-sum">{summary}</div></aside>
      </div>

      <div className="co-paybar">
        <div><small>Total</small><b>{formatINR(T.totalPaise)}</b></div>
        <button className="btn btn-grad" type="submit" form="coForm" disabled={placing || problems}>{pay === 'cod' ? 'Place order' : 'Pay now'}</button>
      </div>
      {payment.sheet}
    </main>
  );
}

/** Debounced server pricing for the bag; ignores answers to stale requests. */
function useServerPrice(lines: CartLine[], coupon: string, ship: Ship, pay: Pay, refresh: string) {
  const [data, setData] = useState<CartPriceResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const body = JSON.stringify(toRequest(lines, coupon, ship, pay));
  useEffect(() => {
    if (!lines.length) return setData(null);
    const n = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      api
        .priceCart(JSON.parse(body) as CartPriceRequest)
        .then((r) => n === seq.current && setData(r))
        .catch(() => n === seq.current && setData(null))
        .finally(() => n === seq.current && setBusy(false));
    }, 200);
    return () => clearTimeout(t);
    // body captures every input that changes the price; refresh re-asks after login or a refused order
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, refresh]);
  return { data, busy };
}

function MobileSummary({ total, children }: { total: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="co-sumbar" type="button" aria-expanded={open} aria-controls="sumMobile" onClick={() => setOpen(!open)}>
        <Bag /><span>{open ? 'Hide order summary' : 'Show order summary'}</span><b>{formatINR(total)}</b>
      </button>
      <div className="co-sum co-sum-m" id="sumMobile" hidden={!open}>{children}</div>
    </>
  );
}

function Summary(props: {
  lines: CartLine[]; priced: CartPriceResponse | null; busy: boolean; totals: Totals; ship: Ship;
  coupon: string; offers: Offer[]; onCoupon: (code: string) => void;
}) {
  const { lines, priced, busy, totals: T, ship, coupon, offers, onCoupon } = props;
  const [typed, setTyped] = useState('');
  const status = priced?.coupon && priced.coupon.code === coupon ? priced.coupon : null;
  return (
    <>
      <div className="sh"><h3>Order summary</h3><button type="button" className="link" onClick={() => ui.open('cart')}>Edit bag</button></div>
      <div className="slist">
        {lines.map((l, i) => {
          const p = priced?.lines[i]?.variantId === l.variantId ? priced.lines[i] : undefined;
          const price = p?.available ? p.unitPricePaise : l.unitPricePaise;
          const mrp = p?.available ? p.unitMrpPaise : l.unitMrpPaise;
          const extra = p?.available ? p.extraPaise : (l.extraPaise ?? 0);
          return (
            <div className={`si${p && !p.available ? ' bad' : ''}`} key={l.key}>
              <div className="th"><img src={media(l.image)} alt="" /><em>{l.qty}</em></div>
              <div>
                <b>{l.name}</b><small>{l.desc}</small>
                {extra > 0 && <small>+ {formatINR(extra)} logo digitizing (one-time)</small>}
                {l.custom && <span className="ptag">Made for you · prepaid</span>}
                {p && !p.available && <span className="prob">{p.problems[0]}</span>}
              </div>
              <div className="pp">{formatINR(price * l.qty + extra)}{mrp > price && <s>{formatINR(mrp * l.qty + extra)}</s>}</div>
            </div>
          );
        })}
      </div>
      <form className="coupon" onSubmit={(e) => { e.preventDefault(); onCoupon(coupon ? '' : typed); setTyped(''); }}>
        <div className="inp"><input placeholder="Coupon code" aria-label="Coupon code" value={coupon || typed} readOnly={!!coupon} onChange={(e) => setTyped(e.target.value.toUpperCase())} /></div>
        <button className="pill" type="submit">{coupon ? 'Remove' : 'Apply'}</button>
      </form>
      <small className={`cerr ${status ? (status.valid ? 'ok' : 'bad') : ''}`}>{status?.message ?? ''}</small>
      {offers.some((o) => o.code !== coupon) && (
        <div className="ochips">
          {offers.filter((o) => o.code !== coupon).map((o) => (
            <button key={o.code} type="button" onClick={() => onCoupon(o.code)}>{o.code} · {o.label}</button>
          ))}
        </div>
      )}
      <dl className={`tot${busy ? ' busy' : ''}`}>
        <div><dt>Subtotal ({T.itemCount} item{T.itemCount === 1 ? '' : 's'})</dt><dd>{formatINR(T.subtotalPaise)}</dd></div>
        {T.discountPaise > 0 && <div className="save"><dt>{T.discountLabel}</dt><dd>−{formatINR(T.discountPaise)}</dd></div>}
        {T.upiDiscountPaise > 0 && <div className="save"><dt>UPI discount</dt><dd>−{formatINR(T.upiDiscountPaise)}</dd></div>}
        <div><dt>Shipping{ship === 'express' ? ' (express)' : ''}</dt><dd className={T.shippingPaise ? '' : 'free'}>{T.shippingPaise ? formatINR(T.shippingPaise) : 'Free'}</dd></div>
        {T.codFeePaise > 0 && <div><dt>Cash handling</dt><dd>{formatINR(T.codFeePaise)}</dd></div>}
        <div className="grand"><dt>Total</dt><dd>{formatINR(T.totalPaise)}</dd></div>
      </dl>
      {T.savedPaise > 0 && <div className="savings"><Spark />You&apos;re saving {formatINR(T.savedPaise)} on this order</div>}
      <p className="gstl">Prices include GST. Your GST invoice is emailed after dispatch.</p>
      <div className="trustc"><div><Shield />Secure payment</div><div><Eye />Stitch proof first</div><div><Swap />Easy exchange on ready-made</div></div>
    </>
  );
}
