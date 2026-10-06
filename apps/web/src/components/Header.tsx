import Link from 'next/link';
import type { CategoryNode } from '@store/shared';
import { categoryHref, SHOP_LINKS } from '@/lib/links';
import { HeaderIcons, HeaderSearch, MenuButton, MobileSearchButton, NavLink } from './HeaderClient';
import { ChevronDown } from './icons';

/* Store header: crimson announcement bar with the offers, the Zulyf logo, Home · Shop (every category in one
   dropdown) · About Us · Contact · Design studio, the search box, and account / wishlist / bag with labels. */
export function Header({ categories, showMobileSearch }: { categories: CategoryNode[]; showMobileSearch?: boolean }) {
  return (
    <>
      <div className="announce">
        <div className="wrap ann-in">
          <span className="ann-l">✦ <b>Diwali gifting is live</b> · free gift wrap on personalised pieces</span>
          <span className="ann-s">✦ <b>Diwali gifting is live</b> · free gift wrap</span>
          <span className="ann-x">Free shipping over ₹999</span>
          <span className="ann-x">COD on ready-to-ship</span>
          <Link className="ann-x" href="/account">Track order</Link>
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
            <Link className="ml hot" href="/studio">Design studio</Link>
          </nav>
          <HeaderSearch />
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
