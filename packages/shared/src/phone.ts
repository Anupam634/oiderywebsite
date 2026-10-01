/* Indian mobile numbers. We store the 10 digits only; +91 is added when we display or send. */

export const PHONE_RE = /^[6-9]\d{9}$/;

/** "+91 98765-43210", "098765 43210", "9876543210" → "9876543210"; null if it isn't an Indian mobile */
export function normalisePhone(input: string): string | null {
  const d = input.replace(/\D/g, '');
  const n = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return PHONE_RE.test(n) ? n : null;
}

/** "9876543210" → "+91 98765 43210" */
export const formatPhone = (p: string) => `+91 ${p.slice(0, 5)} ${p.slice(5)}`;

/** "9876543210" → "+91 ••••• •3210" for messages that shouldn't show the full number */
export const maskPhone = (p: string) => `+91 ••••• •${p.slice(-4)}`;
