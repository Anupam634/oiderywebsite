import { z } from 'zod';
import { PHONE_RE } from './phone';

/* Contact + delivery details. The web form and (phase 2) the orders API validate with the same schema. */

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
] as const;

export const PINCODE_RE = /^[1-9]\d{5}$/;
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, msg);

export const checkoutDetailsSchema = z
  .object({
    phone: z.string().regex(PHONE_RE, 'Enter a 10-digit mobile number'),
    email: z.union([z.literal(''), z.email('Enter a valid email, or leave it empty')]),
    whatsappUpdates: z.boolean(),
    pincode: z.string().regex(PINCODE_RE, 'Enter a 6-digit pincode'),
    name: text(2, 80, 'Enter your full name'),
    line1: text(3, 120, 'Enter your flat or house number'),
    line2: text(3, 120, 'Enter your area or street'),
    landmark: z.string().trim().max(80),
    city: text(2, 60, 'Enter your city'),
    state: z.enum(INDIAN_STATES, 'Choose your state'),
    addressType: z.enum(['home', 'work', 'other']),
    gst: z
      .object({
        gstin: z.string().trim().toUpperCase().regex(GSTIN_RE, 'Enter a valid 15-character GSTIN'),
        business: text(2, 120, 'Enter your business name'),
      })
      .nullable(),
    giftNote: z.string().trim().max(150).nullable(),
  });

export type CheckoutDetails = z.infer<typeof checkoutDetailsSchema>;
export type CheckoutField = 'phone' | 'email' | 'pincode' | 'name' | 'line1' | 'line2' | 'city' | 'state' | 'gstin' | 'business';

/** First error message per field, keyed the way the form names its inputs. */
export function checkoutErrors(input: unknown): Partial<Record<CheckoutField, string>> {
  const r = checkoutDetailsSchema.safeParse(input);
  if (r.success) return {};
  const out: Partial<Record<CheckoutField, string>> = {};
  for (const issue of r.error.issues) {
    const key = (issue.path[0] === 'gst' ? issue.path[1] : issue.path[0]) as CheckoutField;
    out[key] ??= issue.message;
  }
  return out;
}
