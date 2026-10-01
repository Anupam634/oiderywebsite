import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { formatINR, formatPhone, formatRate, type InvoiceLine, type InvoiceTotals } from '@store/shared';
import type { StoreSettings } from '../settings/service.ts';

/* Draws the GST invoice (A4) with pdfkit. Mukta covers ₹ and Devanagari (Hindi names and addresses). */

const FONTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/fonts');

export interface InvoiceSnapshot {
  number: string;
  issuedAt: string;
  orderNumber: string;
  orderDate: string;
  paymentMethod: string;
  seller: StoreSettings;
  buyer: {
    name: string;
    phone: string;
    email: string | null;
    address: string[];
    state: string;
    stateCode: string | null;
    gstin: string | null;
    business: string | null;
  };
  placeOfSupply: string;
  interState: boolean;
  registered: boolean;
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  byRate: { rateBp: number; taxablePaise: number; taxPaise: number }[];
  amountInWords: string;
}

const INK = '#1B1030';
const MUTE = '#6E6483';
const LINE = '#EADFD2';
const RANI = '#E4007C';
const CREAM = '#FFF6EA';
const rs = (paise: number) => formatINR(paise).replace('₹', '₹ ');
const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function renderInvoicePdf(s: InvoiceSnapshot): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 32, info: { Title: `Invoice ${s.number}`, Author: s.seller.legalName, Subject: `Order ${s.orderNumber}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('r', path.join(FONTS, 'Mukta-Regular.ttf'));
    doc.registerFont('b', path.join(FONTS, 'Mukta-Bold.ttf'));

    const W = doc.page.width;
    const H = doc.page.height;
    const L = 32;
    const R = W - 32;
    const CW = R - L;

    /* ---- header band ---- */
    const grad = doc.linearGradient(0, 0, W, 90);
    grad.stop(0, '#FF2E93').stop(0.6, '#FF8A00').stop(1, '#FFB300');
    doc.rect(0, 0, W, 92).fill(grad);
    doc.font('b').fontSize(28).fillColor('#fff').text(s.seller.tradeName.toLowerCase(), L, 22, { width: 260 });
    doc.font('r').fontSize(9.5).fillColor('#fff').text(s.seller.legalName, L, 58, { width: 260 });
    doc.font('b').fontSize(17).fillColor('#fff').text(s.registered ? 'TAX INVOICE' : 'INVOICE', L, 24, { width: CW, align: 'right' });
    doc.font('r').fontSize(9).text('Original for recipient', L, 46, { width: CW, align: 'right' });

    /* ---- invoice facts ---- */
    let y = 108;
    const facts: [string, string][] = [
      ['Invoice no.', s.number],
      ['Invoice date', date(s.issuedAt)],
      ['Order no.', s.orderNumber],
      ['Order date', date(s.orderDate)],
      ['Payment', s.paymentMethod],
    ];
    const fw = CW / facts.length;
    facts.forEach(([k, v], i) => {
      doc.font('r').fontSize(8).fillColor(MUTE).text(k.toUpperCase(), L + i * fw, y, { width: fw - 8, characterSpacing: 0.6 });
      doc.font('b').fontSize(11).fillColor(INK).text(v, L + i * fw, y + 11, { width: fw - 8 });
    });
    y += 40;

    /* ---- seller and buyer ---- */
    const boxW = (CW - 14) / 2;
    const seller = [
      s.seller.legalName,
      [s.seller.addressLine1, s.seller.addressLine2].filter(Boolean).join(', '),
      [s.seller.city, s.seller.state, s.seller.pincode].filter(Boolean).join(', '),
      s.seller.gstin ? `GSTIN: ${s.seller.gstin}` : 'Not registered under GST',
      [s.seller.phone, s.seller.email].filter(Boolean).join(' · '),
    ].filter(Boolean);
    const buyer = [
      s.buyer.business ? `${s.buyer.business} (${s.buyer.name})` : s.buyer.name,
      ...s.buyer.address,
      s.buyer.gstin ? `GSTIN: ${s.buyer.gstin}` : '',
      [formatPhone(s.buyer.phone), s.buyer.email].filter(Boolean).join(' · '),
    ].filter(Boolean);
    const boxH = 22 + Math.max(seller.length, buyer.length) * 13.5 + 10;
    const box = (x: number, title: string, rows: string[]) => {
      doc.roundedRect(x, y, boxW, boxH, 10).fill(CREAM);
      doc.font('b').fontSize(8.5).fillColor(RANI).text(title, x + 12, y + 10, { characterSpacing: 0.8 });
      rows.forEach((r, i) => doc.font(i === 0 ? 'b' : 'r').fontSize(i === 0 ? 10.5 : 9.5).fillColor(i === 0 ? INK : '#3A2E4F').text(r, x + 12, y + 24 + i * 13.5, { width: boxW - 24, lineBreak: false, ellipsis: true }));
    };
    box(L, 'SOLD BY', seller);
    box(L + boxW + 14, 'BILL TO / SHIP TO', buyer);
    y += boxH + 8;
    doc.font('r').fontSize(9).fillColor(MUTE).text(`Place of supply: ${s.placeOfSupply}   ·   Reverse charge: No`, L, y, { width: CW });
    y += 20;

    /* ---- items ---- */
    type Col = { key: string; title: string; w: number; align: 'left' | 'right' | 'center' };
    const cols: Col[] = s.registered
      ? s.interState
        ? [
            { key: 'n', title: '#', w: 16, align: 'left' },
            { key: 'item', title: 'Item', w: 190, align: 'left' },
            { key: 'hsn', title: 'HSN', w: 40, align: 'left' },
            { key: 'qty', title: 'Qty', w: 28, align: 'right' },
            { key: 'taxable', title: 'Taxable value', w: 70, align: 'right' },
            { key: 'rate', title: 'GST', w: 36, align: 'right' },
            { key: 'igst', title: 'IGST', w: 70, align: 'right' },
            { key: 'value', title: 'Amount', w: CW - 450, align: 'right' },
          ]
        : [
            { key: 'n', title: '#', w: 16, align: 'left' },
            { key: 'item', title: 'Item', w: 166, align: 'left' },
            { key: 'hsn', title: 'HSN', w: 40, align: 'left' },
            { key: 'qty', title: 'Qty', w: 28, align: 'right' },
            { key: 'taxable', title: 'Taxable value', w: 66, align: 'right' },
            { key: 'rate', title: 'GST', w: 34, align: 'right' },
            { key: 'cgst', title: 'CGST', w: 58, align: 'right' },
            { key: 'sgst', title: 'SGST', w: 58, align: 'right' },
            { key: 'value', title: 'Amount', w: CW - 466, align: 'right' },
          ]
      : [
          { key: 'n', title: '#', w: 16, align: 'left' },
          { key: 'item', title: 'Item', w: 270, align: 'left' },
          { key: 'hsn', title: 'HSN', w: 45, align: 'left' },
          { key: 'qty', title: 'Qty', w: 30, align: 'right' },
          { key: 'value', title: 'Amount', w: CW - 361, align: 'right' },
        ];
    const header = () => {
      doc.rect(L, y, CW, 22).fill(INK);
      let x = L;
      for (const c of cols) {
        doc.font('b').fontSize(8.5).fillColor('#fff').text(c.title, x + 4, y + 6.5, { width: c.w - 8, align: c.align });
        x += c.w;
      }
      y += 26;
    };
    header();
    s.lines.forEach((l, i) => {
      const sub = [
        `${money(l.unitPricePaise)} × ${l.qty}${l.extraPaise ? ` + ${money(l.extraPaise)} one-time` : ''}`,
        l.discountPaise ? `discount ${money(l.discountPaise)}` : '',
        l.chargesPaise ? `shipping & handling ${money(l.chargesPaise)}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const itemW = cols.find((c) => c.key === 'item')!.w - 8;
      const rowH = Math.max(doc.font('b').fontSize(9.5).heightOfString(l.name, { width: itemW }) + doc.font('r').fontSize(8).heightOfString(sub, { width: itemW }) + 10, 30);
      if (y + rowH > H - 230) {
        doc.addPage();
        y = 40;
        header();
      }
      const cell: Record<string, string> = {
        n: String(i + 1),
        hsn: l.hsn,
        qty: String(l.qty),
        taxable: money(l.taxablePaise),
        rate: formatRate(l.rateBp),
        cgst: money(l.cgstPaise),
        sgst: money(l.sgstPaise),
        igst: money(l.igstPaise),
        value: money(l.valuePaise),
      };
      let x = L;
      for (const c of cols) {
        if (c.key === 'item') {
          doc.font('b').fontSize(9.5).fillColor(INK).text(l.name, x + 4, y, { width: itemW });
          doc.font('r').fontSize(8).fillColor(MUTE).text(sub, x + 4, doc.y + 1, { width: itemW });
        } else doc.font(c.key === 'value' ? 'b' : 'r').fontSize(9).fillColor(INK).text(cell[c.key] ?? '', x + 4, y, { width: c.w - 8, align: c.align });
        x += c.w;
      }
      y += rowH;
      doc.moveTo(L, y - 5).lineTo(R, y - 5).lineWidth(0.6).strokeColor(LINE).stroke();
    });

    /* ---- totals ---- */
    y += 6;
    const tx = R - 260;
    const row = (k: string, v: string, bold = false, size = 10) => {
      doc.font(bold ? 'b' : 'r').fontSize(size).fillColor(bold ? INK : '#3A2E4F').text(k, tx, y, { width: 180, lineBreak: false });
      doc.font(bold ? 'b' : 'r').fontSize(size).fillColor(INK).text(v, tx + 160, y, { width: 100, align: 'right' });
      y += size + 7;
    };
    if (s.registered) {
      row('Taxable value', money(s.totals.taxablePaise));
      if (s.interState) row('IGST', money(s.totals.igstPaise));
      else {
        row('CGST', money(s.totals.cgstPaise));
        row('SGST', money(s.totals.sgstPaise));
      }
    }
    if (s.totals.discountPaise) row('Discounts (included above)', `−${money(s.totals.discountPaise)}`);
    if (s.totals.chargesPaise) row('Shipping & handling (included above)', money(s.totals.chargesPaise));
    doc.moveTo(tx, y).lineTo(R, y).lineWidth(1).strokeColor(INK).stroke();
    y += 6;
    row('Total', rs(s.totals.totalPaise), true, 15);
    doc.font('r').fontSize(8.5).fillColor(MUTE).text(s.amountInWords, L, y + 2, { width: CW, align: 'right' });
    y += 24;

    if (s.registered && s.byRate.length) {
      doc.font('b').fontSize(8.5).fillColor(RANI).text('GST SUMMARY', L, y, { characterSpacing: 0.8 });
      y += 13;
      for (const r of s.byRate) {
        doc.font('r').fontSize(9).fillColor('#3A2E4F').text(`${formatRate(r.rateBp)} on ${money(r.taxablePaise)}`, L, y, { width: 200 });
        doc.text(`tax ${money(r.taxPaise)}`, L + 200, y, { width: 120 });
        y += 13;
      }
    }

    /* ---- footer ---- */
    const fy = Math.max(y + 24, H - 150);
    doc.roundedRect(L, fy, CW, 74, 10).fill(CREAM);
    doc.font('r').fontSize(9).fillColor('#3A2E4F').text(s.seller.invoiceNote || ' ', L + 14, fy + 12, { width: CW - 220 });
    doc.font('b').fontSize(9.5).fillColor(INK).text(`For ${s.seller.legalName}`, R - 200, fy + 12, { width: 186, align: 'right' });
    doc.font('r').fontSize(8.5).fillColor(MUTE).text('Authorised signatory', R - 200, fy + 52, { width: 186, align: 'right' });
    doc.font('r').fontSize(8).fillColor(MUTE).text('This is a computer-generated invoice and does not need a signature.', L, fy + 84, { width: CW, align: 'center' });
    doc.end();
  });
}
