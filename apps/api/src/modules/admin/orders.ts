import { z } from 'zod';
import type { AdminOrderDetail, AdminOrderItem, AdminOrderRow, ProductionRow } from '@store/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAdmin, requireOwner } from '../../lib/auth.ts';
import { audit } from '../../lib/audit.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { Prisma } from '../../generated/prisma/client.ts';
import type { Files } from '../files/service.ts';
import type { InvoiceService } from '../invoice/service.ts';
import { itemImage, orderInclude, toItemDto, toSummaryDto, type FullOrder } from '../orders/dto.ts';
import { NEXT_STATUS, type Fulfilment } from '../orders/fulfil.ts';
import type { OrderService } from '../orders/service.ts';
import type { StitchFiles } from '../stitchfiles/service.ts';

const adminInclude = {
  ...orderInclude,
  items: { ...orderInclude.items, include: { ...orderInclude.items.include, stitchFiles: { orderBy: { createdAt: 'desc' } } } },
  customer: { include: { _count: { select: { orders: true } } } },
} satisfies Prisma.OrderInclude;
type AdminFull = Prisma.OrderGetPayload<{ include: typeof adminInclude }>;

const rowInclude = { items: { select: { productionStatus: true, uploads: { where: { kind: 'PREVIEW' }, select: { id: true, kind: true } }, imagePath: true } } } satisfies Prisma.OrderInclude;

export function toAdminRow(o: Prisma.OrderGetPayload<{ include: typeof rowInclude }>, files: Files): AdminOrderRow {
  const count = (s: string) => o.items.filter((i) => i.productionStatus === s).length;
  return {
    number: o.number,
    createdAt: o.createdAt.toISOString(),
    status: o.status,
    paymentState: o.paymentState,
    paymentMethod: o.paymentMethod,
    totalPaise: o.totalPaise,
    itemCount: o.itemCount,
    customerName: o.shipName,
    phone: o.phone,
    city: o.shipCity,
    express: o.shipping === 'EXPRESS',
    proofs: { toMake: count('AWAITING_PROOF'), sent: count('PROOF_SENT'), changes: count('CHANGES_REQUESTED') },
    images: o.items
      .slice(0, 3)
      .map((i) => (i.uploads[0] ? files.signedPath(i.uploads[0].id, 1) : i.imagePath))
      .filter((x): x is string => !!x),
  };
}

function toAdminDetail(o: AdminFull, files: Files, orders: OrderService): AdminOrderDetail {
  const base = orders.dto(o as unknown as FullOrder);
  const items: AdminOrderItem[] = o.items.map((i) => ({
    ...toItemDto(i as unknown as FullOrder['items'][number], files),
    sku: i.sku,
    variantId: i.variantId,
    hsnCode: i.hsnCode,
    gstRule: i.gstRule,
    gstRateBp: i.gstRateBp,
    personalisation: (i.personalisation as AdminOrderItem['personalisation']) ?? null,
    studio: (i.studio as Record<string, unknown> | null) ?? null,
    petName: i.petName,
    giftWrap: i.giftWrap,
    files: i.uploads.map((u) => ({ id: u.id, kind: u.kind, url: files.signedPath(u.id, 1), name: u.originalName, mime: u.mime, width: u.width, height: u.height, bytes: 0 })),
    proofs: i.proofs.map((p) => ({
      id: p.id,
      version: p.version,
      status: p.status,
      imageUrl: files.signedPath(p.imageUploadId, 1),
      note: p.note,
      customerComment: p.customerComment,
      sentAt: p.sentAt.toISOString(),
      respondedAt: p.respondedAt?.toISOString() ?? null,
      token: p.token,
    })),
    stitchFiles: i.stitchFiles.map((s) => ({
      id: s.id,
      label: s.label,
      format: s.format,
      stitches: s.stitches,
      colourChanges: s.colourChanges,
      widthMm: s.widthMm,
      heightMm: s.heightMm,
      threads: s.threads as unknown as AdminOrderItem['stitchFiles'][number]['threads'],
      sourceUrl: files.signedPath(s.sourceUploadId, 1),
      pesUrl: s.pesUploadId ? files.signedPath(s.pesUploadId, 1) : null,
      previewUrl: s.previewUploadId ? files.signedPath(s.previewUploadId, 1) : null,
      createdAt: s.createdAt.toISOString(),
    })),
  }));
  return {
    ...base,
    id: o.id,
    items,
    customer: { id: o.customer.id, phone: o.customer.phone, name: o.customer.name, email: o.customer.email, codBlocked: o.customer.codBlocked, orders: o.customer._count.orders, notes: o.customer.notes },
    adminNotes: o.adminNotes,
    cancelReason: o.cancelReason,
    allEvents: o.events.map((e) => ({ type: e.type, message: e.message, actor: e.actor, visible: e.visible, createdAt: e.createdAt.toISOString() })),
    payments: o.payments.map((p) => ({ provider: p.provider, providerOrderId: p.providerOrderId, providerPaymentId: p.providerPaymentId, status: p.status, method: p.method, amountPaise: p.amountPaise, errorReason: p.errorReason, createdAt: p.createdAt.toISOString() })),
    refunds: o.refunds.map((r) => ({ amountPaise: r.amountPaise, reason: r.reason, status: r.status, createdAt: r.createdAt.toISOString() })),
    next: NEXT_STATUS[o.status],
  };
}

const numberParam = z.object({ number: z.string().max(20) });
const STATUSES = ['PENDING_PAYMENT', 'PLACED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;

/** Orders and production for the studio. */
export const adminOrderRoutes =
  (db: Db, orders: OrderService, fulfil: Fulfilment, invoices: InvoiceService, files: Files, stitch: StitchFiles): FastifyPluginAsyncZod =>
  async (app) => {
    app.addHook('preValidation', requireAdmin);
    app.addHook('onSend', async (_req, reply) => {
      reply.header('cache-control', 'private, no-store');
    });
    const detail = async (number: string) => {
      const o = await db.order.findUnique({ where: { number }, include: adminInclude });
      if (!o) throw notFound('Order');
      return toAdminDetail(o, files, orders);
    };

    app.get(
      '/admin/orders',
      {
        schema: {
          tags: ['admin'],
          summary: 'Orders, newest first, with filters',
          querystring: z.object({
            status: z.enum([...STATUSES, 'OPEN', 'ALL']).default('OPEN'),
            q: z.string().trim().max(60).optional(),
            payment: z.enum(['COD', 'ONLINE']).optional(),
            proofs: z.enum(['toMake', 'sent', 'changes']).optional(),
            page: z.coerce.number().int().min(1).default(1),
          }),
        },
      },
      async (req) => {
        const { status, q, payment, proofs, page } = req.query;
        const where: Prisma.OrderWhereInput = {
          ...(status === 'OPEN' ? { status: { in: ['PLACED', 'IN_PRODUCTION', 'SHIPPED'] } } : status === 'ALL' ? {} : { status }),
          ...(payment === 'COD' ? { paymentMethod: 'COD' } : payment === 'ONLINE' ? { paymentMethod: { not: 'COD' } } : {}),
          ...(proofs ? { items: { some: { productionStatus: proofs === 'toMake' ? 'AWAITING_PROOF' : proofs === 'sent' ? 'PROOF_SENT' : 'CHANGES_REQUESTED' } } } : {}),
          ...(q
            ? {
                OR: [
                  { number: { contains: q.toUpperCase() } },
                  { phone: { contains: q.replace(/\D/g, '') || q } },
                  { shipName: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                  { awb: { contains: q } },
                ],
              }
            : {}),
        };
        const [rows, total] = await Promise.all([
          db.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 30, take: 30, include: rowInclude }),
          db.order.count({ where }),
        ]);
        return { items: rows.map((o) => toAdminRow(o, files)), total, page, pageSize: 30 };
      },
    );

    app.get('/admin/orders/:number', { schema: { tags: ['admin'], summary: 'One order with files, proofs and payments', params: numberParam } }, async (req) => ({
      order: await detail(req.params.number),
    }));

    app.post(
      '/admin/orders/:number/status',
      {
        schema: {
          tags: ['admin'],
          summary: 'Move an order on: being stitched, shipped, delivered',
          params: numberParam,
          body: z.object({
            to: z.enum(['IN_PRODUCTION', 'SHIPPED', 'DELIVERED']),
            courier: z.string().trim().max(40).optional(),
            awb: z.string().trim().max(40).optional(),
            trackingUrl: z.union([z.literal(''), z.url().max(300)]).optional(),
            force: z.boolean().optional(),
          }),
        },
      },
      async (req) => {
        const { to, ...opts } = req.body;
        await fulfil.advance(req.params.number, to, { ...opts, adminId: req.admin!.adminId });
        await audit(db, req, `order_${to.toLowerCase()}`, 'order', req.params.number, opts);
        return { order: await detail(req.params.number) };
      },
    );

    app.post(
      '/admin/orders/:number/cancel',
      { schema: { tags: ['admin'], summary: 'Cancel (anything paid is refunded in full)', params: numberParam, body: z.object({ reason: z.string().trim().min(3, 'Give a short reason').max(300), notify: z.boolean().default(true) }) } },
      async (req) => {
        const o = await orders.byNumber(req.params.number);
        if (!o) throw notFound('Order');
        if (o.status === 'CANCELLED') throw new AppError(409, 'already_cancelled', 'This order is already cancelled');
        if (o.status === 'DELIVERED') throw new AppError(409, 'delivered', 'Delivered orders can’t be cancelled; refund part or all of it instead');
        await orders.cancel(o.id, req.body.reason, { actor: 'ADMIN', adminId: req.admin!.adminId, notify: req.body.notify });
        await audit(db, req, 'order_cancelled', 'order', o.number, { reason: req.body.reason });
        return { order: await detail(o.number) };
      },
    );

    app.post(
      '/admin/orders/:number/refund',
      {
        preValidation: requireOwner,
        schema: { tags: ['admin'], summary: 'Refund part or all of an online payment (owner)', params: numberParam, body: z.object({ amountPaise: z.number().int().min(100), reason: z.string().trim().min(3).max(300) }) },
      },
      async (req) => {
        const o = await orders.byNumber(req.params.number);
        if (!o) throw notFound('Order');
        await orders.refund(o, req.body.amountPaise, req.body.reason, { actor: 'ADMIN', adminId: req.admin!.adminId });
        await audit(db, req, 'order_refund', 'order', o.number, req.body);
        return { order: await detail(o.number) };
      },
    );

    app.post(
      '/admin/orders/:number/notes',
      { schema: { tags: ['admin'], summary: 'Studio notes on an order', params: numberParam, body: z.object({ notes: z.string().max(4000) }) } },
      async (req) => {
        const o = await db.order.update({ where: { number: req.params.number }, data: { adminNotes: req.body.notes || null } }).catch(() => null);
        if (!o) throw notFound('Order');
        return { order: await detail(o.number) };
      },
    );

    app.post('/admin/orders/:number/invoice', { schema: { tags: ['admin'], summary: 'Issue the GST invoice now (normally done at shipping)', params: numberParam } }, async (req) => {
      const o = await orders.byNumber(req.params.number);
      if (!o) throw notFound('Order');
      const inv = await invoices.issue(o.id);
      await audit(db, req, 'invoice_issued', 'order', o.number, { invoice: inv.number });
      return { order: await detail(o.number) };
    });

    app.post(
      '/admin/orders/:number/message',
      { schema: { tags: ['admin'], summary: 'Add an update the customer sees on their order page', params: numberParam, body: z.object({ message: z.string().trim().min(3).max(300) }) } },
      async (req) => {
        const o = await orders.byNumber(req.params.number);
        if (!o) throw notFound('Order');
        await db.orderEvent.create({ data: { orderId: o.id, type: 'note', message: req.body.message, actor: 'ADMIN', adminId: req.admin!.adminId } });
        return { order: await detail(o.number) };
      },
    );

    /* ---- production ---- */
    app.get(
      '/admin/production',
      { schema: { tags: ['admin'], summary: 'Made-for-you pieces by step', querystring: z.object({ status: z.enum(['AWAITING_PROOF', 'PROOF_SENT', 'CHANGES_REQUESTED', 'APPROVED', 'IN_PRODUCTION']).optional() }) } },
      async (req) => {
        const items = await db.orderItem.findMany({
          where: {
            productionStatus: req.query.status ? req.query.status : { in: ['AWAITING_PROOF', 'PROOF_SENT', 'CHANGES_REQUESTED', 'APPROVED', 'IN_PRODUCTION'] },
            order: { status: { in: ['PLACED', 'IN_PRODUCTION'] } },
          },
          include: { order: true, uploads: true, proofs: { orderBy: { version: 'desc' }, take: 1 }, stitchFiles: { select: { id: true } }, product: { select: { slug: true } } },
          orderBy: { order: { createdAt: 'asc' } },
          take: 200,
        });
        const rows: ProductionRow[] = items.map((i) => ({
          itemId: i.id,
          orderNumber: i.order.number,
          orderDate: i.order.createdAt.toISOString(),
          express: i.order.shipping === 'EXPRESS',
          etaDate: i.order.etaDate?.toISOString() ?? null,
          customerName: i.order.shipName,
          name: i.name,
          description: i.description,
          qty: i.qty,
          status: i.productionStatus,
          image: itemImage(i as unknown as FullOrder['items'][number], files),
          proofVersion: i.proofs[0]?.version ?? null,
          stitchFiles: i.stitchFiles.length,
        }));
        return { items: rows };
      },
    );

    app.post(
      '/admin/items/:id/status',
      {
        schema: {
          tags: ['admin'],
          summary: 'Set a piece’s production step by hand',
          params: z.object({ id: z.string().max(40) }),
          body: z.object({ status: z.enum(['AWAITING_PROOF', 'APPROVED', 'IN_PRODUCTION', 'DONE']) }),
        },
      },
      async (req) => {
        const item = await fulfil.setItemStatus(req.params.id, req.body.status, req.admin!.adminId);
        await audit(db, req, 'item_status', 'order_item', item.id, req.body);
        const o = await db.order.findUniqueOrThrow({ where: { id: item.orderId }, select: { number: true } });
        return { order: await detail(o.number) };
      },
    );

    app.post(
      '/admin/items/:id/proofs',
      { schema: { tags: ['admin'], summary: 'Send a stitch proof (multipart: file + note)', params: z.object({ id: z.string().max(40) }), consumes: ['multipart/form-data'] } },
      async (req) => {
        if (!req.isMultipart()) throw new AppError(415, 'multipart_required', 'Send the proof image as multipart/form-data');
        const part = await req.file({ limits: { fileSize: 20 << 20, files: 1, fields: 4 } });
        if (!part) throw new AppError(400, 'no_file', 'Choose the proof image');
        const note = part.fields.note && 'value' in part.fields.note ? String(part.fields.note.value) : '';
        const buf = await part.toBuffer();
        if (part.file.truncated) throw new AppError(413, 'file_too_big', 'That file is too big');
        await fulfil.sendProof(req.params.id, buf, note.slice(0, 500), req.admin!.adminId);
        await audit(db, req, 'proof_sent', 'order_item', req.params.id);
        const item = await db.orderItem.findUniqueOrThrow({ where: { id: req.params.id }, include: { order: { select: { number: true } } } });
        return { order: await detail(item.order.number) };
      },
    );

    app.post(
      '/admin/items/:id/stitch-files',
      { schema: { tags: ['admin'], summary: 'Add a machine file from the digitizer (multipart: file + label)', params: z.object({ id: z.string().max(40) }), consumes: ['multipart/form-data'] } },
      async (req) => {
        if (!req.isMultipart()) throw new AppError(415, 'multipart_required', 'Send the file as multipart/form-data');
        const part = await req.file({ limits: { fileSize: 15 << 20, files: 1, fields: 4 } });
        if (!part) throw new AppError(400, 'no_file', 'Choose the machine file');
        const label = part.fields.label && 'value' in part.fields.label ? String(part.fields.label.value) : '';
        const buf = await part.toBuffer();
        if (part.file.truncated) throw new AppError(413, 'file_too_big', 'Machine files can be up to 15 MB');
        await stitch.addToItem(req.params.id, buf, part.filename, label, req.admin!.adminId);
        await audit(db, req, 'stitch_file_added', 'order_item', req.params.id, { file: part.filename });
        const item = await db.orderItem.findUniqueOrThrow({ where: { id: req.params.id }, include: { order: { select: { number: true } } } });
        return { order: await detail(item.order.number) };
      },
    );
  };
