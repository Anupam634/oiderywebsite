/* Names and initials stitched on personalised pieces. */
export const FONT_KEYS = ['script', 'classic', 'bold', 'hindi'] as const;
export type FontKey = (typeof FONT_KEYS)[number];

/** The 12 named threads customers can pick for names (hex values live in @store/stitch). */
export const THREAD_KEYS = ['rani', 'gulaab', 'sindoor', 'kesar', 'haldi', 'mehendi', 'mor', 'neel', 'jamun', 'chandi', 'moti', 'kajal'] as const;
export type ThreadKey = (typeof THREAD_KEYS)[number];
export const THREAD_LABEL: Record<ThreadKey, string> = {
  rani: 'Rani', gulaab: 'Gulaab', sindoor: 'Sindoor', kesar: 'Kesar', haldi: 'Haldi', mehendi: 'Mehendi',
  mor: 'Mor', neel: 'Neel', jamun: 'Jamun', chandi: 'Chandi', moti: 'Moti', kajal: 'Kajal',
};
export const FONT_LABEL: Record<FontKey, string> = { script: 'Script', classic: 'Classic', bold: 'Bold', hindi: 'हिंदी' };

/** Flower presets for the Phoolwari bouquet: [big rose, daisy, leaves, small rose] */
export const FLOWER_PRESETS = [
  { name: 'Rani & Neel', threads: ['rani', 'neel', 'mehendi', 'gulaab'] },
  { name: 'Kesar & Mor', threads: ['kesar', 'mor', 'mehendi', 'gulaab'] },
  { name: 'Gulaab & Jamun', threads: ['gulaab', 'jamun', 'mehendi', 'rani'] },
  { name: 'Sindoor & Haldi', threads: ['sindoor', 'haldi', 'mehendi', 'kesar'] },
] as const satisfies readonly { name: string; threads: readonly ThreadKey[] }[];

/** Keep letters (any script), marks (for Devanagari), digits, spaces and . & ' ! - ; drop emoji and symbols. */
export function cleanName(s: string): string {
  return s.replace(/[^\p{L}\p{M}\p{N} .&'!-]/gu, '');
}

export const hasDevanagari = (s: string) => /[ऀ-ॿ]/.test(s);

/** Letters as people count them (a Devanagari conjunct counts once per code point group). */
export const visibleLength = (s: string) => [...s].length;

export type NameCheck = { ok: true; text: string } | { ok: false; reason: 'empty' | 'too_long' | 'symbols_removed'; text: string };

/** Validate a name for stitching. Symbols are removed (reported, not fatal); empty or too long is fatal. */
export function checkName(raw: string, maxLength: number): NameCheck {
  const text = cleanName(raw).trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, reason: 'empty', text };
  if (visibleLength(text) > maxLength) return { ok: false, reason: 'too_long', text };
  return { ok: true, text };
}
