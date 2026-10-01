/* Delivery estimates by pincode. Demo zones until a courier API (e.g. Shiprocket serviceability) is connected:
   the first digit of an Indian pincode is the postal region. */

export const PINS: Record<string, [city: string, state: string]> = {
  '400001': ['Mumbai', 'Maharashtra'], '400050': ['Mumbai', 'Maharashtra'], '110001': ['New Delhi', 'Delhi'], '560001': ['Bengaluru', 'Karnataka'],
  '411001': ['Pune', 'Maharashtra'], '226001': ['Lucknow', 'Uttar Pradesh'], '700001': ['Kolkata', 'West Bengal'], '600001': ['Chennai', 'Tamil Nadu'],
  '500001': ['Hyderabad', 'Telangana'], '380001': ['Ahmedabad', 'Gujarat'], '302001': ['Jaipur', 'Rajasthan'], '160017': ['Chandigarh', 'Chandigarh'],
  '452001': ['Indore', 'Madhya Pradesh'], '682001': ['Kochi', 'Kerala'], '751001': ['Bhubaneswar', 'Odisha'], '781001': ['Guwahati', 'Assam'],
};

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
