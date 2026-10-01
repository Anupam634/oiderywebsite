import { revalidateTag } from 'next/cache';

/* Called by the API after catalogue edits in the admin, so product pages and listings refresh right away
   instead of waiting for their 60-second cache. Guarded by the shared PROXY_KEY. */
export async function POST(req: Request) {
  const key = process.env.PROXY_KEY;
  if (!key || req.headers.get('x-proxy-key') !== key) return Response.json({ ok: false }, { status: 401 });
  revalidateTag('catalog', { expire: 0 });
  return Response.json({ ok: true });
}
