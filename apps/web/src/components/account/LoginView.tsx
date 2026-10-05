'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useMe } from '@/lib/session';
import { OtpLogin } from '../auth/OtpLogin';
import { Bag, Eye, Spark, Truck } from '../icons';

/** only same-site paths are allowed as the place to go after logging in */
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/account');

export function LoginView() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const me = useMe();
  useEffect(() => {
    if (me) router.replace(next);
  }, [me, next, router]);

  return (
    <div className="acc-login">
      <section className="acc-hero" aria-hidden="true">
        <span className="kicker">Your studio account</span>
        <h1>Hello again, <em>let’s stitch.</em></h1>
        <p>Log in with your mobile number. No password to remember: we SMS you a one-time code.</p>
        <ul className="acc-perks">
          <li><Truck />Track every order, from proof to doorstep</li>
          <li><Eye />Approve your stitch proofs in one tap</li>
          <li><Bag />Saved addresses for a faster checkout</li>
          <li><Spark />First order? ZULYF10 takes 10% off</li>
        </ul>
      </section>
      <section className="acc-card">
        <h2>Log in or sign up</h2>
        <p>Use the number you’d like order updates on.</p>
        {me === undefined ? <div style={{ height: 160 }} aria-busy="true" /> : <OtpLogin onDone={() => router.replace(next)} />}
      </section>
    </div>
  );
}
