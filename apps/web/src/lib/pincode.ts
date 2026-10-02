'use client';
import { useEffect, useRef, useState } from 'react';
import { isPincode, type PincodeInfo } from '@store/shared';
import { api } from './api';

/* City and state for a pincode, looked up once it has 6 digits (India Post's directory, through the API).
   Answers are remembered for the visit. */

export type PincodeLookup =
  | { status: 'idle' | 'checking' | 'error' }
  | { status: 'unknown' }
  | { status: 'found'; info: PincodeInfo };

const known = new Map<string, PincodeInfo | null>();

/** `onFound` runs once per new pincode that is found, e.g. to fill in the city and state */
export function usePincode(pin: string, onFound?: (info: PincodeInfo) => void): PincodeLookup {
  const [result, setResult] = useState<PincodeLookup>({ status: 'idle' });
  const found = useRef(onFound);
  found.current = onFound;
  useEffect(() => {
    if (!isPincode(pin)) {
      setResult({ status: 'idle' });
      return;
    }
    let live = true;
    const settle = (info: PincodeInfo | null) => {
      if (!live) return;
      setResult(info ? { status: 'found', info } : { status: 'unknown' });
      if (info) found.current?.(info);
    };
    if (known.has(pin)) settle(known.get(pin)!);
    else {
      setResult({ status: 'checking' });
      api.pincode(pin).then(
        (info) => {
          known.set(pin, info);
          settle(info);
        },
        () => live && setResult({ status: 'error' }),
      );
    }
    return () => {
      live = false;
    };
  }, [pin]);
  return result;
}

/** the line under a pincode field; tone is its class name */
export function pincodeNote(r: PincodeLookup): { tone: 'pin-ok' | 'pin-warn' | 'pin-wait'; text: string } {
  if (r.status === 'checking') return { tone: 'pin-wait', text: 'Finding your city…' };
  if (r.status === 'found') return { tone: 'pin-ok', text: `✓ ${[r.info.city, r.info.state].filter(Boolean).join(', ')} · we deliver here` };
  if (r.status === 'unknown') return { tone: 'pin-warn', text: 'We couldn’t find this pincode. Please check it, or fill in the city and state yourself.' };
  return { tone: 'pin-ok', text: '' };
}
