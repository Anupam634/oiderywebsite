import { z } from 'zod';
import { normalisePhone, type Me } from '@store/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireCustomer } from '../../lib/auth.ts';
import { AppError } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { Customer } from '../../generated/prisma/client.ts';
import { OTP_LENGTH, type OtpProvider } from './otp.ts';

const RESEND_SECONDS = 30;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const PER_PHONE_PER_HOUR = 5;

export const toMe = (c: Customer): Me => ({ id: c.id, phone: c.phone, name: c.name, email: c.email, whatsappOptIn: c.whatsappOptIn });

const phoneOf = (raw: string) => {
  const phone = normalisePhone(raw);
  if (!phone) throw new AppError(400, 'bad_phone', 'Enter a 10-digit Indian mobile number');
  return phone;
};

/** Log in with a mobile number and a one-time code. A new number creates the customer. */
export const authRoutes =
  (db: Db, otp: OtpProvider, perIpPerHour = 20): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/auth/otp',
      {
        schema: { tags: ['auth'], summary: 'Send a login code by SMS', body: z.object({ phone: z.string().max(20) }) },
        config: { rateLimit: { max: 15, timeWindow: '10 minutes' } },
      },
      async (req) => {
        const phone = phoneOf(req.body.phone);
        const now = Date.now();
        const hourAgo = new Date(now - 3_600_000);
        const recent = await db.otpChallenge.findMany({ where: { phone, createdAt: { gte: hourAgo } }, orderBy: { createdAt: 'desc' }, take: PER_PHONE_PER_HOUR });
        const wait = recent[0] ? Math.ceil(RESEND_SECONDS - (now - recent[0].createdAt.getTime()) / 1000) : 0;
        if (wait > 0) throw new AppError(429, 'otp_wait', `Please wait ${wait} seconds before asking for another code`);
        if (recent.length >= PER_PHONE_PER_HOUR) throw new AppError(429, 'otp_limit', 'Too many codes for this number. Please try again in an hour.');
        if ((await db.otpChallenge.count({ where: { ip: req.clientIp, createdAt: { gte: hourAgo } } })) >= perIpPerHour)
          throw new AppError(429, 'otp_limit', 'Too many codes asked from this network. Please try again later.');

        let started;
        try {
          started = await otp.start(phone);
        } catch (err) {
          req.log.error({ err }, 'sending the login code failed');
          throw new AppError(502, 'otp_send_failed', 'We couldn’t send the code right now. Please try again in a minute.');
        }
        await db.otpChallenge.create({
          data: { phone, provider: otp.name, codeHash: started.codeHash ?? null, ip: req.clientIp, expiresAt: new Date(now + CODE_MINUTES * 60_000) },
        });
        return { ok: true, length: OTP_LENGTH, resendInSeconds: RESEND_SECONDS, ...(started.devCode ? { devCode: started.devCode } : {}) };
      },
    );

    app.post(
      '/auth/verify',
      {
        schema: { tags: ['auth'], summary: 'Check the code and log in', body: z.object({ phone: z.string().max(20), code: z.string().trim().regex(/^\d{4,8}$/, 'Enter the code from the SMS') }) },
        config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
      },
      async (req, reply) => {
        const phone = phoneOf(req.body.phone);
        const ch = await db.otpChallenge.findFirst({ where: { phone, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
        if (!ch) throw new AppError(400, 'otp_expired', 'That code has expired. Please ask for a new one.');
        // count the try before checking, so parallel guesses can't get extra tries
        const counted = await db.otpChallenge.updateMany({ where: { id: ch.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
        if (!counted.count) throw new AppError(400, 'otp_attempts', 'Too many wrong tries. Please ask for a new code.');
        if (!(await otp.check(phone, req.body.code, ch.codeHash))) {
          const left = MAX_ATTEMPTS - ch.attempts - 1;
          throw new AppError(400, 'otp_wrong', left > 0 ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That code isn’t right. Please ask for a new one.');
        }
        const used = await db.otpChallenge.updateMany({ where: { id: ch.id, consumedAt: null }, data: { consumedAt: new Date() } });
        if (!used.count) throw new AppError(400, 'otp_used', 'That code was already used. Please ask for a new one.');

        const existing = await db.customer.findUnique({ where: { phone } });
        const customer = existing
          ? await db.customer.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } })
          : await db.customer.create({ data: { phone, lastLoginAt: new Date() } });
        await app.sessions.startCustomer(req, reply, customer.id);
        return { me: toMe(customer), isNew: !existing };
      },
    );

    app.post('/auth/logout', { schema: { tags: ['auth'], summary: 'Log out on this device' } }, async (req, reply) => {
      await app.sessions.end(req, reply, 'CUSTOMER');
      return { ok: true };
    });

    app.get('/me', { schema: { tags: ['account'], summary: 'The logged-in shopper (me: null when logged out)' } }, async (req, reply) => {
      reply.header('cache-control', 'private, no-store');
      const auth = await app.sessions.customer(req);
      const c = auth && (await db.customer.findUnique({ where: { id: auth.customerId } }));
      return { me: c ? toMe(c) : null };
    });

    app.patch(
      '/me',
      {
        preValidation: requireCustomer,
        schema: {
          tags: ['account'],
          summary: 'Update name, email and WhatsApp updates',
          body: z.object({
            name: z.string().trim().min(2, 'Enter your full name').max(80).optional(),
            email: z.union([z.literal(''), z.email('Enter a valid email')]).optional(),
            whatsappOptIn: z.boolean().optional(),
          }),
        },
      },
      async (req) => {
        const { name, email, whatsappOptIn } = req.body;
        const c = await db.customer.update({
          where: { id: req.customer!.customerId },
          data: { ...(name !== undefined ? { name } : {}), ...(email !== undefined ? { email: email || null } : {}), ...(whatsappOptIn !== undefined ? { whatsappOptIn } : {}) },
        });
        return { me: toMe(c) };
      },
    );
  };
