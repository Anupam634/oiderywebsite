/** Store identity: change it here and every page and email follows. */
export const BRAND = {
  name: 'Zulyf',
  legalName: 'Zulyf',
  tagline: 'Embroidered clothing, home décor and personalised gifts',
  whatsapp: '+91 00000 00000',
  supportEmail: 'hello@zulyf.com',
  gstin: null as string | null,
  currency: 'INR',
  /** order numbers look like ZF-7Q4M2X; invoices ZF/2026-27/0001 */
  orderPrefix: 'ZF',
} as const;
