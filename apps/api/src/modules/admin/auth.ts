import { z } from 'zod';
import type { AdminMe } from '@store/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAdmin, requireOwner } from '../../lib/auth.ts';
import { audit } from '../../lib/audit.ts';
import { hashPassword, randomCode, verifyPassword } from '../../lib/crypto.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { AdminUser } from '../../generated/prisma/client.ts';

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;
export const PASSWORD_RULE = z.string().min(10, 'Use at least 10 characters').max(200);
const toMe = (a: AdminUser): AdminMe => ({ id: a.id, email: a.email, name: a.name, role: a.role });

/** Studio staff log in with email + password; the owner manages staff accounts. */
export const adminAuthRoutes =
  (db: Db): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/admin/login',
      {
        schema: { tags: ['admin'], summary: 'Staff login', body: z.object({ email: z.email().transform((e) => e.toLowerCase()), password: z.string().min(1).max(200) }) },
        config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      },
      async (req, reply) => {
        const a = await db.adminUser.findUnique({ where: { email: req.body.email } });
        const fail = new AppError(401, 'bad_login', 'That email and password don’t match');
        if (!a || !a.active) {
          await verifyPassword(req.body.password, 'scrypt$c2FsdHNhbHRzYWx0c2FsdA$ZmFrZWZha2VmYWtlZmFrZWZha2VmYWtlZmFrZWZha2U').catch(() => false); // same time either way
          throw fail;
        }
        if (a.lockedUntil && a.lockedUntil > new Date()) throw new AppError(423, 'locked', `Too many wrong passwords. Try again after ${a.lockedUntil.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.`);
        if (!(await verifyPassword(req.body.password, a.passwordHash))) {
          const tries = a.failedLogins + 1;
          await db.adminUser.update({ where: { id: a.id }, data: tries >= MAX_TRIES ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: tries } });
          await db.auditLog.create({ data: { adminId: a.id, action: 'login_failed', entity: 'admin', entityId: a.id, data: { ip: req.clientIp } } });
          throw fail;
        }
        const saved = await db.adminUser.update({ where: { id: a.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
        await app.sessions.startAdmin(req, reply, a.id);
        await db.auditLog.create({ data: { adminId: a.id, action: 'login', entity: 'admin', entityId: a.id, data: { ip: req.clientIp } } });
        return { me: toMe(saved) };
      },
    );

    app.post('/admin/logout', { schema: { tags: ['admin'], summary: 'Staff logout' } }, async (req, reply) => {
      await app.sessions.end(req, reply, 'ADMIN');
      return { ok: true };
    });

    app.get('/admin/me', { schema: { tags: ['admin'], summary: 'The logged-in staff member (me: null when logged out)' } }, async (req, reply) => {
      reply.header('cache-control', 'private, no-store');
      const s = await app.sessions.admin(req);
      const a = s && (await db.adminUser.findUnique({ where: { id: s.adminId } }));
      return { me: a ? toMe(a) : null };
    });

    app.post(
      '/admin/password',
      { preValidation: requireAdmin, schema: { tags: ['admin'], summary: 'Change my password', body: z.object({ current: z.string().max(200), next: PASSWORD_RULE }) } },
      async (req) => {
        const a = await db.adminUser.findUniqueOrThrow({ where: { id: req.admin!.adminId } });
        if (!(await verifyPassword(req.body.current, a.passwordHash))) throw new AppError(400, 'bad_password', 'Your current password isn’t right');
        await db.adminUser.update({ where: { id: a.id }, data: { passwordHash: await hashPassword(req.body.next) } });
        // log out other devices
        await db.session.deleteMany({ where: { adminId: a.id, NOT: { id: req.admin!.sessionId } } });
        await audit(db, req, 'password_changed', 'admin', a.id);
        return { ok: true };
      },
    );

    /* ---- staff accounts (owner only) ---- */
    app.get('/admin/users', { preValidation: requireOwner, schema: { tags: ['admin'], summary: 'Staff accounts' } }, async () => ({
      items: (await db.adminUser.findMany({ orderBy: { createdAt: 'asc' } })).map((a) => ({ ...toMe(a), active: a.active, lastLoginAt: a.lastLoginAt?.toISOString() ?? null })),
    }));

    app.post(
      '/admin/users',
      {
        preValidation: requireOwner,
        schema: { tags: ['admin'], summary: 'Add a staff member (returns a one-time password)', body: z.object({ email: z.email().transform((e) => e.toLowerCase()), name: z.string().trim().min(2).max(80), role: z.enum(['OWNER', 'STAFF']).default('STAFF') }) },
      },
      async (req, reply) => {
        if (await db.adminUser.findUnique({ where: { email: req.body.email } })) throw new AppError(409, 'exists', 'Someone with that email already has an account');
        const password = `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`;
        const a = await db.adminUser.create({ data: { ...req.body, passwordHash: await hashPassword(password) } });
        await audit(db, req, 'user_created', 'admin', a.id, { email: a.email, role: a.role });
        reply.code(201);
        return { user: toMe(a), password };
      },
    );

    app.patch(
      '/admin/users/:id',
      {
        preValidation: requireOwner,
        schema: {
          tags: ['admin'],
          summary: 'Change a staff member (role, active, new password)',
          params: z.object({ id: z.string().max(40) }),
          body: z.object({ active: z.boolean().optional(), role: z.enum(['OWNER', 'STAFF']).optional(), resetPassword: z.boolean().optional() }),
        },
      },
      async (req) => {
        const a = await db.adminUser.findUnique({ where: { id: req.params.id } });
        if (!a) throw notFound('Staff member');
        if (a.id === req.admin!.adminId && (req.body.active === false || req.body.role === 'STAFF')) throw new AppError(400, 'self', 'You can’t remove your own owner access');
        const password = req.body.resetPassword ? `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}` : null;
        const saved = await db.adminUser.update({
          where: { id: a.id },
          data: {
            ...(req.body.active !== undefined ? { active: req.body.active } : {}),
            ...(req.body.role ? { role: req.body.role } : {}),
            ...(password ? { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null } : {}),
          },
        });
        if (req.body.active === false || password) await db.session.deleteMany({ where: { adminId: a.id } });
        await audit(db, req, 'user_changed', 'admin', a.id, { ...req.body });
        return { user: toMe(saved), ...(password ? { password } : {}) };
      },
    );
  };
