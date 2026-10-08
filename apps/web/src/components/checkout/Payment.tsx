'use client';
import { useRef, useState, type ReactNode } from 'react';
import { BRAND, formatINR, type OrderDto, type PaymentStart } from '@store/shared';
import { api, ApiError } from '@/lib/api';
import { Lock } from '../icons';

/* Opens the payment window for an order: Razorpay or Cashfree Checkout when the store has keys, otherwise a
   clearly-labelled test sheet (local development and demos), so the whole flow can be tried end to end. */

export type PayOutcome = { kind: 'paid'; order: OrderDto } | { kind: 'dismissed' } | { kind: 'failed'; reason: string };

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void;
}
/** what Cashfree's checkout promise resolves with (any of the three) */
interface CashfreeResult {
  error?: { message?: string };
  redirect?: boolean;
  paymentDetails?: { paymentMessage?: string };
}
declare global {
  interface Window {
    Razorpay?: new (options: object) => RazorpayInstance;
    Cashfree?: (options: { mode: 'sandbox' | 'production' }) => { checkout(options: { paymentSessionId: string; redirectTarget: '_modal' }): Promise<CashfreeResult> };
  }
}

const loaders = new Map<string, Promise<void>>();
function loadScript(src: string, ready: () => boolean) {
  let loader = loaders.get(src);
  if (!loader) {
    loader = new Promise<void>((resolve, reject) => {
      if (ready()) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loaders.delete(src);
        reject(new Error('Could not load the payment window. Please check your connection.'));
      };
      document.head.appendChild(s);
    });
    loaders.set(src, loader);
  }
  return loader;
}
const loadRazorpay = () => loadScript('https://checkout.razorpay.com/v1/checkout.js', () => !!window.Razorpay);

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

/** take Cashfree's window off the page (it doesn't close itself for the back button) */
function closeCashfreeWindow() {
  document.getElementById('cashfree-modal-container')?.remove();
  document.body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
}

/**
 * Cashfree's window opens over our page and fills a phone's screen, so the back button should close it rather than
 * leave the checkout: an extra history entry catches that press. However the window closes, our server then asks
 * Cashfree how the payment went.
 */
async function openCashfree(p: PaymentStart): Promise<PayOutcome> {
  try {
    await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js', () => !!window.Cashfree);
  } catch (e) {
    return { kind: 'failed', reason: (e as Error).message };
  }
  let back = false;
  let onBack = () => {};
  const backPressed = new Promise<CashfreeResult>((resolve) => {
    onBack = () => {
      back = true;
      closeCashfreeWindow();
      resolve({ error: { message: 'closed with the back button' } });
    };
  });
  window.addEventListener('popstate', onBack);
  history.pushState(history.state, '', location.href);
  const checkout = Promise.resolve()
    .then(() => window.Cashfree!({ mode: p.mode ?? 'production' }).checkout({ paymentSessionId: p.sessionId!, redirectTarget: '_modal' }))
    .catch((e: unknown): CashfreeResult => ({ error: { message: e instanceof Error ? e.message : String(e) } }));
  const result = await Promise.race([checkout, backPressed]);
  window.removeEventListener('popstate', onBack);
  // in-app browsers can't show it over our page: Cashfree takes over the page and brings the shopper back to the order
  if (result.redirect) return new Promise((resolve) => setTimeout(() => resolve({ kind: 'dismissed' }), 20_000));
  // closed without the back button: take the extra entry off again before anything navigates
  if (!back)
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 800);
      window.addEventListener(
        'popstate',
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
      history.back();
    });
  try {
    return { kind: 'paid', order: await api.confirmCashfree(p.orderNumber) };
  } catch (e) {
    if (e instanceof ApiError && e.code === 'payment_incomplete') return { kind: 'dismissed' };
    return { kind: 'failed', reason: e instanceof ApiError ? e.message : 'We couldn’t check the payment. If money was taken, your order will update in a few minutes.' };
  }
}

/** usePayment().open(start) resolves when the shopper has paid, closed the window, or the payment failed */
export function usePayment(): { open: (p: PaymentStart) => Promise<PayOutcome>; sheet: ReactNode } {
  const [fake, setFake] = useState<PaymentStart | null>(null);
  const [busy, setBusy] = useState<'' | 'ok' | 'fail'>('');
  const resolver = useRef<((o: PayOutcome) => void) | null>(null);

  const open = (p: PaymentStart) => {
    if (p.provider === 'razorpay') return openRazorpay(p);
    if (p.provider === 'cashfree') return openCashfree(p);
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
          by {METHOD_LABEL[fake.method] ?? fake.method}. Real payments open the secure payment window here once the payment gateway is connected.
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
