'use client';
import { useRef, useState, type ReactNode } from 'react';
import { BRAND, formatINR, type OrderDto, type PaymentStart } from '@store/shared';
import { api, ApiError } from '@/lib/api';
import { Lock } from '../icons';

/* Opens the payment window for an order: Razorpay Checkout when the store has Razorpay keys, otherwise a
   clearly-labelled test sheet (local development and demos), so the whole flow can be tried end to end. */

export type PayOutcome = { kind: 'paid'; order: OrderDto } | { kind: 'dismissed' } | { kind: 'failed'; reason: string };

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: object) => RazorpayInstance;
  }
}

let loader: Promise<void> | null = null;
function loadRazorpay() {
  loader ??= new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loader = null;
      reject(new Error('Could not load the payment window. Please check your connection.'));
    };
    document.head.appendChild(s);
  });
  return loader;
}

const METHOD_LABEL: Record<string, string> = { upi: 'UPI', card: 'Card', netbanking: 'Net banking', wallet: 'Wallet', cod: 'Cash on delivery' };

function openRazorpay(p: PaymentStart): Promise<PayOutcome> {
  return loadRazorpay().then(
    () =>
      new Promise<PayOutcome>((resolve) => {
        let settled = false;
        let lastError = '';
        const done = (o: PayOutcome) => {
          if (!settled) {
            settled = true;
            resolve(o);
          }
        };
        const rzp = new window.Razorpay!({
          key: p.keyId,
          order_id: p.providerOrderId,
          amount: p.amountPaise,
          currency: p.currency,
          name: BRAND.name,
          description: p.description,
          prefill: { name: p.prefill.name, email: p.prefill.email, contact: p.prefill.contact, method: p.method },
          theme: { color: '#E4007C' },
          // show only the method chosen on our page (the UPI discount depends on it)
          config: { display: { blocks: { chosen: { name: `Pay by ${METHOD_LABEL[p.method] ?? 'card'}`, instruments: [{ method: p.method }] } }, sequence: ['block.chosen'], preferences: { show_default_blocks: false } } },
          handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              done({ kind: 'paid', order: await api.confirmRazorpay(p.orderNumber, resp) });
            } catch (e) {
              done({ kind: 'failed', reason: e instanceof ApiError ? e.message : 'We could not confirm the payment. If money was taken, it will be refunded.' });
            }
          },
          modal: { ondismiss: () => done(lastError ? { kind: 'failed', reason: lastError } : { kind: 'dismissed' }), confirm_close: true },
          retry: { enabled: true, max_count: 3 },
        });
        rzp.on('payment.failed', (r) => {
          lastError = r.error?.description ?? 'The payment didn’t go through';
          void api.paymentFailed(p.orderNumber, lastError).catch(() => undefined);
        });
        rzp.open();
      }),
    (e: Error) => ({ kind: 'failed', reason: e.message }) as PayOutcome,
  );
}

/** usePayment().open(start) resolves when the shopper has paid, closed the window, or the payment failed */
export function usePayment(): { open: (p: PaymentStart) => Promise<PayOutcome>; sheet: ReactNode } {
  const [fake, setFake] = useState<PaymentStart | null>(null);
  const [busy, setBusy] = useState<'' | 'ok' | 'fail'>('');
  const resolver = useRef<((o: PayOutcome) => void) | null>(null);

  const open = (p: PaymentStart) => {
    if (p.provider === 'razorpay') return openRazorpay(p);
    setFake(p);
    return new Promise<PayOutcome>((resolve) => {
      resolver.current = resolve;
    });
  };
  const finish = (o: PayOutcome) => {
    setFake(null);
    setBusy('');
    resolver.current?.(o);
    resolver.current = null;
  };
  const fakePay = async (ok: boolean) => {
    if (!fake) return;
    setBusy(ok ? 'ok' : 'fail');
    try {
      finish({ kind: 'paid', order: await api.fakePayment(fake.orderNumber, ok) });
    } catch (e) {
      finish({ kind: 'failed', reason: e instanceof ApiError ? e.message : 'The payment didn’t go through' });
    }
  };

  const sheet = fake ? (
    <div className="paysheet" role="dialog" aria-modal="true" aria-label="Test payment">
      <div className="ps">
        <span className="tag">Test mode · no real money</span>
        <h3>Pay for order {fake.orderNumber}</h3>
        <div className="amt">{formatINR(fake.amountPaise)}</div>
        <p>
          by {METHOD_LABEL[fake.method] ?? fake.method}. Real payments open the secure Razorpay window here once the studio adds its Razorpay keys.
        </p>
        <div className="row">
          <button className="btn bad" type="button" disabled={!!busy} onClick={() => void fakePay(false)}>{busy === 'fail' ? 'Failing…' : 'Make it fail'}</button>
          <button className="btn btn-grad" type="button" disabled={!!busy} onClick={() => void fakePay(true)}><Lock /><span>{busy === 'ok' ? 'Paying…' : 'Pay now'}</span></button>
        </div>
        <button className="link" type="button" style={{ marginTop: 14 }} disabled={!!busy} onClick={() => finish({ kind: 'dismissed' })}>Close without paying</button>
      </div>
    </div>
  ) : null;

  return { open, sheet };
}
