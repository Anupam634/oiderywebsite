import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { COD_MAX_PAISE, FREE_SHIPPING_MIN_PAISE, PENDING_ORDER_MINUTES, RULES, formatINR } from '@store/shared';
import { PolicyNav } from '@/components/PolicyNav';
import { getStoreInfo, type StoreInfo } from '@/lib/store-info';
import '@/styles/checkout.css';
import '@/styles/account.css';

/* Shipping, returns, terms and privacy. Written for this studio's actual rules (prices, COD, proofs).
   They are a starting draft: the owner should have them reviewed before launch. */

const PAGES: Record<string, { title: string; summary: string; body: (s: StoreInfo) => ReactNode }> = {
  shipping: {
    title: 'Shipping policy',
    summary: 'How and when we send your order.',
    body: () => (
      <>
        <h2>When we dispatch</h2>
        <ul>
          <li><b>Ready-made pieces</b> leave the studio within 1–2 working days.</li>
          <li><b>Made-for-you pieces</b> (names, logos, pet portraits, made-to-measure) are stitched after you approve the stitch proof we send on WhatsApp. They usually leave within 5–7 working days of approval; large or bulk orders may take longer and we confirm the date with you.</li>
          <li>Orders with both kinds of pieces ship together unless you ask us to split them.</li>
        </ul>
        <h2>Delivery charges and times</h2>
        <ul>
          <li>Standard delivery is free on orders of {formatINR(FREE_SHIPPING_MIN_PAISE)} or more (after discounts); below that it costs {formatINR(RULES.standardShippingPaise)}.</li>
          <li>Express delivery costs {formatINR(RULES.expressShippingPaise)} and saves about 2 days in transit.</li>
          <li>Transit usually takes 3–7 working days depending on your pincode. The estimated date at checkout includes making time.</li>
          <li>We ship across India with trusted courier partners. We don’t ship outside India yet.</li>
        </ul>
        <h2>Tracking</h2>
        <p>Once your parcel leaves, we send the courier name and tracking link on WhatsApp and email. You can also see it on your order page.</p>
        <h2>Cash on delivery</h2>
        <p>Cash on delivery is available for ready-made pieces on orders up to {formatINR(COD_MAX_PAISE)}, with a {formatINR(RULES.codFeePaise)} handling fee. Made-for-you pieces are prepaid. Repeatedly refused cash-on-delivery parcels may lead us to switch off cash on delivery for an account.</p>
        <h2>If something goes wrong</h2>
        <p>If your parcel arrives damaged or opened, please share photos with us within 48 hours of delivery and we’ll make it right.</p>
      </>
    ),
  },
  refunds: {
    title: 'Returns, refunds & cancellations',
    summary: 'What you can cancel, return or exchange, and how refunds work.',
    body: () => (
      <>
        <h2>Cancelling an order</h2>
        <ul>
          <li>You can cancel from your order page until the order ships (ready-made pieces) or until you approve the stitch proof (made-for-you pieces).</li>
          <li>Unpaid online orders are cancelled automatically after {PENDING_ORDER_MINUTES} minutes and nothing is charged.</li>
          <li>Paid orders that are cancelled are refunded in full to the original payment method.</li>
        </ul>
        <h2>Returns and exchanges</h2>
        <ul>
          <li><b>Ready-made pieces</b> can be returned or exchanged within 7 days of delivery if unused, unwashed and with tags intact. Message us on WhatsApp with your order number to arrange it.</li>
          <li><b>Made-for-you pieces</b> are made only for you, so they can’t be returned or exchanged, unless they arrive damaged, defective or different from the approved proof.</li>
          <li>Thread colours on screens and in proofs can look slightly different from real thread; small variations in hand-finished pieces are part of their charm and aren’t defects.</li>
        </ul>
        <h2>Damaged, defective or wrong items</h2>
        <p>Tell us within 48 hours of delivery with photos. We’ll replace the piece or refund it in full, including shipping.</p>
        <h2>Refunds</h2>
        <ul>
          <li>Refunds go back to the original payment method within 5–7 working days after we approve them (banks may take a little longer to show them).</li>
          <li>For cash-on-delivery orders we refund by bank transfer or UPI.</li>
          <li>Shipping charges and the cash-on-delivery fee are refunded only when the problem was ours.</li>
        </ul>
      </>
    ),
  },
  terms: {
    title: 'Terms of use',
    summary: 'The agreement between you and the studio when you shop with us.',
    body: (s) => (
      <>
        <h2>Who we are</h2>
        <p>This shop is run by {s.legalName}{s.address.length ? `, ${s.address.join(', ')}` : ''}{s.gstin ? ` (GSTIN ${s.gstin})` : ''}. All products are made in India.</p>
        <h2>Orders and prices</h2>
        <ul>
          <li>Prices are in Indian rupees and include GST. The total you see before paying includes delivery and any fees.</li>
          <li>An order is confirmed when it’s paid (or, for cash on delivery, when we confirm it). We may cancel and fully refund an order if a piece is unavailable or a price was shown in error.</li>
        </ul>
        <h2>Personalised and logo pieces</h2>
        <ul>
          <li>Please check names and spellings carefully; we stitch exactly what you approve in the proof.</li>
          <li>Only upload logos, artwork and photos that you own or have permission to use. You allow us to use them only to make and show you your order.</li>
          <li>We may decline designs that are offensive, unlawful or that infringe someone else’s rights.</li>
        </ul>
        <h2>Payments</h2>
        <p>Online payments are processed securely by Razorpay. We never see or store your card details.</p>
        <h2>Our responsibility</h2>
        <p>We make every piece with care. If something goes wrong, our responsibility is limited to repairing, replacing or refunding the piece concerned, as described in our returns policy. Nothing here limits your rights under the Consumer Protection Act, 2019.</p>
        <h2>Disputes</h2>
        <p>These terms are governed by the laws of India{s.jurisdictionCity ? `, and the courts at ${s.jurisdictionCity} have jurisdiction` : ''}. Please write to us first; most problems are solved quickly. See the <Link className="link" href="/contact">contact page</Link> for our grievance officer.</p>
      </>
    ),
  },
  privacy: {
    title: 'Privacy policy',
    summary: 'What we collect, why, and your choices (Digital Personal Data Protection Act, 2023).',
    body: (s) => (
      <>
        <h2>What we collect</h2>
        <ul>
          <li>Your mobile number (to log in and send order updates), name, email and delivery address.</li>
          <li>Your orders, and files you upload for them: logos, artwork and pet photos.</li>
          <li>Payment status from Razorpay (not your card or bank details).</li>
          <li>Basic technical data such as your IP address, used to keep the shop secure and prevent abuse.</li>
        </ul>
        <h2>Why we use it</h2>
        <ul>
          <li>To make, deliver and support your orders, and to send stitch proofs and updates (WhatsApp, SMS or email; you can turn WhatsApp updates off in your account).</li>
          <li>To issue GST invoices and keep the records tax law requires.</li>
          <li>To prevent fraud and misuse.</li>
        </ul>
        <p>We don’t sell your data and we don’t send marketing messages without your consent.</p>
        <h2>Who we share it with</h2>
        <p>Only what each partner needs to do their job: courier partners (delivery details), Razorpay (payments), our SMS, WhatsApp and email providers (messages) and our hosting providers.</p>
        <h2>How long we keep it</h2>
        <p>Order and invoice records are kept for as long as tax law requires (currently up to 8 years). Files you upload for a bag you never order are deleted after 30 days. Ask us anytime to delete your account and data we don’t need to keep by law.</p>
        <h2>Your rights</h2>
        <p>You can ask to see, correct or delete your personal data, withdraw consent, or raise a grievance by writing to {s.email}{s.grievanceOfficer ? ` (grievance officer: ${s.grievanceOfficer})` : ''}. If you’re not satisfied, you can approach the Data Protection Board of India.</p>
        <h2>Cookies and storage</h2>
        <p>We use one essential cookie to keep you logged in. Your bag and wishlist are saved in your own browser. We don’t use advertising trackers.</p>
      </>
    ),
  },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = PAGES[(await params).slug];
  return page ? { title: page.title, description: page.summary } : {};
}

export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) notFound();
  const store = await getStoreInfo();
  return (
    <main className="co-page">
      <div className="wrap legal">
        <PolicyNav current={slug} />
        <article>
          <span className="kicker">Policies</span>
          <h1>{page.title}</h1>
          <p className="upd">{page.summary}</p>
          {page.body(store)}
          <p className="draft">Draft for review: please have these policies checked by your lawyer before launch.</p>
        </article>
      </div>
    </main>
  );
}
