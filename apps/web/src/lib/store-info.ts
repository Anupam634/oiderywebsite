import { cache } from 'react';
import { BRAND } from '@store/shared';

/* Seller details for the policy and contact pages, from the store settings the owner edits in the admin. */
export interface StoreInfo {
  legalName: string;
  tradeName: string;
  gstin: string | null;
  address: string[];
  state: string;
  phone: string;
  email: string;
  grievanceOfficer: string | null;
  jurisdictionCity: string | null;
  /** the shop's return rules (Settings) */
  returns: { windowDays: number; refunds: boolean; exchanges: boolean; feePaise: number };
}

export const getStoreInfo = cache(async (): Promise<StoreInfo> => {
  try {
    const res = await fetch(`${process.env.API_URL ?? 'http://localhost:4000'}/v1/store`, { next: { revalidate: 300, tags: ['catalog'] } });
    if (res.ok) return (await res.json()) as StoreInfo;
  } catch {
    /* fall back below */
  }
  return { legalName: BRAND.legalName, tradeName: BRAND.name, gstin: null, address: [], state: '', phone: BRAND.whatsapp, email: BRAND.supportEmail, grievanceOfficer: null, jurisdictionCity: null, returns: { windowDays: 7, refunds: true, exchanges: true, feePaise: 0 } };
});
