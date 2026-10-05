import Link from 'next/link';
import { BRAND } from '@store/shared';
import { categoryHref, SHOP_LINKS } from '@/lib/links';
import { Logo } from './icons';

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="fgrid">
          <div className="fbrand">
            <Link className="logo" href="/"><Logo />zulyf</Link>
            <p>An embroidery studio making colourful clothing, décor and personalised gifts. Stitched in India with a lot of love and even more thread.</p>
          </div>
          <div><h2>Shop</h2><Link href={categoryHref('clothing')}>Clothing</Link><Link href={categoryHref('home')}>Home décor</Link><Link href={categoryHref('gifts')}>Gifts</Link><Link href={SHOP_LINKS.personalised}>Personalised</Link><Link href={SHOP_LINKS.new}>New arrivals</Link></div>
          <div><h2>Custom</h2><Link href="/studio">Design studio</Link><Link href="/studio?how=upload">Upload your logo</Link><Link href={categoryHref('corporate')}>Bulk &amp; corporate</Link><Link href="/p/custom-pet-portrait-hoop">Pet portraits</Link></div>
          <div><h2>Help</h2><Link href="/account">Track your order</Link><Link href="/policies/shipping">Shipping</Link><Link href="/policies/refunds">Returns &amp; exchanges</Link><Link href="/policies/terms">Terms</Link><Link href="/policies/privacy">Privacy</Link></div>
          <div><h2>Studio</h2><span className="fsoon">Our story</span><span className="fsoon">Care guide</span><Link href="/contact">Contact us</Link></div>
        </div>
        <div className="bigword" aria-hidden="true">zulyf</div>
        <div className="fbot">
          <span>© {new Date().getFullYear()} {BRAND.legalName} · GSTIN: {BRAND.gstin ?? 'to be added'}</span>
          <div className="pay"><span>UPI</span><span>Cards</span><span>Net banking</span><span>Wallets</span><span>COD</span></div>
        </div>
      </div>
    </footer>
  );
}
