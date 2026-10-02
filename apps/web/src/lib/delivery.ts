/* Delivery estimate by pincode (shared with the API so checkout and the order agree). */
export { isPincode, transitDays, deliveryDays, MAKE_DAYS } from '@store/shared';

export const dateIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
