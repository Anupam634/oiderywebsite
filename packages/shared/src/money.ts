/** All money is stored and sent as integer paise (₹1 = 100 paise), the unit payment gateways use. */
export type Paise = number;

const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 119900 -> "₹1,199" (whole rupees; prices in this store never use paise) */
export function formatINR(paise: Paise): string {
  return '₹' + inrFmt.format(Math.round(paise / 100));
}

export function rupees(paise: Paise): number {
  return Math.round(paise / 100);
}

/** Discount percentage shown next to a struck-through MRP. */
export function percentOff(price: Paise, mrp: Paise | null | undefined): number {
  if (!mrp || mrp <= price) return 0;
  return Math.round((1 - price / mrp) * 100);
}
