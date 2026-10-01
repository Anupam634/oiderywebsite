import type { Metadata } from 'next';
import { StudioView } from '@/components/studio/StudioView';
import { Plus } from '@/components/icons';
import '@/styles/studio.css';

export const metadata: Metadata = {
  title: 'Design studio',
  description: 'Upload your logo, or pick a motif and add a name, and see it embroidered on real garments before you order.',
  alternates: { canonical: '/studio' },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const WHY = [
  ['#FF2E93', '#E4007C', 'Real thread colours', 'Your colours are matched to thread shades we actually stock, so the preview shows what we can stitch.'],
  ['#FF8A00', '#FF4B2B', 'Real garment photos', 'Your design bends with the folds and picks up the light and shadow of each photo.'],
  ['#3D2BD6', '#7B2CBF', 'Raised stitches', 'Satin stitches run in different directions and sit slightly above the fabric, like the real thing.'],
  ['#00A39A', '#5DAA3A', 'Proof before we stitch', 'A digitizer turns your file into a stitch file and sends you a proof. Nothing is made until you say yes.'],
] as const;

const FAQ = [
  ['Which files work best?', 'A PNG with a transparent background is perfect. JPG, SVG and WEBP work too. If your logo sits on a white box, we remove the background for you.'],
  ['How many colours can you stitch?', 'Up to 6 thread colours in one design. Gradients, shadows and photos are simplified into solid thread colours.'],
  ['What is digitizing, and why is there a fee?', 'A digitizer redraws your logo as a stitch file for our embroidery machine. It costs ₹399 once per design and is free on orders of 25 or more. Our own motifs and names need no digitizing fee.'],
  ['How small can text be?', 'Letters need to be at least 5 mm tall to stitch cleanly. For a left-chest logo, that is about 8 to 10 characters on one line.'],
  ['Is there a minimum order?', 'You can order just one. Prices drop from 10 pieces, and orders of 25 or more get a physical sample before bulk production.'],
  ['How long does it take?', 'You get a stitch proof on WhatsApp within 24 hours. After you approve it, orders of up to 50 pieces ship in 5–7 days.'],
] as const;

export default async function StudioPage({ searchParams }: Props) {
  const sp = await searchParams;
  const start = { garment: one(sp.g), sample: one(sp.s), how: one(sp.how) };
  return (
    <main className="up-page up-main">
      <section className="wrap up-head">
        <div>
          <span className="kicker">Design studio</span>
          <h1 className="h2">Your design, <em>stitched on real fabric</em></h1>
          <p className="sub">Upload your logo, or pick one of our motifs and add a name. We turn it into real thread colours and show it on real garments, following every fold and shadow. Before we make anything, we WhatsApp you a stitch proof.</p>
        </div>
        <ol className="up-steps" aria-label="How it works">
          <li><b>1</b>Upload or create</li><li><b>2</b>We match threads</li><li><b>3</b>See it on real fabric</li><li><b>4</b>Approve your proof</li>
        </ol>
      </section>

      {/* key: a new link (?g=cap&s=team) starts a fresh studio */}
      <StudioView key={`${start.garment}|${start.sample}|${start.how}`} start={start} />

      <section className="sec" style={{ paddingTop: 70 }}>
        <div className="wrap">
          <div className="head"><div><span className="kicker">Why it looks real</span><h2 className="h2">Not a sticker. <em>Stitches on fabric.</em></h2></div></div>
          <div className="steps">
            {WHY.map(([c1, c2, h, p], i) => (
              <div key={h} className="stepc" style={{ ['--c1' as string]: c1, ['--c2' as string]: c2 }}>
                <span className="num">{String(i + 1).padStart(2, '0')}</span><h3>{h}</h3><p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 30 }}>
        <div className="wrap up-faqwrap">
          <div><span className="kicker">Good to know</span><h2 className="h2">Logo embroidery, <em>explained</em></h2><p className="sub">Still unsure? Send your file on WhatsApp and the studio will tell you what works best.</p></div>
          <div className="up-faq">
            {FAQ.map(([q, a], i) => (
              <details key={q} open={i === 0}><summary>{q}<i><Plus /></i></summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
