/* Delivery estimates by pincode. Demo zones until a courier API (e.g. Shiprocket serviceability) is connected:
   the first digit of an Indian pincode is the postal region. City and state come from the API (PincodeInfo). */

/** GET /v1/pincodes/:pin: where a pincode is, from India Post's pincode directory (city can be empty). */
export interface PincodeInfo {
  pincode: string;
  city: string;
  state: string;
}

export const isPincode = (v: string) => /^[1-9]\d{5}$/.test(v);

/** courier days for standard delivery */
export const transitDays = (pin: string) => ({ 1: 4, 2: 5, 3: 3, 4: 3, 5: 4, 6: 5, 7: 5, 8: 6, 9: 7 } as Record<number, number>)[Number(pin[0])] ?? 5;

/** days until delivery: making time (1 for ready pieces) + courier days (express saves up to 2) */
export function deliveryDays(pin: string, opts: { express: boolean; makeDays: number }): number {
  const base = isPincode(pin) ? transitDays(pin) : 5;
  return opts.makeDays + (opts.express ? Math.max(1, base - 2) : base);
}

/** making time for a bag: ready-made pieces ship next day, made-for-you pieces take a proof plus stitching */
export const MAKE_DAYS = { ready: 1, custom: 6 } as const;
