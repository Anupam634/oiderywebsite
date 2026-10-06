import Link from 'next/link';
import type { CategoryNode } from '@store/shared';
import { categoryHref, SHOP_LINKS } from '@/lib/links';
import { HeaderIcons, MenuButton, MobileSearchButton, NavLink } from './HeaderClient';
import { ChevronDown } from './icons';

/* Store header, as in the Zulyf homepage design: crimson announcement bar, the Zulyf logo,
   Home · Shop (every category in one dropdown) · About Us · Contact, and search / account / bag. */
export function Header({ categories, showMobileSearch }: { categories: CategoryNode[]; showMobileSearch?: boolean }) {
  return (
    <>
      <div className="announce">
        <div className="wrap ann-in">
          <span><i aria-hidden="true">✤</i> Stylish Collections <em>•</em> Handmade with Love <i aria-hidden="true">✤</i></span>
        </div>
      </div>
      <header className={`hdr${showMobileSearch ? ' has-msrow' : ''}`} id="nav">
        <div className="wrap hdr-in">
          <MenuButton />
          <Link className="logo" href="/" aria-label="Zulyf home">
            <img className="logo-img" src="/brand/logo-header.webp" alt="Zulyf" width={280} height={155} />
          </Link>
          <nav className="mnav" aria-label="Main">
            <NavLink href="/">Home</NavLink>
            <div className="mi">
              <NavLink href={SHOP_LINKS.all} match="/shop">Shop <ChevronDown className="mchev" /></NavLink>
              {/* hidden until hover: no prefetching (it would fetch every listing on each page view) */}
              <div className="mega">
                <div className="mega-in shop-mega">
                  {categories.map((c) => (
                    <div key={c.slug}>
                      <h6><Link prefetch={false} href={categoryHref(c.slug)}>{c.name}</Link></h6>
                      {c.children.map((s) => <Link key={s.slug} prefetch={false} href={categoryHref(c.slug, s.slug)}>{s.name}</Link>)}
                    </div>
                  ))}
                  <div>
                    <h6>More</h6>
                    <Link prefetch={false} href="/studio">Embroidery design studio</Link>
                    <Link prefetch={false} href={SHOP_LINKS.personalised}>Personalised</Link>
                    <Link prefetch={false} href={SHOP_LINKS.new}>New arrivals</Link>
                    <Link prefetch={false} href={SHOP_LINKS.all}>All products</Link>
                  </div>
                </div>
              </div>
            </div>
            <NavLink href="/about">About Us</NavLink>
            <NavLink href="/contact">Contact</NavLink>
          </nav>
          <HeaderIcons />
        </div>
        {showMobileSearch && (
          <div className="wrap msrow">
            <MobileSearchButton />
          </div>
        )}
      </header>
    </>
  );
}
