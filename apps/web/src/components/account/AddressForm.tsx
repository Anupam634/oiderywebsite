'use client';
import { useRef, useState, type FormEvent } from 'react';
import { INDIAN_STATES, PHONE_RE, PINCODE_RE, type AddressDto } from '@store/shared';
import { ApiError } from '@/lib/api';
import { pincodeNote, usePincode } from '@/lib/pincode';

export type AddressInput = Omit<AddressDto, 'id' | 'isDefault'> & { isDefault?: boolean };

const EMPTY: AddressInput = { name: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', type: 'HOME' };

function errorsOf(a: AddressInput) {
  const e: Partial<Record<keyof AddressInput, string>> = {};
  if (a.name.trim().length < 2) e.name = 'Enter the full name';
  if (!PHONE_RE.test(a.phone)) e.phone = 'Enter a 10-digit mobile number';
  if (a.line1.trim().length < 3) e.line1 = 'Enter the flat or house number';
  if (a.line2.trim().length < 3) e.line2 = 'Enter the area or street';
  if (a.city.trim().length < 2) e.city = 'Enter the city';
  if (!a.state) e.state = 'Choose the state';
  if (!PINCODE_RE.test(a.pincode)) e.pincode = 'Enter a 6-digit pincode';
  return e;
}

/** Add or edit a saved address (account page). */
export function AddressForm({ initial, onSave, onCancel, submitLabel = 'Save address' }: { initial?: Partial<AddressInput>; onSave: (a: AddressInput) => Promise<void>; onCancel?: () => void; submitLabel?: string }) {
  const [a, setA] = useState<AddressInput>({ ...EMPTY, ...initial });
  const [errs, setErrs] = useState<Partial<Record<keyof AddressInput, string>>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = <K extends keyof AddressInput>(k: K, v: AddressInput[K]) => {
    setA((x) => ({ ...x, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };
  const onPin = (raw: string) => {
    setA((x) => ({ ...x, pincode: raw.replace(/\D/g, '').slice(0, 6) }));
    setErrs((e) => ({ ...e, pincode: undefined }));
  };
  // a pincode fills in its state, and its city unless one was typed in
  const autoCity = useRef('');
  const pinLookup = usePincode(a.pincode, (info) => {
    const prev = autoCity.current;
    autoCity.current = info.city;
    setA((x) => ({ ...x, state: info.state, city: info.city && (!x.city.trim() || x.city === prev) ? info.city : x.city }));
    setErrs((e) => ({ ...e, state: undefined, ...(info.city ? { city: undefined } : {}) }));
  });
  const pinNote = pincodeNote(pinLookup);
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = errorsOf(a);
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setMsg('');
    try {
      await onSave(a);
    } catch (x) {
      setMsg(x instanceof ApiError ? x.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const fld = (k: keyof AddressInput) => `fld${errs[k] ? ' bad' : ''}`;
  return (
    <form className="fgrid2" onSubmit={submit} noValidate>
      <label className={fld('name')}><span>Full name</span><div className="inp"><input autoComplete="name" value={a.name} onChange={(e) => set('name', e.target.value)} /></div><small className="err">{errs.name}</small></label>
      <label className={fld('phone')}><span>Mobile for delivery</span><div className="inp pre"><em>+91</em><input inputMode="numeric" maxLength={10} autoComplete="tel-national" value={a.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} /></div><small className="err">{errs.phone}</small></label>
      <label className={fld('pincode')}><span>Pincode</span><div className="inp"><input inputMode="numeric" maxLength={6} autoComplete="postal-code" value={a.pincode} onChange={(e) => onPin(e.target.value)} /></div><small className="err">{errs.pincode}</small><small className={`pinm ${pinNote.tone}`} aria-live="polite">{pinNote.text}</small></label>
      <label className={fld('city')}><span>City</span><div className="inp"><input autoComplete="address-level2" value={a.city} onChange={(e) => set('city', e.target.value)} /></div><small className="err">{errs.city}</small></label>
      <label className={`${fld('line1')} full`}><span>Flat, house number, building</span><div className="inp"><input autoComplete="address-line1" value={a.line1} onChange={(e) => set('line1', e.target.value)} /></div><small className="err">{errs.line1}</small></label>
      <label className={`${fld('line2')} full`}><span>Area, street, sector</span><div className="inp"><input autoComplete="address-line2" value={a.line2} onChange={(e) => set('line2', e.target.value)} /></div><small className="err">{errs.line2}</small></label>
      <label className="fld"><span>Landmark <i>(optional)</i></span><div className="inp"><input value={a.landmark} onChange={(e) => set('landmark', e.target.value)} /></div></label>
      <label className={fld('state')}><span>State</span><div className="inp sel"><select autoComplete="address-level1" value={a.state} onChange={(e) => set('state', e.target.value)}><option value="">Select state</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></div><small className="err">{errs.state}</small></label>
      <div className="fld full"><span>Save as</span><div className="seg2">{(['HOME', 'WORK', 'OTHER'] as const).map((t) => <button key={t} type="button" aria-pressed={a.type === t} onClick={() => set('type', t)}>{t[0] + t.slice(1).toLowerCase()}</button>)}</div></div>
      <label className="chk full"><input type="checkbox" checked={!!a.isDefault} onChange={(e) => set('isDefault', e.target.checked)} /><span>Use this as my default address</span></label>
      {msg && <p className="full" style={{ color: '#B91C1C', fontWeight: 700, margin: 0 }}>{msg}</p>}
      <div className="full" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-grad" type="submit" disabled={busy} style={{ height: 50 }}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button className="btn" type="button" onClick={onCancel} style={{ height: 50, border: '1.5px solid var(--line)' }}>Cancel</button>}
      </div>
    </form>
  );
}
