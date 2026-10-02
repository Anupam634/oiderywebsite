import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';

/* Error reporting to Sentry (or GlitchTip, which speaks the same protocol) when SENTRY_DSN is set; otherwise
   errors only go to the logs. A small client of Sentry's envelope endpoint, so the API needs no SDK:
   errors are sent with their stack, the route pattern (never the raw address: proof links hold a secret)
   and a few tags. No request bodies, cookies or headers are ever sent. Repeats are held back. */

export interface MonitorOptions {
  dsn?: string;
  environment: string;
  release?: string;
}
interface Target {
  url: string;
  auth: string;
  dsn: string;
}
export interface Frame {
  function?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
}
export interface Report {
  /** e.g. TypeError */
  type: string;
  message: string;
  frames?: Frame[];
  platform?: 'node' | 'javascript';
  level?: 'error' | 'warning';
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  request?: { method?: string; url?: string };
}

let target: Target | null = null;
let env: Omit<MonitorOptions, 'dsn'> = { environment: 'development' };
const recent = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;
const REPEAT_MS = 60_000;
const MAX_PER_MINUTE = 30;

export function parseDsn(dsn: string): Target | null {
  try {
    const u = new URL(dsn);
    const project = u.pathname.split('/').filter(Boolean).pop();
    if (!u.username || !project) return null;
    const prefix = u.pathname.slice(0, u.pathname.lastIndexOf('/' + project));
    const port = u.port ? `:${u.port}` : '';
    return {
      url: `${u.protocol}//${u.hostname}${port}${prefix}/api/${project}/envelope/`,
      auth: `Sentry sentry_version=7, sentry_key=${u.username}, sentry_client=store-monitor/1.0`,
      dsn,
    };
  } catch {
    return null;
  }
}

export function initMonitor(opts: MonitorOptions): boolean {
  env = { environment: opts.environment, release: opts.release };
  target = opts.dsn ? parseDsn(opts.dsn) : null;
  return !!target;
}
export const monitorOn = () => !!target;

/** V8 ("at fn (file:1:2)") and Firefox/Safari ("fn@file:1:2") stack lines → Sentry frames, oldest first */
export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split('\n').slice(0, 60)) {
    const v8 = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
    const gecko = v8 ? null : /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/.exec(line);
    const m = v8 ?? gecko;
    if (!m) continue;
    const filename = m[2]!;
    frames.push({
      function: m[1] || '?',
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !/node_modules|node:internal|^node:|internal\//.test(filename),
    });
  }
  return frames.reverse();
}

export function errorReport(err: unknown, extra?: Partial<Report>): Report {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  return { type: e.name || 'Error', message: e.message, frames: parseStack(e.stack), platform: 'node', ...extra };
}

/** send one report (fire and forget). Returns false when it was not sent (off, a repeat or over the limit). */
export function capture(r: Report): boolean {
  if (!target) return false;
  const now = Date.now();
  const top = r.frames?.at(-1);
  const key = `${r.type}|${r.message}|${top?.filename ?? ''}:${top?.lineno ?? ''}`;
  if (now - (recent.get(key) ?? 0) < REPEAT_MS) return false;
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (++windowCount > MAX_PER_MINUTE) return false;
  recent.set(key, now);
  if (recent.size > 500) recent.delete(recent.keys().next().value!);

  const eventId = randomBytes(16).toString('hex');
  const event = {
    event_id: eventId,
    timestamp: now / 1000,
    platform: r.platform ?? 'node',
    level: r.level ?? 'error',
    server_name: hostname(),
    environment: env.environment,
    ...(env.release ? { release: env.release } : {}),
    exception: { values: [{ type: r.type, value: r.message.slice(0, 1000), ...(r.frames?.length ? { stacktrace: { frames: r.frames } } : {}) }] },
    ...(r.request ? { request: r.request } : {}),
    tags: r.tags ?? {},
    extra: r.extra ?? {},
    contexts: { runtime: { name: 'node', version: process.version } },
  };
  const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date(now).toISOString(), dsn: target.dsn })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
  void fetch(target.url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-sentry-envelope', 'x-sentry-auth': target.auth },
    body,
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    /* reporting must never take the API down */
  });
  return true;
}

/** an addresses' private parts replaced: proof tokens, signed file links, order numbers stay readable */
export function redactPath(path: string): string {
  return path
    .split('?')[0]!
    .replace(/\/proof\/[^/]+/g, '/proof/[token]')
    .replace(/\/v1\/proofs\/[^/]+/g, '/v1/proofs/[token]')
    .replace(/\/v1\/files\/[^/]+/g, '/v1/files/[file]')
    .slice(0, 300);
}
