/* Draws a sample GST invoice to check the layout: npx tsx scripts/sample-invoice.ts out.pdf [inter] */
import fs from 'node:fs';
import { amountInWords, computeInvoice } from '@store/shared';
import { renderInvoicePdf } from '../src/modules/invoice/pdf.ts';
import { DEFAULT_SETTINGS } from '../src/modules/settings/service.ts';

const interState = process.argv.includes('inter');
const inv = computeInvoice({
  lines: [
    { name: 'Lal Yoke Embroidered Kurta', hsn: '6211', qty: 1, unitPricePaise: 249_900, extraPaise: 0, rule: 'threshold', flatBp: 500 },
    { name: 'Phoolwari Name Tote · “प्रिया” in हिंदी', hsn: '4202', qty: 2, unitPricePaise: 119_900, extraPaise: 0, rule: 'flat', flatBp: 1800 },
    { name: 'T-shirt with your logo', hsn: '6109', qty: 30, unitPricePaise: 47_500, extraPaise: 0, rule: 'threshold', flatBp: 500 },
  ],
  discountPaise: 60_000,
  chargesPaise: 14_900,
  interState,
});
const pdf = await renderInvoicePdf({
  number: 'ZF/2026-27/0042',
  issuedAt: new Date().toISOString(),
  orderNumber: 'ZF-7Q4M2X',
  orderDate: new Date().toISOString(),
  paymentMethod: 'UPI',
  seller: { ...DEFAULT_SETTINGS, gstin: '27AAPFU0939F1ZV', addressLine1: 'Shop 4, Rangoli Arcade', addressLine2: 'FC Road', city: 'Pune', pincode: '411004' },
  buyer: { name: 'Priya Sharma', phone: '9876543210', email: 'priya@example.com', address: ['Flat 402, Gulmohar Apartments, Linking Road', interState ? 'Bengaluru, Karnataka 560001' : 'Mumbai, Maharashtra 400050'], state: interState ? 'Karnataka' : 'Maharashtra', stateCode: interState ? '29' : '27', gstin: '29AAGCB7383J1Z4', business: 'Chai Co. Pvt Ltd' },
  placeOfSupply: interState ? 'Karnataka (29)' : 'Maharashtra (27)',
  interState,
  registered: true,
  lines: inv.lines,
  totals: inv.totals,
  byRate: inv.byRate,
  amountInWords: amountInWords(inv.totals.totalPaise),
});
fs.writeFileSync(process.argv[2] ?? 'sample-invoice.pdf', pdf);
console.log('total', inv.totals.totalPaise, 'tax', inv.totals.cgstPaise + inv.totals.sgstPaise + inv.totals.igstPaise);
