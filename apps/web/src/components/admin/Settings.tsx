'use client';
import { useEffect, useState } from 'react';
import { INDIAN_STATES, isValidGstin } from '@store/shared';
import { ApiError } from '@/lib/api';
import { adminApi, useAdmin, type Settings as StoreSettings } from '@/lib/admin-api';
import { ui } from '@/lib/store';
import { Loading, PageHead, Pill, dayTime, useLoad } from './ui';

const err = (e: unknown) => ui.toast(e instanceof ApiError ? e.message : 'That didn’t work');

export function Settings() {
  const me = useAdmin();
  const owner = me?.role === 'OWNER';
  return (
    <>
      <PageHead title="Settings" sub="Store details for invoices, the team and your password." />
      <div className="grid2">
        <div>
          <Store owner={owner} />
          {owner && <Audit />}
        </div>
        <div>
          {owner && <Team />}
          <Password />
        </div>
      </div>
    </>
  );
}

function Store({ owner }: { owner: boolean }) {
  const { data } = useLoad(() => adminApi.settings(), []);
  const [s, setS] = useState<StoreSettings | null>(null);
  useEffect(() => {
    if (data) setS(data);
  }, [data]);
  if (!s) return <Loading />;
  const set = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => setS({ ...s, [k]: v });
  const gstBad = !!s.gstin && !isValidGstin(s.gstin);
  return (
    <div className="panel">
      <h2>Seller details <span className="muted">(printed on every invoice)</span></h2>
      {!s.gstin && <div className="note blue" style={{ marginBottom: 12 }}>No GSTIN yet: invoices say “Invoice” without a tax split. Add it once the studio is GST-registered.</div>}
      <fieldset disabled={!owner} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="formgrid">
          <label className="f"><span>Legal name</span><input value={s.legalName} onChange={(e) => set('legalName', e.target.value)} /></label>
          <label className="f"><span>Shop name</span><input value={s.tradeName} onChange={(e) => set('tradeName', e.target.value)} /></label>
          <label className={`f full${gstBad ? ' bad' : ''}`}><span>GSTIN</span><input value={s.gstin} maxLength={15} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="27ABCDE1234F1Z5" /><small>{gstBad ? 'This GSTIN doesn’t look right (check digit)' : ' '}</small></label>
          <label className="f full"><span>Address</span><input value={s.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} /></label>
          <label className="f full"><span>Area</span><input value={s.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} /></label>
          <label className="f"><span>City</span><input value={s.city} onChange={(e) => set('city', e.target.value)} /></label>
          <label className="f"><span>State <i>(decides CGST+SGST or IGST)</i></span><select value={s.state} onChange={(e) => set('state', e.target.value)}>{INDIAN_STATES.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="f"><span>Pincode</span><input value={s.pincode} maxLength={6} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} /></label>
          <label className="f"><span>Phone</span><input value={s.phone} onChange={(e) => set('phone', e.target.value)} /></label>
          <label className="f"><span>Email</span><input value={s.email} onChange={(e) => set('email', e.target.value)} /></label>
          <label className="f"><span>Invoice prefix</span><input value={s.invoicePrefix} maxLength={5} onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></label>
          <label className="f full"><span>Note at the bottom of invoices</span><textarea value={s.invoiceNote} maxLength={300} onChange={(e) => set('invoiceNote', e.target.value)} /></label>
          <label className="f"><span>Grievance officer <i>(name on the contact page; required by e-commerce rules)</i></span><input value={s.grievanceOfficer ?? ''} maxLength={80} onChange={(e) => set('grievanceOfficer', e.target.value)} /></label>
          <label className="f"><span>Courts for disputes <i>(city)</i></span><input value={s.jurisdictionCity ?? ''} maxLength={60} onChange={(e) => set('jurisdictionCity', e.target.value)} placeholder={s.city || 'e.g. Pune'} /></label>
        </div>
      </fieldset>
      {owner ? (
        <button className="btn btn-grad" style={{ marginTop: 12 }} type="button" disabled={gstBad} onClick={async () => { try { setS(await adminApi.saveSettings(s)); ui.toast('Saved'); } catch (e) { err(e); } }}>Save details</button>
      ) : (
        <p className="muted">Only the owner can change these.</p>
      )}
    </div>
  );
}

function Team() {
  const { data, reload } = useLoad(() => adminApi.users(), []);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);
  return (
    <div className="panel">
      <h2>Team</h2>
      {secret && (
        <div className="note ok" style={{ marginBottom: 12 }}>
          One-time password for <b>{secret.who}</b>: <code style={{ fontSize: 16 }}>{secret.password}</code>. Share it privately; they can change it after logging in.
        </div>
      )}
      {!data ? (
        <Loading />
      ) : (
        <table className="tbl">
          <tbody>
            {data.map((u) => (
              <tr key={u.id} style={{ cursor: 'default' }}>
                <td><b>{u.name}</b><div className="muted">{u.email}{u.lastLoginAt ? ` · last in ${dayTime(u.lastLoginAt)}` : ' · never logged in'}</div></td>
                <td><Pill v={u.active ? 'ACTIVE' : 'ARCHIVED'} text={u.active ? u.role.toLowerCase() : 'switched off'} /></td>
                <td className="amt">
                  <button className="btn line sm" type="button" onClick={async () => { try { const r = await adminApi.updateUser(u.id, { resetPassword: true }); if (r.password) setSecret({ who: u.email, password: r.password }); } catch (e) { err(e); } }}>New password</button>{' '}
                  <button className="btn line sm" type="button" onClick={async () => { try { await adminApi.updateUser(u.id, { active: !u.active }); await reload(); } catch (e) { err(e); } }}>{u.active ? 'Switch off' : 'Switch on'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="formgrid" style={{ marginTop: 14 }}>
        <label className="f"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="f"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      </div>
      <button className="btn btn-ink sm" style={{ marginTop: 10 }} type="button" disabled={name.trim().length < 2 || !email.includes('@')} onClick={async () => {
        try {
          const r = await adminApi.addUser({ email: email.trim(), name: name.trim(), role: 'STAFF' });
          setSecret({ who: r.user.email, password: r.password });
          setEmail('');
          setName('');
          await reload();
        } catch (e) {
          err(e);
        }
      }}>Add a team member</button>
    </div>
  );
}

function Password() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  return (
    <div className="panel">
      <h2>My password</h2>
      <div className="formgrid">
        <label className="f"><span>Current</span><input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="f"><span>New <i>(10+ characters)</i></span><input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
      </div>
      <button className="btn line sm" style={{ marginTop: 10 }} type="button" disabled={!current || next.length < 10} onClick={async () => { try { await adminApi.changePassword(current, next); setCurrent(''); setNext(''); ui.toast('Password changed; other devices were logged out'); } catch (e) { err(e); } }}>Change password</button>
    </div>
  );
}

function Audit() {
  const { data } = useLoad(() => adminApi.audit(), []);
  return (
    <div className="panel">
      <h2>Recent changes</h2>
      {!data ? (
        <Loading />
      ) : (
        <ul className="tl2">
          {data.slice(0, 30).map((a) => (
            <li key={a.id}><div>{a.who}: {a.action.replace(/_/g, ' ')} {a.entityId ? <span className="muted">({a.entity} {a.entityId.slice(0, 14)})</span> : null}<time>{dayTime(a.createdAt)}</time></div></li>
          ))}
        </ul>
      )}
    </div>
  );
}
