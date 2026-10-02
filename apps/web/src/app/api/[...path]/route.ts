/* /api/* → the store API. The browser only ever talks to this site, so login cookies are first-party and
   no CORS is needed. The shopper's address is passed on in x-client-ip, vouched for by PROXY_KEY. */

export const dynamic = 'force-dynamic';

const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const KEY = process.env.PROXY_KEY;
const DROP_IN = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-authorization', 'proxy-authenticate', 'content-length', 'x-client-ip', 'x-proxy-key', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip']);
const DROP_OUT = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive'];

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const target = `${API}/${path.map(encodeURIComponent).join('/')}${url.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!DROP_IN.has(k)) headers.set(k, v);
  });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
  if (ip) headers.set('x-client-ip', ip);
  if (KEY) headers.set('x-proxy-key', KEY);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  headers.set('x-forwarded-host', url.host);
  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      redirect: 'manual',
      cache: 'no-store',
      // never hang: uploads get longer (they stream from the shopper's phone), everything else 30 s
      signal: AbortSignal.timeout((req.headers.get('content-type') ?? '').startsWith('multipart/') ? 180_000 : 30_000),
      // streaming request bodies (uploads) need half-duplex
      duplex: 'half',
    } as RequestInit);
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'TimeoutError';
    return Response.json(
      { error: { code: timedOut ? 'api_timeout' : 'api_unreachable', message: 'The shop is having a moment. Please try again.' } },
      { status: timedOut ? 504 : 502 },
    );
  }
  const out = new Headers(res.headers);
  for (const h of DROP_OUT) out.delete(h);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
