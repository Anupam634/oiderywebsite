'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { formatPhone, normalisePhone, type Me } from '@store/shared';
import { api, ApiError } from '@/lib/api';
import { setMe } from '@/lib/session';
import { Lock } from '../icons';

/** Log in with a mobile number and the 6-digit code we SMS. Used on /login and inside checkout (so it is not a
    <form>: forms can't nest, and inside checkout it would submit the order form). */
export function OtpLogin({ onDone, compact = false, defaultPhone = '' }: { onDone?: (me: Me, isNew: boolean) => void; compact?: boolean; defaultPhone?: string }) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState(defaultPhone);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [devCode, setDevCode] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);
  const normal = normalisePhone(phone);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send() {
    if (!normal) return setErr('Enter a 10-digit mobile number');
    setBusy(true);
    setErr('');
    try {
      const r = await api.sendOtp(normal);
      setStep('code');
      setWait(r.resendInSeconds);
      setDevCode(r.devCode ?? '');
      setCode('');
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(value = code) {
    if (!normal || !/^\d{6}$/.test(value)) return setErr('Enter the 6-digit code');
    setBusy(true);
    setErr('');
    try {
      const r = await api.verifyOtp(normal, value);
      setMe(r.me);
      onDone?.(r.me, r.isNew);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : 'Something went wrong. Please try again.');
      if (x instanceof ApiError && (x.code === 'otp_expired' || x.code === 'otp_attempts')) setCode('');
    } finally {
      setBusy(false);
    }
  }

  /** Enter in a field acts like the button next to it */
  const enter = (fn: () => unknown) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    void fn();
  };

  if (step === 'phone')
    return (
      <div className={`otp${compact ? ' compact' : ''}`} role="group" aria-label="Log in with your mobile number">
        <label className={`fld${err ? ' bad' : ''}`}>
          <span>Mobile number</span>
          <div className="inp pre">
            <em>+91</em>
            <input id="otp-phone" inputMode="numeric" autoComplete="tel-national" maxLength={14} placeholder="98765 43210" value={phone} onKeyDown={enter(send)} onChange={(e) => { setPhone(e.target.value.replace(/[^\d+ ]/g, '')); setErr(''); }} />
          </div>
          <small className="err">{err}</small>
        </label>
        <button className="btn btn-grad" type="button" disabled={busy} onClick={() => void send()}>{busy ? <span className="spin" /> : <Lock />}<span>{busy ? 'Sending…' : 'Send code'}</span></button>
        <p className="otp-fine">We’ll SMS you a 6-digit code. No password needed.</p>
      </div>
    );

  return (
    <div className={`otp${compact ? ' compact' : ''}`} role="group" aria-label="Enter your code">
      <p className="otp-sent">
        Enter the code sent to <b>{formatPhone(normal!)}</b>{' '}
        <button type="button" className="link" onClick={() => { setStep('phone'); setErr(''); }}>Change</button>
      </p>
      <label className={`fld${err ? ' bad' : ''}`}>
        <span className="sr">6-digit code</span>
        <div className="inp otp-code">
          <input
            ref={codeRef}
            id="otp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            onKeyDown={enter(() => verify())}
            placeholder="••••••"
            aria-label="6-digit code"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(v);
              setErr('');
              if (v.length === 6) void verify(v);
            }}
          />
        </div>
        <small className="err">{err}</small>
      </label>
      {devCode && <p className="otp-dev">Test mode (no SMS sent): your code is <b>{devCode}</b></p>}
      <button className="btn btn-grad" type="button" disabled={busy || code.length < 6} onClick={() => void verify()}>{busy ? <span className="spin" /> : <Lock />}<span>{busy ? 'Checking…' : 'Verify & continue'}</span></button>
      <p className="otp-fine">
        Didn’t get it?{' '}
        {wait > 0 ? <span>Resend in {wait}s</span> : <button type="button" className="link" onClick={() => void send()}>Send a new code</button>}
      </p>
    </div>
  );
}
