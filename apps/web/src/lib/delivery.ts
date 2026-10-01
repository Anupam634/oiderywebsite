/* Delivery estimate by pincode (demo zones until the courier API is connected in phase 2). */
export const PINS: Record<string, [string, string]> = {
  '400001': ['Mumbai', 'Maharashtra'], '400050': ['Mumbai', 'Maharashtra'], '110001': ['New Delhi', 'Delhi'], '560001': ['Bengaluru', 'Karnataka'],
  '411001': ['Pune', 'Maharashtra'], '226001': ['Lucknow', 'Uttar Pradesh'], '700001': ['Kolkata', 'West Bengal'], '600001': ['Chennai', 'Tamil Nadu'],
  '500001': ['Hyderabad', 'Telangana'], '380001': ['Ahmedabad', 'Gujarat'], '302001': ['Jaipur', 'Rajasthan'], '160017': ['Chandigarh', 'Chandigarh'],
  '452001': ['Indore', 'Madhya Pradesh'], '682001': ['Kochi', 'Kerala'], '751001': ['Bhubaneswar', 'Odisha'], '781001': ['Guwahati', 'Assam'],
};
export const isPincode = (v: string) => /^[1-9]\d{5}$/.test(v);
export const transitDays = (pin: string) => ({ 1: 4, 2: 5, 3: 3, 4: 3, 5: 4, 6: 5, 7: 5, 8: 6, 9: 7 } as Record<number, number>)[Number(pin[0])] ?? 5;
export const dateIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
