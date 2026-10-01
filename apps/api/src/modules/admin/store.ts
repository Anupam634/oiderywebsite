import { z } from 'zod';
import type { AdminCustomerRow, AdminDashboard } from '@store/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAdmin, requireOwner } from '../../lib/auth.ts';
import { audit } from '../../lib/audit.ts';
import { notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { Files } from '../files/service.ts';
import { getStoreSettings, saveStoreSettings, storeSettingsSchema } from '../settings/service.ts';
import { toAdminRow } from './orders.ts';

const SOLD = ['PLACED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'] as const;

/** Dashboard, customers, store settings and the audit trail. */
export const adminStoreRoutes =
  (db: Db, files: Files): FastifyPluginAsyncZod =>
  async (app) => {
    app.addHook('preValidation', requireAdmin);
    app.addHook('onSend', async (_req, reply) => {
      reply.header('cache-control', 'private, no-store');
    });

    app.get('/admin/dashboard', { schema: { tags: ['admin'], summary: 'Today, this week, what needs doing' } }, async (): Promise<AdminDashboard> => {
      // day boundaries in India time
      const IST = 330 * 60_000;
      const startOfDay = new Date(Math.floor((Date.now() + IST) / 86_400_000) * 86_400_000 - IST);
      const since = (days: number) => new Date(startOfDay.getTime() - (days - 1) * 86_400_000);
      const sum = async (from: Date) => {
        const a = await db.order.aggregate({ where: { status: { in: [...SOLD] }, placedAt: { gte: from } }, _count: true, _sum: { totalPaise: true } });
        return { orders: a._count, revenuePaise: a._sum.totalPaise ?? 0 };
      };
      const daily = await db.$queryRaw<{ day: Date; orders: bigint; revenue: bigint | null }[]>`
        SELECT date_trunc('day', "placedAt" AT TIME ZONE 'Asia/Kolkata') AS day, count(*) AS orders, sum("totalPaise") AS revenue
        FROM "Order"
        WHERE "placedAt" >= ${since(14)} AND "status" IN ('PLACED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED')
        GROUP BY 1 ORDER BY 1`;
      const byDay = new Map(daily.map((d) => [d.day.toISOString().slice(0, 10), { orders: Number(d.orders), revenuePaise: Number(d.revenue ?? 0) }]));
      const days = Array.from({ length: 14 }, (_, i) => {
        const key = new Date(since(14).getTime() + IST + i * 86_400_000).toISOString().slice(0, 10);
        return { day: key, ...(byDay.get(key) ?? { orders: 0, revenuePaise: 0 }) };
      });
      const count = (productionStatus: 'AWAITING_PROOF' | 'CHANGES_REQUESTED' | 'PROOF_SENT') =>
        db.orderItem.count({ where: { productionStatus, order: { status: { in: ['PLACED', 'IN_PRODUCTION'] } } } });
      const [today, week, month, toShip, proofsToMake, changesRequested, awaitingCustomer, unpaid, reviewsToCheck, low, recent] = await Promise.all([
        sum(startOfDay),
        sum(since(7)),
        sum(since(30)),
        db.order.count({ where: { status: { in: ['PLACED', 'IN_PRODUCTION'] }, items: { every: { productionStatus: { in: ['NOT_NEEDED', 'APPROVED', 'IN_PRODUCTION', 'DONE'] } } } } }),
        count('AWAITING_PROOF'),
        count('CHANGES_REQUESTED'),
        count('PROOF_SENT'),
        db.order.count({ where: { status: 'PENDING_PAYMENT' } }),
        db.review.count({ where: { status: 'PENDING' } }),
        db.productVariant.findMany({ where: { trackStock: true, stock: { lte: 2 }, product: { status: 'ACTIVE' } }, include: { product: { select: { id: true, name: true } } }, orderBy: { stock: 'asc' }, take: 12 }),
        db.order.findMany({ where: { status: { not: 'PENDING_PAYMENT' } }, orderBy: { createdAt: 'desc' }, take: 8, include: { items: { select: { productionStatus: true, uploads: { where: { kind: 'PREVIEW' }, select: { id: true, kind: true } }, imagePath: true } } } }),
      ]);
      return {
        today,
        week,
        month,
        days,
        todo: { toShip, proofsToMake, changesRequested, awaitingCustomer, unpaid, reviewsToCheck },
        lowStock: low.map((v) => ({ productId: v.product.id, name: `${v.product.name}${v.size ? ` · ${v.size}` : ''}`, sku: v.sku, stock: v.stock })),
        recent: recent.map((o) => toAdminRow(o, files)),
      };
    });

    /* ---- customers ---- */
    app.get(
      '/admin/customers',
      { schema: { tags: ['admin'], summary: 'Customers', querystring: z.object({ q: z.string().trim().max(60).optional(), page: z.coerce.number().int().min(1).default(1) }) } },
      async (req) => {
        const q = req.query.q;
        const where = q
          ? { OR: [{ phone: { contains: q.replace(/\D/g, '') || q } }, { name: { contains: q, mode: 'insensitive' as const } }, { email: { contains: q, mode: 'insensitive' as const } }] }
          : {};
        const [rows, total] = await Promise.all([
          db.customer.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (req.query.page - 1) * 30, take: 30 }),
          db.customer.count({ where }),
        ]);
        const stats = await db.order.groupBy({
          by: ['customerId'],
          where: { customerId: { in: rows.map((c) => c.id) }, status: { in: [...SOLD] } },
          _count: true,
          _sum: { totalPaise: true },
          _max: { createdAt: true },
        });
        const s = new Map(stats.map((x) => [x.customerId, x]));
        const items: AdminCustomerRow[] = rows.map((c) => ({
          id: c.id,
          phone: c.phone,
          name: c.name,
          email: c.email,
          orders: s.get(c.id)?._count ?? 0,
          spentPaise: s.get(c.id)?._sum.totalPaise ?? 0,
          lastOrderAt: s.get(c.id)?._max.createdAt?.toISOString() ?? null,
          codBlocked: c.codBlocked,
          createdAt: c.createdAt.toISOString(),
        }));
        return { items, total, page: req.query.page, pageSize: 30 };
      },
    );

    app.get('/admin/customers/:id', { schema: { tags: ['admin'], summary: 'A customer with orders and addresses', params: z.object({ id: z.string().max(40) }) } }, async (req) => {
      const c = await db.customer.findUnique({
        where: { id: req.params.id },
        include: {
          addresses: true,
          orders: { orderBy: { createdAt: 'desc' }, take: 50, include: { items: { select: { productionStatus: true, uploads: { where: { kind: 'PREVIEW' }, select: { id: true, kind: true } }, imagePath: true } } } },
        },
      });
      if (!c) throw notFound('Customer');
      return {
        customer: { id: c.id, phone: c.phone, name: c.name, email: c.email, whatsappOptIn: c.whatsappOptIn, codBlocked: c.codBlocked, notes: c.notes, createdAt: c.createdAt.toISOString(), lastLoginAt: c.lastLoginAt?.toISOString() ?? null },
        addresses: c.addresses.map((a) => ({ id: a.id, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode, type: a.type, isDefault: a.isDefault })),
        orders: c.orders.map((o) => toAdminRow(o, files)),
      };
    });

    app.patch(
      '/admin/customers/:id',
      { schema: { tags: ['admin'], summary: 'Notes and the cash-on-delivery block', params: z.object({ id: z.string().max(40) }), body: z.object({ codBlocked: z.boolean().optional(), notes: z.string().max(2000).optional() }) } },
      async (req) => {
        const c = await db.customer.update({ where: { id: req.params.id }, data: req.body }).catch(() => null);
        if (!c) throw notFound('Customer');
        await audit(db, req, 'customer_updated', 'customer', c.id, req.body);
        return { ok: true };
      },
    );

    /* ---- store settings (owner) ---- */
    app.get('/admin/settings', { schema: { tags: ['admin'], summary: 'Store details used on invoices' } }, async () => ({ settings: await getStoreSettings(db) }));
    app.put('/admin/settings', { preValidation: requireOwner, schema: { tags: ['admin'], summary: 'Save store details (owner)', body: storeSettingsSchema } }, async (req) => {
      const saved = await saveStoreSettings(db, req.body);
      await audit(db, req, 'settings_saved', 'settings', 'store');
      return { settings: saved };
    });

    app.get(
      '/admin/audit',
      { preValidation: requireOwner, schema: { tags: ['admin'], summary: 'Who changed what (owner)', querystring: z.object({ page: z.coerce.number().int().min(1).default(1) }) } },
      async (req) => {
        const rows = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (req.query.page - 1) * 50, take: 50, include: { admin: { select: { name: true, email: true } } } });
        return { items: rows.map((r) => ({ id: r.id, who: r.admin?.name ?? 'System', action: r.action, entity: r.entity, entityId: r.entityId, data: r.data, createdAt: r.createdAt.toISOString() })) };
      },
    );
  };
