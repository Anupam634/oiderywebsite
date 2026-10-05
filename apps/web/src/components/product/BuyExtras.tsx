'use client';
import { useEffect, useState } from 'react';
import { FREE_SHIPPING_MIN_PAISE } from '@store/shared';
import { dateIn, isPincode, transitDays } from '@/lib/delivery';
import { usePincode } from '@/lib/pincode';
import { ui } from '@/lib/store';
import { Cash, Chat, Check, Info, Shield, Spark, Swap, Tag, Truck, Upi } from '../icons';

export function DeliveryCheck({ custom, madeDays, petPhoto, totalPaise }: { custom: boolean; madeDays: number | null; petPhoto: boolean; totalPaise: number }) {
  const [pin, setPin] = useState('');
  const [checked, setChecked] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('store-pin');
      if (saved && isPincode(saved)) setPin(saved);
    } catch {
      /* ignore */
    }
  }, []);
  const place = usePincode(checked ?? '');
  const days = checked ? transitDays(checked) + (custom ? (madeDays ?? 6) + (petPhoto ? 2 : 0) : 1) : 0;
  return (
    <div className="deliv">
      <div className="olabel" style={{ margin: 0 }}><Truck />Check delivery date</div>
      <form className="pinrow" onSubmit={(e) => {
        e.preventDefault();
        if (!isPincode(pin)) { setBad(true); setChecked(null); return; }
        setBad(false);
        setChecked(pin);
        try { localStorage.setItem('store-pin', pin); } catch { /* ignore */ }
      }}>
        <input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="Enter your pincode" aria-label="Pincode" autoComplete="postal-code" />
        <button className="pill" type="submit">Check</button>
      </form>
      <div className="dres">
        {bad && <div className="bad"><Info /><span>Enter a valid 6-digit pincode.</span></div>}
        {checked && (
          <>
            <div><Check /><span>Delivery to <b>{place.status === 'found' ? place.info.city || place.info.state : `pincode ${checked}`}</b> by <b>{dateIn(days)}</b>{petPhoto ? ' (after you approve the sketch)' : ''}</span></div>
            <div><Check /><span>{custom ? 'Prepaid only (UPI or card) for made-for-you pieces' : 'Cash on delivery available'}</span></div>
            <div><Check /><span>{totalPaise >= FREE_SHIPPING_MIN_PAISE ? 'Free shipping on this order' : 'Free shipping on orders above ₹999'}</span></div>
          </>
        )}
      </div>
    </div>
  );
}

function copy(code: string) {
  try { localStorage.setItem('store-coupon', code); } catch { /* ignore */ }
  const done = () => ui.toast(`${code} copied. We’ve saved it for checkout too.`);
  navigator.clipboard?.writeText(code).then(done, done) ?? done();
}

export function Offers() {
  const rows: [React.ReactNode, string, string, string][] = [
    [<Tag key="t" />, 'Buy 2, get 10% off', 'Applied automatically in your bag', ''],
    [<Spark key="s" />, 'First order? Use ZULYF10', '10% off, up to ₹300', 'ZULYF10'],
    [<Upi key="u" />, 'Pay by UPI, save ₹50', 'On prepaid orders above ₹499', ''],
  ];
  return (
    <div className="offers">
      {rows.map(([icon, a, b, code]) => (
        <div className="offer" key={a}><i>{icon}</i><div><b>{a}</b><small>{b}</small></div>{code && <button className="pill" type="button" onClick={() => copy(code)}>Copy</button>}</div>
      ))}
    </div>
  );
}

export function Trust({ custom, pet }: { custom: boolean; pet: boolean }) {
  const rows: [React.ReactNode, string, string][] = custom
    ? [[<Shield key="a" />, pet ? 'Sketch first' : 'Stitch proof', 'before we start'], [<Upi key="b" />, 'Prepaid', 'UPI · card · net banking'], [<Swap key="c" />, 'Stitching fault?', 'we fix it free']]
    : [[<Cash key="a" />, 'Cash on delivery', 'available'], [<Swap key="b" />, '7-day exchange', 'on ready-made'], [<Truck key="c" />, 'Free shipping', 'above ₹999']];
  return (
    <>
      <div className="trust3">{rows.map(([i, a, b]) => <div key={a}>{i}{a}<small>{b}</small></div>)}</div>
      <a className="waline" href="https://wa.me/" target="_blank" rel="noopener"><Chat />Questions about this piece? Chat with the studio</a>
    </>
  );
}
