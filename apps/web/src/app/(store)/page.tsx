import Link from 'next/link';
import { OCCASIONS, type ProductCard } from '@store/shared';
import { HeroCarousel } from '@/components/home/HeroCarousel';
import { Newsletter, Offers } from '@/components/home/Offers';
import { Rail } from '@/components/home/Rail';
import { Arrow, Cash, Chat, Eye, Swap, Truck } from '@/components/icons';
import { RecentlyViewed } from '@/components/RecentlyViewed';
import { api } from '@/lib/api';
import { getCategories } from '@/lib/catalog';
import { categoryHref, productHref, SHOP_LINKS } from '@/lib/links';
import { photo } from '@/lib/img';
import '@/styles/home.css';

// rendered per request (like shop and product pages): builds never depend on the API being up,
// and the API's own catalogue cache keeps it fast
export const dynamic = 'force-dynamic';

const REVIEWS: [string, string, string, string][] = [
  ['tote', 'Ordered the Phoolwari tote with my sister’s name. The stitch proof on WhatsApp matched the live preview exactly.', 'Sneha R.', 'Pune'],
  ['nametee', 'Got name tees for both my kids. The satin is raised and neat, and it survived the washing machine.', 'Imran K.', 'Hyderabad'],
  ['wreath', 'The Gulaab wreath is even prettier in person. The thread actually shines when the light hits it.', 'Fatima K.', 'Lucknow'],
  ['cap', 'Ordered 40 logo caps for our café team. Colours matched our brand and they arrived a day early.', 'Arjun M.', 'Bengaluru'],
];
// how wide the photos show: the two featured cards, and three-across strips
const DUO = '(max-width: 860px) 42vw, 270px';
const THIRD = '(max-width: 860px) 31vw, 200px';
const IG: [string, string][] = [['blossom', 'A gift for Amma'], ['punch', 'Studio wall, Mumbai'], ['pink', 'Festive season'], ['cardigan', 'Little flowers'], ['hands-black', 'Stitching night'], ['poppies', 'Poppies in progress']];

export default async function HomePage() {
  const [listing, categories] = await Promise.all([api.products('pageSize=60'), getCategories()]);
  const all = listing.items;
  const byPop = all; // the API returns popularity order by default
  const best = byPop.filter((p) => !p.studio).slice(0, 10);
  const perso = byPop.filter((p) => p.type === 'PERSONALISE' || p.type === 'LOGO');
  const fresh = (await api.products('pageSize=10&sort=new')).items;
  const homeDecor = byPop.filter((p) => p.parent.slug === 'home');
  const code = (c: string) => all.find((p) => p.code === c);
  const gifty = all.filter((p) => p.type !== 'LOGO');
  const budget: [string, string, string, (p: ProductCard) => boolean][] = [
    [SHOP_LINKS.under999, 'Under', '₹999', (p) => p.pricePaise < 100_000],
    [SHOP_LINKS.under1999, 'Under', '₹1,999', (p) => p.pricePaise < 200_000],
    [SHOP_LINKS.under4999, 'Under', '₹4,999', (p) => p.pricePaise < 500_000],
    [SHOP_LINKS.luxe, 'Luxe', '₹5,000+', (p) => p.pricePaise >= 500_000],
  ];
  const subs = categories.flatMap((c) => c.children.map((s) => ({ ...s, parent: c.slug })));

  return (
    <main id="top" className="hm">
      <HeroCarousel />

      <section className="wrap cats" aria-label="Shop by category">
        <div className="cats-row">
          {subs.map((s) => (
            <Link key={s.slug} className="cat" href={categoryHref(s.parent, s.slug)}>
              <span className="cimg">{s.image && <img {...photo(s.image, '', { sizes: 84, width: 200, height: 250, eager: true })} />}</span>
              <b>{s.name}</b>
            </Link>
          ))}
          <Link className="cat all" href={SHOP_LINKS.all}><span className="cimg"><b>{listing.total}</b>pieces</span><b>Shop all</b></Link>
        </div>
      </section>

      <Rail title="Bestsellers" sub="Most loved this festive season" href={SHOP_LINKS.all} items={best} />
      <Offers />
      <RecentlyViewed />

      <section className="wrap duo sx" aria-label="Featured">
        <Link className="duo-b d1" href="/p/phoolwari-name-tote">
          <div className="duo-t"><span className="duo-k"><i />Live preview</span><h3>Your name, stitched</h3><p>Type it, pick a thread, and see it on the tote before you pay.</p><span className="duo-cta">Personalise now <Arrow /></span></div>
          <img {...photo('photos/r-tote-d.jpg', 'Close-up of the Phoolwari tote with the name Priya', { sizes: DUO })} />
        </Link>
        <Link className="duo-b d2" href="/p/custom-pet-portrait-hoop">
          <div className="duo-t"><span className="duo-k">From your photo</span><h3>Pet portraits in thread</h3><p>Pencil sketch on WhatsApp first, then 10 days of stitching.</p><span className="duo-cta">Order a portrait <Arrow /></span></div>
          <img {...photo('photos/cat-d.jpg', 'Close-up of an embroidered cat portrait', { sizes: DUO })} />
        </Link>
      </section>

      <Rail title="Personalise it" sub="Names, initials and logos, previewed live on real photos" href={SHOP_LINKS.personalised} items={perso} />

      <section className="wrap sband" aria-label="Design studio">
        <div className="sb-copy">
          <span className="sb-k">Design studio</span>
          <h2>Your logo, a motif or a name. <em>On real fabric.</em></h2>
          <p>Upload a logo or pick one of our motifs, choose the garment and colour, and see every stitch before you order. One piece or five hundred.</p>
          <Link className="btn btn-grad" href="/studio">Open the design studio <Arrow className="arr" /></Link>
        </div>
        <div className="sb-art">
          <Link href="/studio?how=name"><img {...photo('photos/r-model.jpg', 'T-shirt with an embroidered name', { sizes: THIRD })} /><b>Write a name</b></Link>
          <Link href="/studio?how=motif"><img {...photo('photos/r-hoodie.jpg', 'Hoodie with a peacock feather motif', { sizes: THIRD })} /><b>Pick a motif</b></Link>
          <Link href="/studio?how=upload"><img {...photo('photos/r-polo.jpg', 'Polo with an embroidered logo', { sizes: THIRD })} /><b>Upload a logo</b></Link>
        </div>
      </section>

      <Rail title="New arrivals" sub="Fresh off the hoop" href={SHOP_LINKS.new} items={fresh} />

      <section className="sx"><div className="wrap">
        <div className="rh"><div><h2>Gifts by budget</h2><p>Every gift wrapped with a handwritten note</p></div></div>
        <div className="budget">
          {budget.map(([href, a, b, f], i) => {
            const n = gifty.filter(f).length;
            return <Link key={href} className={`bt bt${i + 1}`} href={href}><span>{a}</span><b>{b}</b><small>{n} piece{n === 1 ? '' : 's'}</small></Link>;
          })}
        </div>
        <div className="occ-row"><span>Shop by occasion</span><div className="occ">{OCCASIONS.map((o) => <Link key={o.key} className="chip" style={{ ['--c' as string]: o.colour }} href={SHOP_LINKS.occasion(o.key)}><i />{o.label}</Link>)}</div></div>
      </div></section>

      <Rail title="For your home" sub="Cushions, hoop art and wall art, many one of a kind" href={categoryHref('home')} items={homeDecor} />

      <section className="sx"><div className="wrap">
        <div className="rh"><div><h2>Loved by 2,100+ customers</h2><p><span className="stars" aria-hidden="true">★★★★★</span> 4.8 average rating <span className="sample2">Sample reviews · replace with real ones</span></p></div></div>
        <div className="rv-row">
          {REVIEWS.map(([c, q, n, city]) => {
            const p = code(c);
            if (!p) return null;
            return (
              <figure className="rv2" key={c}>
                <div className="stars" aria-label="5 out of 5">★★★★★</div>
                <blockquote>{q}</blockquote>
                <figcaption><Link className="th" href={productHref(p)} tabIndex={-1} aria-hidden="true"><img {...photo(p.image.path, '', { sizes: 44 })} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></Link><span><b>{n}</b><small>{city} · <Link href={productHref(p)}>{p.name}</Link></small></span></figcaption>
              </figure>
            );
          })}
        </div>
      </div></section>

      <section className="wrap sx">
        <div className="prom">
          <div className="pr" style={{ ['--c' as string]: '#2C8538' }}><i><Cash /></i><div><b>Cash on delivery</b><span>On ready-to-ship pieces</span></div></div>
          <div className="pr" style={{ ['--c' as string]: '#FF8A00' }}><i><Truck /></i><div><b>Free shipping</b><span>On orders above ₹999</span></div></div>
          <div className="pr" style={{ ['--c' as string]: '#E4007C' }}><i><Eye /></i><div><b>Stitch proof first</b><span>Approve custom work on WhatsApp</span></div></div>
          <div className="pr" style={{ ['--c' as string]: '#3D2BD6' }}><i><Swap /></i><div><b>Easy exchange</b><span>7 days on ready-made pieces</span></div></div>
        </div>
      </section>

      <section className="wrap sx brandband" aria-label="Zulyf">
        <img src="/brand/zulyf-logo.jpg" alt="Zulyf: Style, Craft, Comfort. Ladies kurtis, embroidery design, men's t-shirts and hoodies" width={1536} height={1024} loading="lazy" />
      </section>

      <section className="sx"><div className="wrap">
        <div className="rh"><div><h2>#StitchedWithZulyf</h2><p>Tag us on Instagram to be featured here</p></div></div>
        <div className="ig">{IG.map(([img, cap]) => <span className="ig-t" key={img}><img {...photo(`photos/${img}.jpg`, cap, { sizes: '(max-width: 760px) 33vw, 210px', width: 700, height: 700 })} /><span>{cap}</span></span>)}</div>
      </div></section>

      <section className="wrap corp2" id="corporate">
        <div className="c2-copy">
          <span className="sb-k">Corporate &amp; bulk</span>
          <h2>Logo merch your team will actually wear</h2>
          <p>Caps, polos and totes with your logo, from 10 pieces. Free digitizing on 25+, a physical sample before bulk, and a GST invoice.</p>
          <div className="c2-cta"><Link className="btn btn-grad" href={categoryHref('corporate')}>See logo merch</Link><a className="btn btn-wa" href="https://wa.me/" target="_blank" rel="noopener"><Chat />Get a quote</a></div>
        </div>
        <div className="c2-art">
          <img {...photo('photos/r-capteam.jpg', 'Navy cap with a team crest', { sizes: THIRD })} />
          <img {...photo('photos/r-totechai.jpg', 'Black tote with a café logo', { sizes: THIRD })} />
          <img {...photo('photos/r-polo-d.jpg', 'Close-up of a logo stitched on a polo', { sizes: THIRD })} />
        </div>
      </section>

      <Newsletter />
    </main>
  );
}
