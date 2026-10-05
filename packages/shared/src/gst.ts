/* GST on the store's prices. Shelf prices include GST; the invoice splits each line into taxable value
   and tax (CGST + SGST inside the seller's state, IGST outside it).

   The rates here are defaults to get started. HSN codes and rates must be confirmed by the studio's
   chartered accountant; the admin can change them per product. */

export type GstRule = 'threshold' | 'flat';

/** Textiles and clothing (HSN chapters 61–63): 5% when a piece sells for up to ₹2,500 before tax, 18% above. */
export const TEXTILE_GST = { lowBp: 500, highBp: 1800, thresholdPaise: 250_000 } as const;

export const GST_RATES_BP = [0, 500, 1200, 1800, 2800, 4000] as const;

/** GST rate in basis points (500 = 5%) for one piece whose value including GST is `piecePaise`. */
export function gstRateBp(rule: string, flatBp: number, piecePaise: number): number {
  if (rule !== 'threshold') return flatBp;
  // the threshold applies to the value before tax; try the low rate first
  const beforeTax = Math.round((piecePaise * 10_000) / (10_000 + TEXTILE_GST.lowBp));
  return beforeTax <= TEXTILE_GST.thresholdPaise ? TEXTILE_GST.lowBp : TEXTILE_GST.highBp;
}

export const formatRate = (bp: number) => `${bp % 100 ? (bp / 100).toFixed(1) : bp / 100}%`;

/* ---------- states (GST state codes appear in GSTINs and as the place of supply) ---------- */
export const GST_STATE_CODES: Record<string, string> = {
  'Jammu and Kashmir': '01', 'Himachal Pradesh': '02', Punjab: '03', Chandigarh: '04', Uttarakhand: '05', Haryana: '06',
  Delhi: '07', Rajasthan: '08', 'Uttar Pradesh': '09', Bihar: '10', Sikkim: '11', 'Arunachal Pradesh': '12', Nagaland: '13',
  Manipur: '14', Mizoram: '15', Tripura: '16', Meghalaya: '17', Assam: '18', 'West Bengal': '19', Jharkhand: '20', Odisha: '21',
  Chhattisgarh: '22', 'Madhya Pradesh': '23', Gujarat: '24', 'Dadra and Nagar Haveli and Daman and Diu': '26', Maharashtra: '27',
  Karnataka: '29', Goa: '30', Lakshadweep: '31', Kerala: '32', 'Tamil Nadu': '33', Puducherry: '34',
  'Andaman and Nicobar Islands': '35', Telangana: '36', 'Andhra Pradesh': '37', Ladakh: '38',
};

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Format check plus the GSTIN check digit (the 15th character). */
export function isValidGstin(gstin: string): boolean {
  const g = gstin.trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = GSTIN_CHARS.indexOf(g[i]!) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === g[14];
}

/** Indian financial year of a moment, in India time (the year turns at midnight IST on 1 April): 1 Oct 2026 → "2026-27" */
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** "ZF" + "2026-27" + 7 → "ZF/2026-27/0007" (GST invoice numbers: up to 16 characters, consecutive in a year) */
export const invoiceNumber = (prefix: string, fy: string, seq: number) => `${prefix}/${fy}/${String(seq).padStart(4, '0')}`;

/* ---------- invoice maths ---------- */

export interface InvoiceLineInput {
  name: string;
  hsn: string;
  qty: number;
  /** per piece, including GST */
  unitPricePaise: number;
  /** one-time charge on the line (logo digitizing), including GST */
  extraPaise: number;
  rule: string;
  flatBp: number;
}

export interface InvoiceLine extends InvoiceLineInput {
  grossPaise: number;
  /** share of order discounts (coupon, Buy 2, UPI) */
  discountPaise: number;
  /** share of shipping and cash-handling charges */
  chargesPaise: number;
  /** what the customer pays for this line, including GST */
  valuePaise: number;
  rateBp: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface InvoiceTotals {
  grossPaise: number;
  discountPaise: number;
  chargesPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

/** Split `total` across lines in proportion to `weights`, in whole paise that add up exactly. */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!total || !sum) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k++, rest--) out[order[k % order.length]![1]]!++;
  return out;
}

/**
 * Invoice lines for an order. Order-level discounts and charges are shared out over the lines by value, so
 * each line is taxed at its own rate and the lines add up to the order total to the paisa.
 */
export function computeInvoice(input: {
  lines: InvoiceLineInput[];
  discountPaise: number;
  chargesPaise: number;
  interState: boolean;
}): { lines: InvoiceLine[]; totals: InvoiceTotals; byRate: { rateBp: number; taxablePaise: number; taxPaise: number }[] } {
  const gross = input.lines.map((l) => l.qty * l.unitPricePaise + l.extraPaise);
  const disc = allocate(input.discountPaise, gross);
  const charges = allocate(input.chargesPaise, gross);
  const lines = input.lines.map((l, i): InvoiceLine => {
    const grossPaise = gross[i]!;
    const discountPaise = disc[i]!;
    const chargesPaise = charges[i]!;
    const valuePaise = grossPaise - discountPaise + chargesPaise;
    const rateBp = gstRateBp(l.rule, l.flatBp, Math.round((grossPaise - discountPaise) / Math.max(1, l.qty)));
    const taxablePaise = Math.round((valuePaise * 10_000) / (10_000 + rateBp));
    const tax = valuePaise - taxablePaise;
    const half = Math.floor(tax / 2);
    return {
      ...l,
      grossPaise,
      discountPaise,
      chargesPaise,
      valuePaise,
      rateBp,
      taxablePaise,
      cgstPaise: input.interState ? 0 : half,
      sgstPaise: input.interState ? 0 : tax - half,
      igstPaise: input.interState ? tax : 0,
    };
  });
  const sum = (k: keyof InvoiceLine) => lines.reduce((a, l) => a + (l[k] as number), 0);
  const rates = new Map<number, { taxablePaise: number; taxPaise: number }>();
  for (const l of lines) {
    const r = rates.get(l.rateBp) ?? { taxablePaise: 0, taxPaise: 0 };
    r.taxablePaise += l.taxablePaise;
    r.taxPaise += l.cgstPaise + l.sgstPaise + l.igstPaise;
    rates.set(l.rateBp, r);
  }
  return {
    lines,
    totals: {
      grossPaise: sum('grossPaise'),
      discountPaise: sum('discountPaise'),
      chargesPaise: sum('chargesPaise'),
      taxablePaise: sum('taxablePaise'),
      cgstPaise: sum('cgstPaise'),
      sgstPaise: sum('sgstPaise'),
      igstPaise: sum('igstPaise'),
      totalPaise: sum('valuePaise'),
    },
    byRate: [...rates].sort((a, b) => a[0] - b[0]).map(([rateBp, r]) => ({ rateBp, ...r })),
  };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n: number) => (n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const below1000 = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? below100(n % 100) : ''].filter(Boolean).join(' ');

/** 327800 paise → "Rupees Three Thousand Two Hundred Seventy Eight Only" (Indian grouping: lakh, crore) */
export function amountInWords(paise: number): string {
  let n = Math.round(paise / 100);
  if (n === 0) return 'Rupees Zero Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return `Rupees ${parts.join(' ')} Only`;
}
