import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.ts';
import { randomToken, safeEqual, sha256 } from './crypto.ts';
import { AppError } from './errors.ts';
import type { Db } from './prisma.ts';

/* Cookie sessions for shoppers (`sid`) and studio staff (`asid`). The cookie holds a random token; the
   database keeps only its SHA-256, so a leaked database can't be used to log in. */

export const CUSTOMER_COOKIE = 'sid';
export const ADMIN_COOKIE = 'asid';

export interface CustomerAuth {
  sessionId: string;
  customerId: string;
  phone: string;
}
export interface AdminAuth {
  sessionId: string;
  adminId: string;
  email: string;
  name: string;
  role: 'OWNER' | 'STAFF';
}

declare module 'fastify' {
  interface FastifyRequest {
    /** the shopper's address (from the web proxy when it vouches for it, else the socket) */
    clientIp: string;
    customer: CustomerAuth | null;
    admin: AdminAuth | null;
  }
  interface FastifyInstance {
    sessions: Sessions;
  }
}

const DAY = 86_400_000;

export class Sessions {
  constructor(
    private db: Db,
    private config: Config,
  ) {}

  private cookie(reply: FastifyReply, name: string, token: string, maxAgeSec: number) {
    reply.setCookie(name, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: this.config.cookieSecure, maxAge: maxAgeSec });
  }

  async startCustomer(req: FastifyRequest, reply: FastifyReply, customerId: string) {
    const token = randomToken();
    const ms = this.config.SESSION_DAYS * DAY;
    await this.db.session.create({
      data: { tokenHash: sha256(token), kind: 'CUSTOMER', customerId, ip: req.clientIp, userAgent: req.headers['user-agent']?.slice(0, 300), expiresAt: new Date(Date.now() + ms) },
    });
    this.cookie(reply, CUSTOMER_COOKIE, token, ms / 1000);
  }

  async startAdmin(req: FastifyRequest, reply: FastifyReply, adminId: string) {
    const token = randomToken();
    const ms = this.config.ADMIN_SESSION_HOURS * 3_600_000;
    await this.db.session.create({
      data: { tokenHash: sha256(token), kind: 'ADMIN', adminId, ip: req.clientIp, userAgent: req.headers['user-agent']?.slice(0, 300), expiresAt: new Date(Date.now() + ms) },
    });
    this.cookie(reply, ADMIN_COOKIE, token, ms / 1000);
  }

  /** the logged-in shopper, or null; slides the expiry forward once a day */
  async customer(req: FastifyRequest): Promise<CustomerAuth | null> {
    if (req.customer) return req.customer;
    const token = req.cookies[CUSTOMER_COOKIE];
    if (!token) return null;
    const s = await this.db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { customer: true } });
    if (!s || s.kind !== 'CUSTOMER' || !s.customer || s.expiresAt < new Date()) return null;
    if (Date.now() - s.lastSeenAt.getTime() > DAY) {
      await this.db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + this.config.SESSION_DAYS * DAY) } });
    }
    req.customer = { sessionId: s.id, customerId: s.customer.id, phone: s.customer.phone };
    return req.customer;
  }

  async admin(req: FastifyRequest): Promise<AdminAuth | null> {
    if (req.admin) return req.admin;
    const token = req.cookies[ADMIN_COOKIE];
    if (!token) return null;
    const s = await this.db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { admin: true } });
    if (!s || s.kind !== 'ADMIN' || !s.admin || !s.admin.active || s.expiresAt < new Date()) return null;
    if (Date.now() - s.lastSeenAt.getTime() > 600_000) await this.db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
    req.admin = { sessionId: s.id, adminId: s.admin.id, email: s.admin.email, name: s.admin.name, role: s.admin.role };
    return req.admin;
  }

  async end(req: FastifyRequest, reply: FastifyReply, kind: 'CUSTOMER' | 'ADMIN') {
    const name = kind === 'CUSTOMER' ? CUSTOMER_COOKIE : ADMIN_COOKIE;
    const token = req.cookies[name];
    if (token) await this.db.session.deleteMany({ where: { tokenHash: sha256(token) } });
    reply.clearCookie(name, { path: '/' });
  }

  /** log a shopper out everywhere (e.g. after their number changes hands) */
  endAllForCustomer = (customerId: string) => this.db.session.deleteMany({ where: { customerId } });
}

/** preHandler: 401 unless a shopper is logged in */
export async function requireCustomer(this: FastifyInstance, req: FastifyRequest) {
  if (!(await this.sessions.customer(req))) throw new AppError(401, 'login_required', 'Please log in with your mobile number first');
}

/** preHandler: 401 unless studio staff are logged in */
export async function requireAdmin(this: FastifyInstance, req: FastifyRequest) {
  if (!(await this.sessions.admin(req))) throw new AppError(401, 'admin_login_required', 'Please log in to the studio admin');
}

/** preHandler: only the owner (staff can't change settings, users or refunds) */
export async function requireOwner(this: FastifyInstance, req: FastifyRequest) {
  const a = await this.sessions.admin(req);
  if (!a) throw new AppError(401, 'admin_login_required', 'Please log in to the studio admin');
  if (a.role !== 'OWNER') throw new AppError(403, 'owner_only', 'Only the studio owner can do this');
}

/** Registers request decorations: client address, lazy session lookups, and an Origin check on writes. */
export function registerAuth(app: FastifyInstance, db: Db, config: Config) {
  const sessions = new Sessions(db, config);
  app.decorate('sessions', sessions);
  app.decorateRequest('customer', null);
  app.decorateRequest('admin', null);
  app.decorateRequest('clientIp', '');
  const allowed = new Set([...config.WEB_ORIGIN.split(',').map((s) => s.trim()), new URL(config.APP_URL).origin]);
  app.addHook('onRequest', async (req) => {
    const vouched = config.PROXY_KEY && typeof req.headers['x-proxy-key'] === 'string' && safeEqual(req.headers['x-proxy-key'], config.PROXY_KEY);
    const forwarded = vouched ? req.headers['x-client-ip'] : undefined;
    req.clientIp = (typeof forwarded === 'string' && forwarded) || req.ip;
    // cookies are SameSite=Lax; this also stops other sites posting to us from a browser
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      const origin = req.headers.origin;
      if (origin && !allowed.has(origin)) throw new AppError(403, 'bad_origin', 'This request came from another website');
    }
  });
  return sessions;
}
