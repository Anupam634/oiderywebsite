'use client';
import { ui } from '@/lib/store';

function copy(code: string) {
  try {
    localStorage.setItem('store-coupon', code);
  } catch {
    /* ignore */
  }
  const done = () => ui.toast(`${code} copied. We’ve saved it for checkout too.`);
  navigator.clipboard?.writeText(code).then(done, done) ?? done();
}

export function Offers() {
  return (
    <section className="wrap offers" aria-label="Offers">
      <div className="cp cp1"><b>10% OFF</b><span>on your first order</span><button type="button" className="cp-code" onClick={() => copy('ZULYF10')}>ZULYF10 <small>Copy</small></button></div>
      <div className="cp cp2"><b>15% OFF</b><span>on orders above ₹2,999</span><button type="button" className="cp-code" onClick={() => copy('FESTIVE15')}>FESTIVE15 <small>Copy</small></button></div>
      <div className="cp cp3"><b>BUY 2</b><span>get 10% off, applied in your bag</span><em>No code needed</em></div>
      <div className="cp cp4"><b>₹50 OFF</b><span>when you pay by UPI</span><em>At checkout</em></div>
    </section>
  );
}

export function Newsletter() {
  return (
    <section className="wrap sx">
      <div className="news">
        <div><h3>New drops, first. <em>On WhatsApp.</em></h3><p>One-of-a-kind pieces sell out fast. Get a heads-up before everyone else. No spam, ever.</p></div>
        <div>
          <form onSubmit={(e) => { e.preventDefault(); ui.toast('You’re on the list. Watch WhatsApp for the next drop!'); e.currentTarget.reset(); }}>
            <span className="cc">+91</span>
            <input type="tel" inputMode="numeric" maxLength={10} pattern="[6-9][0-9]{9}" placeholder="WhatsApp number" aria-label="WhatsApp number" required />
            <button className="btn btn-grad" type="submit">Join the list</button>
          </form>
          <small>You can opt out any time by replying STOP.</small>
        </div>
      </div>
    </section>
  );
}
