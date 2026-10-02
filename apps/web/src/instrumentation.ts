import type { Instrumentation } from 'next';

/* Errors while the storefront server renders a page or runs a route: logged by Next.js, and also passed to
   the API's error endpoint (and from there to Sentry when it's set up). Only the route pattern is sent
   (e.g. /proof/[token]), never the real address. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const api = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  const e = err instanceof Error ? (err as Error & { digest?: string }) : new Error(String(err));
  try {
    await fetch(`${api}/v1/client-errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.PROXY_KEY ? { 'x-proxy-key': process.env.PROXY_KEY } : {}) },
      body: JSON.stringify({
        message: (e.message || e.name || 'Error').slice(0, 500),
        type: (e.name || 'Error').slice(0, 80),
        stack: (e.stack ?? '').slice(0, 8000),
        url: `${request.method} ${context.routePath}`.slice(0, 500),
        source: 'web-server',
        ...('digest' in e && e.digest ? { digest: String(e.digest).slice(0, 64) } : {}),
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* the API may be the thing that's down; Next.js has already logged the error */
  }
};
