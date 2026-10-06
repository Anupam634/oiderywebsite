import Link from 'next/link';
import type { CategoryNode } from '@store/shared';
import { categoryHref, SHOP_LINKS } from '@/lib/links';
import { photo } from '@/lib/img';
import { HeaderIcons, HeaderSearch, MenuButton, MobileSearchButton } from './HeaderClient';
import { Logo } from './icons';

/* Featured tile per mega menu: [photo, title, text, link] */
const FEATURE: Record<string, [string, string, string, string]> = {
  clothing: ['photos/lehenga.jpg', 'The festive edit', 'Lehengas, kurtas & dupattas', categoryHref('clothing', 'lehengas')],
  home: ['photos/wreath.jpg', 'One of a kind', 'Hoop art, stitched once', categoryHref('home', 'hoops')],
  gifts: ['photos/r-tote.jpg', 'See your name, live', 'Type it, then watch it stitch', '/p/phoolwari-name-tote'],
};
const IDEAS: Record<string, [string, string][]> = {
  clothing: [['Ready to ship', '/shop/clothing?type=ready'], ['With your name', '/shop/clothing?type=personalise'], ['Made to measure', '/shop/clothing?type=made'], ['Shaadi season', '/shop/clothing?occ=shaadi']],
  home: [['Housewarming gifts', SHOP_LINKS.occasion('housewarming')], ['Diwali décor', '/shop/home?occ=diwali'], ['New in décor', '/shop/home?sort=new']],
  gifts: [['Diwali', SHOP_LINKS.occasion('diwali')], ['Rakhi', SHOP_LINKS.occasion('rakhi')], ['Shaadi', SHOP_LINKS.occasion('shaadi')], ['Birthday', SHOP_LINKS.occasion('birthday')], ['Baby shower', SHOP_LINKS.occasion('babyshower')]],
};

export function Header({ categories, showMobileSearch }: { categories: CategoryNode[]; showMobileSearch?: boolean }) {
  const mega = categories.filter((c) => FEATURE[c.slug]);
  return (
    <>
      <div className="announce">
        <div className="wrap ann-in">
          <span>✦ <b>Diwali gifting is live</b> · free gift wrap on personalised pieces</span>
          <span className="ann-x">Free shipping over ₹999</span>
          <span className="ann-x">COD on ready-to-ship</span>
        </div>
      </div>
      <header className={`hdr${showMobileSearch ? ' has-msrow' : ''}`} id="nav">
        <div className="wrap hdr-in">
          <MenuButton />
          <Link className="logo" href="/" aria-label="Zulyf home">
            <Logo />
            Zulyf
          </Link>
          <nav className="mnav" aria-label="Main">
            {mega.map((c) => {
              const [img, title, text, href] = FEATURE[c.slug]!;
              return (
                <div className="mi" key={c.slug}>
                  <Link className="ml" href={categoryHref(c.slug)}>{c.name}</Link>
                  {/* hidden until hover: no prefetching (it would fetch every listing on each page view) */}
                  <div className="mega">
                    <div className="mega-in">
                      <div>
                        <h6>Shop by type</h6>
                        {c.children.map((s) => <Link key={s.slug} prefetch={false} href={categoryHref(c.slug, s.slug)}>{s.name}</Link>)}
                        {c.slug === 'gifts' && (
                          <>
                            <Link prefetch={false} href={SHOP_LINKS.under999}>Gifts under ₹999</Link>
                            <Link prefetch={false} href={SHOP_LINKS.under1999}>Gifts under ₹1,999</Link>
                          </>
                        )}
                      </div>
                      <div>
                        <h6>{c.slug === 'gifts' ? 'By occasion' : c.slug === 'home' ? 'Ideas' : 'Shop by need'}</h6>
                        {IDEAS[c.slug]!.map(([label, h]) => <Link key={label} prefetch={false} href={h}>{label}</Link>)}
                      </div>
                      <Link className="mfeat" prefetch={false} href={href}>
                        <img {...photo(img, '', { sizes: 240 })} />
                        <span><b>{title}</b>{text}</span>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
            <Link className="ml" href={SHOP_LINKS.personalised}>Personalise</Link>
            <Link className="ml" href={categoryHref('corporate')}>Corporate</Link>
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
