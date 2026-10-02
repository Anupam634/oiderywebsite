import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { capture, errorReport, initMonitor, parseDsn, parseStack, redactPath } from '../src/lib/monitor.ts';
import { createPrisma, type Db } from '../src/lib/prisma.ts';

/* Error reporting: DSN and stack parsing, the Sentry envelope that goes out, secret links kept out of it,
   repeats held back, and the storefront's /v1/client-errors endpoint. A local server stands in for Sentry. */

let sentry: http.Server;
let received: { url: string; auth: string; body: string }[] = [];
let dsn = '';
let app: Awaited<ReturnType<typeof buildApp>>;
let db: Db;

beforeAll(async () => {
  sentry = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ url: req.url ?? '', auth: String(req.headers['x-sentry-auth'] ?? ''), body });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((r) => sentry.listen(0, '127.0.0.1', r));
  dsn = `http://publickey123@127.0.0.1:${(sentry.address() as AddressInfo).port}/42`;
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: inject('databaseUrl'), LOG_LEVEL: 'silent', SENTRY_DSN: dsn });
  initMonitor({ dsn: config.SENTRY_DSN, environment: 'test', release: 'abc123' });
  db = createPrisma(config.DATABASE_URL);
  app = await buildApp({ config, db });
});
afterAll(async () => {
  initMonitor({ environment: 'test' }); // off again for other files
  await app.close();
  await db.$disconnect();
  await new Promise((r) => sentry.close(r));
});

const settle = async (n: number) => {
  for (let i = 0; i < 50 && received.length < n; i++) await new Promise((r) => setTimeout(r, 20));
};
const eventOf = (body: string) => JSON.parse(body.trim().split('\n')[2]!) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('monitor helpers', () => {
  it('turns a DSN into the envelope address and auth header', () => {
    const t = parseDsn('https://abc@o123.ingest.sentry.io/4567')!;
    expect(t.url).toBe('https://o123.ingest.sentry.io/api/4567/envelope/');
    expect(t.auth).toContain('sentry_key=abc');
    expect(parseDsn('https://glitch.example.com/sub/path/7')).toBeNull(); // no key
    expect(parseDsn('https://k@glitch.example.com/sub/7')!.url).toBe('https://glitch.example.com/sub/api/7/envelope/');
    expect(() => loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://x@localhost/db', SENTRY_DSN: 'not a dsn' })).toThrow(/SENTRY_DSN/);
  });

  it('reads V8 and Firefox stacks, oldest frame first', () => {
    const v8 = parseStack('TypeError: x is undefined\n    at load (/app/dist/server.js:10:5)\n    at async Object.handler (/app/node_modules/fastify/lib/route.js:4:2)');
    expect(v8.at(-1)).toMatchObject({ function: 'load', filename: '/app/dist/server.js', lineno: 10, colno: 5, in_app: true });
    expect(v8[0]).toMatchObject({ in_app: false });
    const gecko = parseStack('add@https://shop.test/_next/static/chunks/a.js:3:9\n@https://shop.test/_next/static/chunks/b.js:1:1');
    expect(gecko.at(-1)).toMatchObject({ function: 'add', lineno: 3 });
  });

  it('never lets a proof link or signed file link through', () => {
    expect(redactPath('/proof/9f8e7d6c5b4a?x=1')).toBe('/proof/[token]');
    expect(redactPath('/v1/proofs/abcdef/answer')).toBe('/v1/proofs/[token]/answer');
    expect(redactPath('/v1/files/up_123.png?sig=zzz')).toBe('/v1/files/[file]');
  });
});

describe('reports', () => {
  it('sends a Sentry envelope, and holds back an identical repeat', async () => {
    received = [];
    const err = new RangeError('stitch count out of range');
    expect(capture(errorReport(err, { tags: { source: 'test' } }))).toBe(true);
    expect(capture(errorReport(err, { tags: { source: 'test' } }))).toBe(false);
    await settle(1);
    expect(received).toHaveLength(1);
    expect(received[0]!.url).toBe('/api/42/envelope/');
    expect(received[0]!.auth).toContain('sentry_key=publickey123');
    const [head, item] = received[0]!.body.trim().split('\n').map((l) => JSON.parse(l));
    expect(head.dsn).toBe(dsn);
    expect(item).toEqual({ type: 'event' });
    const ev = eventOf(received[0]!.body);
    expect(ev.event_id).toBe(head.event_id);
    expect(ev).toMatchObject({ level: 'error', environment: 'test', release: 'abc123', tags: { source: 'test' } });
    expect(ev.exception.values[0]).toMatchObject({ type: 'RangeError', value: 'stitch count out of range' });
    expect(ev.exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);
  });

  it('takes storefront errors on /v1/client-errors and passes them on without the secret part of the address', async () => {
    received = [];
    const res = await app.inject({
      method: 'POST',
      url: '/v1/client-errors',
      payload: { message: 'Cannot read properties of null', type: 'TypeError', stack: 'TypeError: x\n    at f (https://shop.test/_next/static/chunks/p.js:1:2)', url: 'https://shop.test/proof/secret-token-123?a=b', source: 'browser' },
    });
    expect(res.statusCode).toBe(204);
    await settle(1);
    expect(received).toHaveLength(1);
    const ev = eventOf(received[0]!.body);
    expect(ev).toMatchObject({ platform: 'javascript', tags: { source: 'browser' }, request: { url: '/proof/[token]' } });
    expect(received[0]!.body).not.toContain('secret-token-123');

    const bad = await app.inject({ method: 'POST', url: '/v1/client-errors', payload: { message: '' } });
    expect(bad.statusCode).toBe(400);
    const huge = await app.inject({ method: 'POST', url: '/v1/client-errors', payload: { message: 'x', stack: 'y'.repeat(20_000) } });
    expect([400, 413]).toContain(huge.statusCode);
  });

  it('reports a server error with its route pattern, not its address', async () => {
    received = [];
    const { default: Fastify } = await import('fastify');
    const { registerErrorHandler } = await import('../src/lib/errors.ts');
    const mini = Fastify();
    registerErrorHandler(mini);
    mini.get('/v1/proofs/:token', async () => {
      throw new Error('kaboom');
    });
    const r = await mini.inject({ method: 'GET', url: '/v1/proofs/secret-abc' });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ error: { code: 'server_error', message: 'Something went wrong' } });
    await settle(1);
    const ev = eventOf(received[0]!.body);
    expect(ev.request).toEqual({ method: 'GET', url: '/v1/proofs/:token' });
    expect(ev.tags).toEqual({ source: 'api' });
    expect(received[0]!.body).not.toContain('secret-abc');
    await mini.close();
  });
});
