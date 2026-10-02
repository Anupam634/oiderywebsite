import Link from 'next/link';
import type { ReactNode } from 'react';
import { BRAND } from '@store/shared';
import { Analytics } from '@/components/Analytics';
import { Lock, Logo } from '@/components/icons';
import { CheckoutSteps } from '@/components/checkout/CheckoutSteps';
import '@/styles/checkout.css';
import '@/styles/account.css';

/* Checkout keeps a quiet header and footer: no menu or search to pull people away mid-payment. */
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <div className="co-page">
      <header className="co-head">
        <div className="wrap co-head-in">
          <Link className="logo" href="/" aria-label={`${BRAND.name} home`}><Logo />taanka</Link>
          <CheckoutSteps />
          <div className="co-secure"><Lock /><span>Secure checkout</span></div>
        </div>
      </header>
      {children}
      <footer className="co-foot">
        <div className="wrap co-foot-in">
          <span>© {new Date().getFullYear()} {BRAND.legalName} · placeholder name</span>
          <nav aria-label="Policies">
            <Link href="/policies/privacy">Privacy</Link><Link href="/policies/terms">Terms</Link><Link href="/policies/refunds">Refund policy</Link><Link href="/policies/shipping">Shipping policy</Link>
            <a href={`https://wa.me/${BRAND.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener">Help on WhatsApp</a>
          </nav>
        </div>
      </footer>
      <Analytics />
    </div>
  );
}
