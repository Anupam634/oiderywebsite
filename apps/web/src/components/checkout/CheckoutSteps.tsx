'use client';
import { ui } from '@/lib/store';
import { Check } from '../icons';

export function CheckoutSteps({ done = false }: { done?: boolean }) {
  return (
    <ol className={`co-steps${done ? ' paid' : ''}`} aria-label="Checkout progress">
      <li className="sd">
        <button type="button" onClick={() => ui.open('cart')} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot"><Check strokeWidth={3} /></span><span className="lbl">Bag</span>
        </button>
      </li>
      <li className="cur" aria-current="step"><span className="dot">2</span><span className="lbl">Details</span></li>
      <li><span className="dot">3</span><span className="lbl">Payment</span></li>
    </ol>
  );
}
