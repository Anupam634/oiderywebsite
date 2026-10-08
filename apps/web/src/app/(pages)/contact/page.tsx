import type { Metadata } from 'next';
import { BRAND } from '@store/shared';
import { PolicyNav } from '@/components/PolicyNav';
import { getStoreInfo } from '@/lib/store-info';
import '@/styles/checkout.css';
import '@/styles/account.css';

export const metadata: Metadata = { title: 'Contact us', description: `Talk to the ${BRAND.name} studio: WhatsApp, email, address and grievance officer.` };

export default async function ContactPage() {
  const s = await getStoreInfo();
  const wa = s.phone.replace(/\D/g, '');
  return (
    <main className="co-page">
      <div className="wrap legal">
        <PolicyNav current="contact" />
        <article>
          <span className="kicker">We’re here to help</span>
          <h1>Contact the studio</h1>
          <p className="upd">The fastest way to reach us is WhatsApp. We reply within a few hours, Monday to Saturday, 10 am – 7 pm.</p>
          <div className="contact-cards">
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener"><span>WhatsApp</span><b>{s.phone}</b></a>
            <a href={`mailto:${s.email}`}><span>Email</span><b>{s.email}</b></a>
            <div><span>Order help</span><b>Your order page</b><small>Track, cancel or pay from <a className="link" href="/account">My account</a></small></div>
          </div>
          <h2>Business details</h2>
          <p>
            {BRAND.name} is a brand of <b>{s.legalName}</b>.
            <br />Owner: {BRAND.owner}
            <br />Email: <a className="link" href={`mailto:${s.email}`}>{s.email}</a>
            <br />Phone / WhatsApp: <a className="link" href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>{s.phone}</a>
          </p>
          {s.address.length > 0 && (
            <>
              <h2>Studio address</h2>
              <p>
                {s.legalName}
                {s.address.map((line) => (
                  <span key={line}><br />{line}</span>
                ))}
                {s.gstin && <><br />GSTIN {s.gstin}</>}
              </p>
            </>
          )}
          <h2>Grievance officer</h2>
          <p>
            {s.grievanceOfficer ?? 'To be appointed'}, {s.legalName}. Email {s.email}. We acknowledge every complaint within 48 hours and resolve it within one month.
          </p>
          <h2>Bulk and corporate orders</h2>
          <p>Planning uniforms, merchandise or gifts for a team or event? Send your logo and quantity on WhatsApp for a quote and a physical sample.</p>
        </article>
      </div>
    </main>
  );
}
