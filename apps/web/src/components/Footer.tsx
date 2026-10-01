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
            <Link className="logo" href="/"><Logo />taanka</Link>
            <p>An embroidery studio making colourful clothing, décor and personalised gifts. Stitched in India with a lot of love and even more thread.</p>
          </div>
          <div><h5>Shop</h5><Link href={categoryHref('clothing')}>Clothing</Link><Link href={categoryHref('home')}>Home décor</Link><Link href={categoryHref('gifts')}>Gifts</Link><Link href={SHOP_LINKS.personalised}>Personalised</Link><Link href={SHOP_LINKS.new}>New arrivals</Link></div>
          <div><h5>Custom</h5><Link href="/studio">Design studio</Link><Link href="/studio?how=upload">Upload your logo</Link><Link href={categoryHref('corporate')}>Bulk &amp; corporate</Link><Link href="/p/custom-pet-portrait-hoop">Pet portraits</Link></div>
          <div><h5>Help</h5><Link href="/account">Track your order</Link><span className="fsoon">Shipping</span><span className="fsoon">Returns &amp; exchanges</span><span className="fsoon">FAQ</span></div>
          <div><h5>Studio</h5><span className="fsoon">Our story</span><span className="fsoon">Care guide</span><span className="fsoon">Contact us</span></div>
        </div>
        <div className="bigword" aria-hidden="true">taanka</div>
        <div className="fbot">
          <span>© {new Date().getFullYear()} {BRAND.legalName} · placeholder name · GSTIN: {BRAND.gstin ?? 'to be added'}</span>
          <div className="pay"><span>UPI</span><span>Cards</span><span>Net banking</span><span>Wallets</span><span>COD</span></div>
        </div>
      </div>
    </footer>
  );
}
