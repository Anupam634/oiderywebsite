'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { adminApi, setAdmin, useAdmin } from '@/lib/admin-api';
import { Lock, Logo } from '../icons';

const safeNext = (n: string | null) => (n && n.startsWith('/admin') && !n.startsWith('//') ? n : '/admin');

export function AdminLogin() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const me = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me) router.replace(next);
  }, [me, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      setAdmin((await adminApi.login(email.trim(), password)).me);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : 'Could not log in');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="co-page" style={{ display: 'grid', placeItems: 'center', padding: 16 }}>
      <form className="acc-card" onSubmit={submit} style={{ width: 'min(420px,100%)' }} noValidate>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ width: 40, height: 40, display: 'block' }}><Logo /></span>
          <div>
            <b style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 24 }}>zulyf</b>
            <div className="kicker" style={{ fontSize: 10.5 }}>Studio admin</div>
          </div>
        </div>
        <h2>Staff login</h2>
        <p>For the studio team only.</p>
        <div className="fgrid2" style={{ gridTemplateColumns: '1fr' }}>
          <label className={`fld${err ? ' bad' : ''}`}><span>Email</span><div className="inp"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div></label>
          <label className={`fld${err ? ' bad' : ''}`}><span>Password</span><div className="inp"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div><small className="err">{err}</small></label>
          <button className="btn btn-grad" type="submit" disabled={busy || !email || !password}>{busy ? <span className="spin" /> : <Lock />}<span>{busy ? 'Checking…' : 'Log in'}</span></button>
        </div>
      </form>
    </main>
  );
}
