/** Product media lives under /public for now; switch MEDIA_BASE to a CDN (e.g. R2) later. */
const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE ?? '/';
export const media = (path: string) => (/^https?:/.test(path) ? path : MEDIA_BASE + path.replace(/^\//, ''));
