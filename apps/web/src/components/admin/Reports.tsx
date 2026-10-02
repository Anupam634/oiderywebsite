'use client';
import { useState } from 'react';
import { useAdmin } from '@/lib/admin-api';
import { Report } from '../icons';
import { PageHead } from './ui';

/* GST files for the accountant: pick a period, download CSVs that open in Excel (owner only). */

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** handy periods: months, the GST quarter (Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar) and the financial year */
function periods(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = m - (m % 3);
  const fy = m >= 3 ? new Date(y, 3, 1) : new Date(y - 1, 3, 1);
  return [
    { key: 'this-month', label: 'This month', from: ymd(new Date(y, m, 1)), to: ymd(now) },
    { key: 'last-month', label: 'Last month', from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) },
    { key: 'last-quarter', label: 'Last quarter', from: ymd(new Date(y, q - 3, 1)), to: ymd(new Date(y, q, 0)) },
    { key: 'fy', label: 'This financial year', from: ymd(fy), to: ymd(now) },
  ];
}

const FILES = [
  { file: 'gst-sales.csv', title: 'Sales register', text: 'Every invoice line: HSN, GST rate, taxable value, CGST, SGST, IGST and place of supply. For GSTR-1 and GSTR-3B.' },
  { file: 'gst-hsn.csv', title: 'HSN summary', text: 'Totals by HSN code and GST rate, B2B and B2C apart (GSTR-1 table 12).' },
  { file: 'refunds.csv', title: 'Refunds', text: 'Every refund with its order and invoice number, so credit notes can be issued.' },
];

export function Reports() {
  const me = useAdmin();
  const ps = periods();
  const [from, setFrom] = useState(ps[1]!.from);
  const [to, setTo] = useState(ps[1]!.to);
  if (me && me.role !== 'OWNER') {
    return (
      <>
        <PageHead title="Reports" />
        <div className="panel"><p className="muted">Only the studio owner can download reports.</p></div>
      </>
    );
  }
  const bad = !from || !to || from > to;
  return (
    <>
      <PageHead title="Reports" sub="GST files for your accountant. They open in Excel and match your invoices to the paisa." />
      <div className="panel">
        <h2>Period</h2>
        <div className="rep-quick">
          {ps.map((p) => (
            <button key={p.key} type="button" className="pill" aria-pressed={from === p.from && to === p.to} onClick={() => { setFrom(p.from); setTo(p.to); }}>{p.label}</button>
          ))}
        </div>
        <div className="formgrid">
          <label className="f"><span>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className={`f${bad ? ' bad' : ''}`}><span>To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /><small>{bad ? 'Pick an end date on or after the start' : ' '}</small></label>
        </div>
      </div>
      <div className="panel">
        <h2>Download</h2>
        <div className="rep-files">
          {FILES.map((f) => (
            <a key={f.file} className="rep-file" aria-disabled={bad} href={bad ? undefined : `/api/v1/admin/reports/${f.file}?from=${from}&to=${to}`} download>
              <i><Report /></i>
              <span><b>{f.title}</b><small>{f.text}</small></span>
              <em>CSV ↓</em>
            </a>
          ))}
        </div>
        <p className="muted">
          Invoices count on the day they were issued (Orders → Issue invoice). An order cancelled after its invoice needs a credit note: the
          “Order status” column shows those.
        </p>
      </div>
    </>
  );
}
