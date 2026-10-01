/** Store identity. The real brand is not final yet: change it here and every page and email follows. */
export const BRAND = {
  name: 'Taanka',
  legalName: 'Taanka Studio',
  tagline: 'Embroidered clothing, home décor and personalised gifts',
  whatsapp: '+91 00000 00000',
  supportEmail: 'hello@example.com',
  gstin: null as string | null,
  currency: 'INR',
  /** order numbers look like TK-7Q4M2X; invoices TK/2026-27/0001 */
  orderPrefix: 'TK',
} as const;
