import fs from 'node:fs';
import type { PincodeInfo } from '@store/shared';
import { fromApiRoot } from '../../lib/paths.ts';

/* India Post's pincode directory, reduced to pincode -> city, state (assets/pincodes.tsv, made by
   scripts/build-pincodes.py). About 19,600 pincodes, read once on first use. */

let table: Map<string, [city: string, state: string]> | undefined;

function load(): Map<string, [string, string]> {
  const m = new Map<string, [string, string]>();
  for (const line of fs.readFileSync(fromApiRoot('assets', 'pincodes.tsv'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [pin, city = '', state] = line.split('\t');
    if (pin && state) m.set(pin, [city, state]);
  }
  return m;
}

export function lookupPincode(pin: string): PincodeInfo | null {
  table ??= load();
  const hit = table.get(pin);
  return hit ? { pincode: pin, city: hit[0], state: hit[1] } : null;
}
