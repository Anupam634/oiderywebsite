import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@store/shared';
import { Arrow } from '@/components/icons';
import '@/styles/about.css';

export const metadata: Metadata = { title: 'About us', description: `${BRAND.name}: ladies kurtis, men’s T-shirts, hoodies and custom embroidery design. Style, craft, comfort.` };

/* what we make: [card photo (from the homepage), title, text, link] */
const RANGES: [string, string, string, string][] = [
  ['cat-kurtis', 'Ladies kurtis', 'In soft, easy fabrics for every day.', '/shop/clothing/kurtas'],
  ['cat-hoodies', 'Men’s T-shirts and hoodies', 'In soft, comfortable fabrics.', '/shop/clothing/tees'],
  ['cat-embroidery', 'Embroidery design', 'Send us a name, a logo or a sketch and we stitch it on your piece.', '/studio'],
];

export default function AboutPage() {
  return (
    <main className="ab">
      <section className="wrap ab-hero">
        <div className="ab-copy">
          <p className="ab-k"><span>Style</span><i /><span>Craft</span><i /><span>Comfort</span></p>
          <h1>About {BRAND.name}</h1>
          <p className="ab-lead">{BRAND.name} makes comfortable everyday clothing: ladies kurtis, men’s T-shirts and hoodies, plus custom embroidery designs stitched to order.</p>
          <div className="ab-ctas">
            <Link className="btn ab-btn" href="/shop">Shop now <Arrow className="arr" /></Link>
            <Link className="btn ab-btn2" href="/studio">Start a design</Link>
          </div>
        </div>
        <figure className="ab-logo">
          <img src="/brand/zulyf-logo.jpg" alt={`${BRAND.name}: ladies kurtis, embroidery design, men’s T-shirts and hoodies`} width={1536} height={1024} />
        </figure>
      </section>

      <section className="wrap ab-sec" aria-labelledby="ab-make">
        <h2 id="ab-make" className="ab-h"><i /><span aria-hidden="true">✤</span>What we make<span aria-hidden="true">✤</span><i /></h2>
        <div className="ab-cards">
          {RANGES.map(([img, title, text, href]) => (
            <Link key={title} className="ab-card" href={href}>
              <img src={`/brand/home/${img}.jpg`} alt="" width={720} height={442} loading="lazy" />
              <span className="ab-card-b"><b>{title} <Arrow /></b><span>{text}</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap ab-sec" aria-labelledby="ab-how">
        <h2 id="ab-how" className="ab-h"><i /><span aria-hidden="true">✤</span>How custom embroidery works<span aria-hidden="true">✤</span><i /></h2>
        <ol className="ab-steps">
          <li><span className="ab-n">1</span><b>Send your design</b><span>Design your piece in the <Link className="link" href="/studio">design studio</Link> or send it on WhatsApp.</span></li>
          <li><span className="ab-n">2</span><b>Approve the stitch proof</b><span>We digitize it and share a stitch proof for your approval.</span></li>
          <li><span className="ab-n">3</span><b>We embroider and ship</b><span>Then we embroider your piece and ship it to you.</span></li>
        </ol>
      </section>

      <section className="wrap ab-sec">
        <div className="ab-talk">
          <div>
            <h2>Talk to us</h2>
            <p>Questions about sizes, fabrics or a custom order? We reply within a few hours.</p>
          </div>
          <Link className="btn ab-btn" href="/contact">Contact the studio <Arrow className="arr" /></Link>
        </div>
      </section>
    </main>
  );
}
