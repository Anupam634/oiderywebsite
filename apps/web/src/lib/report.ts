'use client';

/* Browser errors go to the API (/v1/client-errors), which logs them and passes them on to Sentry when that is
   set up. Only our own code's errors are sent (not browser extensions'), at most a few per page visit. */

let sent = 0;
const MAX_PER_PAGE = 5;
const IGNORE = /ResizeObserver loop|Non-Error promise rejection|Load failed|Failed to fetch|NetworkError|AbortError|The user aborted/i;

export function reportError(err: unknown, digest?: string) {
  try {
    if (sent >= MAX_PER_PAGE) return;
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Unknown error');
    // ApiError: the shop already showed the shopper a message, and the API logged anything serious itself
    if (typeof (err as { status?: unknown })?.status === 'number') return;
    if (IGNORE.test(e.message) || IGNORE.test(e.name)) return;
    sent++;
    const body = JSON.stringify({
      message: e.message.slice(0, 500) || e.name,
      type: e.name.slice(0, 80),
      stack: (e.stack ?? '').slice(0, 8000),
      url: location.pathname,
      source: 'browser',
      ...(digest ? { digest: digest.slice(0, 64) } : {}),
    });
    const blob = new Blob([body], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/v1/client-errors', blob)) {
      void fetch('/api/v1/client-errors', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* reporting must never cause another error */
  }
}
