import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@store/shared';
import '@/styles/checkout.css';
import '@/styles/account.css';

export const metadata: Metadata = { title: 'About us', description: `${BRAND.name}: ladies kurtis, men’s T-shirts, hoodies and custom embroidery design. Style, craft, comfort.` };

export default function AboutPage() {
  return (
    <main className="co-page">
      <div className="wrap legal">
        <article>
          <span className="kicker">Style • Craft • Comfort</span>
          <h1>About {BRAND.name}</h1>
          <img src="/brand/zulyf-logo.jpg" alt={`${BRAND.name}: ladies kurtis, embroidery design, men’s T-shirts and hoodies`} width={1536} height={1024} style={{ width: '100%', height: 'auto', borderRadius: 18, margin: '8px 0 18px' }} />
          <p>{BRAND.name} makes everyday clothing with a handmade touch: ladies kurtis with embroidery, men’s T-shirts and hoodies, and custom embroidery designs stitched to order.</p>
          <h2>What we make</h2>
          <p><b>Ladies kurtis</b> with resham and thread work. <b>Men’s T-shirts and hoodies</b> in soft, comfortable fabrics. <b>Embroidery design</b>: send us a name, a logo or a sketch and we stitch it on your piece.</p>
          <h2>How custom embroidery works</h2>
          <p>Design your piece in the <Link className="link" href="/studio">design studio</Link> or send it on WhatsApp. We digitize it, share a stitch proof for your approval, then embroider and ship it.</p>
          <h2>Talk to us</h2>
          <p>Questions about sizes, fabrics or a custom order? <Link className="link" href="/contact">Contact the studio</Link>, we reply within a few hours.</p>
        </article>
      </div>
    </main>
  );
}
