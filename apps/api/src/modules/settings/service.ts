import { z } from 'zod';
import { BRAND, GSTIN_RE, INDIAN_STATES, PINCODE_RE } from '@store/shared';
import type { Db } from '../../lib/prisma.ts';

/* Store-wide settings the owner edits in the admin: who the seller is (for invoices), contact numbers. */

export const storeSettingsSchema = z.object({
  legalName: z.string().trim().min(2).max(120),
  tradeName: z.string().trim().min(1).max(60),
  /** blank until the studio is GST-registered: invoices then say "Invoice" without a tax split */
  gstin: z.union([z.literal(''), z.string().trim().toUpperCase().regex(GSTIN_RE, 'Enter a valid 15-character GSTIN')]),
  addressLine1: z.string().trim().max(120),
  addressLine2: z.string().trim().max(120),
  city: z.string().trim().max(60),
  state: z.enum(INDIAN_STATES),
  pincode: z.union([z.literal(''), z.string().regex(PINCODE_RE)]),
  phone: z.string().trim().max(20),
  email: z.union([z.literal(''), z.email()]),
  /** invoice numbers: PREFIX/2026-27/0001 */
  invoicePrefix: z.string().trim().regex(/^[A-Z0-9]{1,5}$/, 'Use 1–5 capital letters or digits'),
  /** printed under the totals */
  invoiceNote: z.string().trim().max(300),
});
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const DEFAULT_SETTINGS: StoreSettings = {
  legalName: BRAND.legalName,
  tradeName: BRAND.name,
  gstin: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: 'Maharashtra',
  pincode: '',
  phone: BRAND.whatsapp,
  email: BRAND.supportEmail,
  invoicePrefix: BRAND.orderPrefix,
  invoiceNote: 'Thank you for shopping with us. Made-for-you pieces can’t be returned; ready-made pieces can be exchanged within 7 days.',
};

export async function getStoreSettings(db: Db): Promise<StoreSettings> {
  const row = await db.setting.findUnique({ where: { key: 'store' } });
  const merged = { ...DEFAULT_SETTINGS, ...((row?.value as Partial<StoreSettings> | undefined) ?? {}) };
  const parsed = storeSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveStoreSettings(db: Db, next: StoreSettings) {
  await db.setting.upsert({ where: { key: 'store' }, create: { key: 'store', value: next }, update: { value: next } });
  return next;
}
