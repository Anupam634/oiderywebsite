/* Uploads pass through the storefront's /api proxy, and hosts cap a request body (Vercel: 4.5 MB).
   lib/shrink.ts fits photos under this before they're sent; anything still bigger is refused politely. */
export const UPLOAD_MAX_BYTES = 4_000_000;
export const TOO_BIG = 'That file is too big to upload (over 4 MB). Please choose a smaller one.';
