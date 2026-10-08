/** Store identity: change it here and every page and email follows. */
export const BRAND = {
  name: 'Zulyf',
  /** the registered company that runs the shop (shown on the site, invoices and to payment gateways) */
  legalName: 'SD TRADERS PVT LTD',
  owner: 'Sourav Dalapati',
  tagline: 'Embroidered clothing, home décor and personalised gifts',
  whatsapp: '+91 96476 28613',
  supportEmail: 'souravdalapati107@gmail.com',
  gstin: null as string | null,
  currency: 'INR',
  /** order numbers look like ZF-7Q4M2X; invoices ZF/2026-27/0001 */
  orderPrefix: 'ZF',
} as const;
