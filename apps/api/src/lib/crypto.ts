import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

/* Small, dependency-free crypto helpers (node:crypto). */

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const hmacHex = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');

/** constant-time comparison of two strings */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** URL-safe random token (session cookies, proof links) */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** n random digits, e.g. an OTP */
export const randomDigits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join('');

/** customer-facing codes without look-alike characters (no 0/O, 1/I/L) */
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const randomCode = (n: number) => Array.from({ length: n }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');

/* ---------- passwords (scrypt, N=2^15) ---------- */
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const scryptAsync = (password: string, salt: Buffer, len: number) =>
  new Promise<Buffer>((resolve, reject) => scrypt(password, salt, len, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))));

/** "scrypt$<salt>$<hash>" (base64url) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(key, expected);
}
