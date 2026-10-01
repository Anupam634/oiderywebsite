/* Product photos live under /public for now (switch NEXT_PUBLIC_MEDIA_BASE to a CDN later). Uploaded files
   come from the API: /v1/media/… (public) and signed /v1/files/… links, reached through the /api proxy. */
const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE ?? '/';
export const media = (path: string) =>
  /^(https?:|data:|blob:)/.test(path) ? path : path.startsWith('/v1/') ? `/api${path}` : MEDIA_BASE + path.replace(/^\//, '');
