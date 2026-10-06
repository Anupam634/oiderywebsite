'use client';
import { useSyncExternalStore } from 'react';
import { ui } from '@/lib/store';
import { Check } from '../icons';

/* The checkout page tells the header which stage it is on (details, or payment once the address is confirmed). */
type Stage = 'details' | 'payment';
let stage: Stage = 'details';
const subs = new Set<() => void>();
export function setCheckoutStage(next: Stage) {
  if (next === stage) return;
  stage = next;
  subs.forEach((f) => f());
}
const useStage = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => stage,
    () => 'details' as Stage,
  );

export function CheckoutSteps({ done = false }: { done?: boolean }) {
  const now = useStage();
  const paying = now === 'payment';
  return (
    <ol className={`co-steps${done ? ' paid' : ''}`} aria-label="Checkout progress">
      <li className="sd">
        <button type="button" aria-label="Back to your bag" onClick={() => ui.open('cart')} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot"><Check strokeWidth={3} /></span><span className="lbl">Bag</span>
        </button>
      </li>
      <li className={paying ? 'sd' : 'cur'} aria-current={paying ? undefined : 'step'}><span className="dot">{paying ? <Check strokeWidth={3} /> : 2}</span><span className="lbl">Details</span></li>
      <li className={paying ? 'cur' : undefined} aria-current={paying ? 'step' : undefined}><span className="dot">3</span><span className="lbl">Payment</span></li>
    </ol>
  );
}
