import { z } from 'zod';
import {
  RETURN_ACTIVE,
  RETURN_REASON_KEYS,
  UPI_RE,
  formatINR,
  returnReason,
  type AdminReturnDetail,
  type AdminReturnRow,
  type ReturnOptions,
  type ReturnReason,
} from '@store/shared';
import { randomCode } from '../../lib/crypto.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { Prisma, ReturnStatus } from '../../generated/prisma/client.ts';
import type { Files } from '../files/service.ts';
import type { MailReturn, Notifications } from '../notify/messages.ts';
import { itemImage, toReturnDto, type FullItem, type FullOrder } from '../orders/dto.ts';
import type { OrderService } from '../orders/service.ts';
import { getStoreSettings } from '../settings/service.ts';

/* Returns and exchanges of delivered pieces.

   REQUESTED (customer) → APPROVED (studio; a replacement size is set aside) → RECEIVED (piece back and checked)
   → EXCHANGED (replacement sent) or REFUNDED (through the gateway, or by UPI/bank for cash orders).
   The studio can also decline (REJECTED); the customer can withdraw while it's still REQUESTED (CANCELLED). */

type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;

export const returnRequestSchema = z.object({
  kind: z.enum(['EXCHANGE', 'REFUND']),
  reason: z.enum(RETURN_REASON_KEYS, 'Choose a reason'),
  details: z.string().trim().max(1000).default(''),
  items: z
    .array(z.object({ orderItemId: z.string().max(40), qty: z.number().int().min(1).max(50), exchangeVariantId: z.string().max(40).optional() }))
    .min(1, 'Choose at least one piece')
    .max(20),
  photos: z.array(z.string().max(40)).max(5).default([]),
  refundUpi: z.string().trim().regex(UPI_RE, 'Enter a UPI ID like name@okbank').optional(),
});
export type ReturnRequestInput = z.infer<typeof returnRequestSchema>;

const returnInclude = { items: true, photos: { select: { id: true } } } satisfies Prisma.ReturnRequestInclude;

/** what one piece of a line cost after the order's discounts (coupon, UPI offer), shared by line value */
export function unitRefund(o: Pick<FullOrder, 'subtotalPaise' | 'discountPaise' | 'upiDiscountPaise'>, i: Pick<FullItem, 'unitPricePaise' | 'qty' | 'extraPaise'>) {
  const line = i.unitPricePaise * i.qty + i.extraPaise;
  const off = o.subtotalPaise > 0 ? ((o.discountPaise + o.upiDiscountPaise) * line) / o.subtotalPaise : 0;
  return Math.max(0, Math.floor((line - off) / i.qty));
}

export class ReturnService {
  constructor(
    private db: Db,
    private orders: OrderService,
    private files: Files,
    private notify: Notifications,
  ) {}

  /* ---------------- what can go back ---------------- */

  async options(o: FullOrder): Promise<ReturnOptions | null> {
    if (o.status !== 'DELIVERED' || !o.deliveredAt) return null;
    const s = await getStoreSettings(this.db);
    if (!s.returnWindowDays || (!s.returnRefunds && !s.returnExchanges)) return null;
    const until = new Date(o.deliveredAt.getTime() + s.returnWindowDays * DAY);
    const taken = new Map<string, number>();
    for (const r of o.returns) if (RETURN_ACTIVE.includes(r.status)) for (const ri of r.items) taken.set(ri.orderItemId, (taken.get(ri.orderItemId) ?? 0) + ri.qty);

    const productIds = [...new Set(o.items.filter((i) => !i.custom && i.productId).map((i) => i.productId!))];
    const products = await this.db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, pricePaise: true, variants: { orderBy: { sortOrder: 'asc' } } } });
    const items: ReturnOptions['items'] = o.items.map((i) => {
      const p = products.find((x) => x.id === i.productId);
      const colours = new Set(p?.variants.map((v) => v.colourName));
      const exchange = (p?.variants ?? [])
        // same price (no money changes hands) and in stock; the bought one means a fresh replacement
        .filter((v) => p!.pricePaise + v.priceDeltaPaise === i.unitPricePaise && (!v.trackStock || v.stock > 0))
        .map((v) => ({
          variantId: v.id,
          label: [colours.size > 1 ? v.colourName : '', v.size ? `Size ${v.size}` : ''].filter(Boolean).join(' · ') || v.colourName,
          current: v.id === i.variantId,
        }));
      return {
        orderItemId: i.id,
        name: i.name,
        description: i.description,
        image: itemImage(i, this.files),
        qty: Math.max(0, i.qty - (taken.get(i.id) ?? 0)),
        custom: i.custom,
        unitRefundPaise: unitRefund(o, i),
        exchange,
      };
    });
    return {
      open: Date.now() <= until.getTime() && items.some((i) => i.qty > 0),
      until: until.toISOString(),
      windowDays: s.returnWindowDays,
      allowRefund: s.returnRefunds,
      allowExchange: s.returnExchanges,
      feePaise: s.returnFeePaise,
      cod: o.paymentMethod === 'COD',
      items,
    };
  }

  /* ---------------- the customer ---------------- */

  async create(customerId: string, orderNumber: string, input: ReturnRequestInput) {
    const o = await this.orders.byNumber(orderNumber);
    if (!o || o.customerId !== customerId) throw notFound('Order');
    const opt = await this.options(o);
    if (!opt) throw new AppError(409, 'not_returnable', 'Returns and exchanges open once the order has been delivered');
    if (!opt.open) {
      if (Date.now() > new Date(opt.until).getTime()) throw new AppError(409, 'window_closed', `Returns for this order closed ${opt.windowDays} days after delivery`);
      throw new AppError(409, 'nothing_left', 'Everything in this order is already being returned');
    }
    if (input.kind === 'REFUND' && !opt.allowRefund) throw new AppError(409, 'no_refunds', 'We offer exchanges for this order, not refunds');
    if (input.kind === 'EXCHANGE' && !opt.allowExchange) throw new AppError(409, 'no_exchanges', 'We offer refunds for this order, not exchanges');
    const why = returnReason(input.reason)!;
    if (new Set(input.items.map((l) => l.orderItemId)).size !== input.items.length) throw new AppError(400, 'duplicate_item', 'Each piece can be listed once');

    const lines = input.items.map((l) => {
      const it = opt.items.find((x) => x.orderItemId === l.orderItemId);
      if (!it) throw new AppError(400, 'bad_item', 'That piece isn’t in this order');
      if (l.qty > it.qty) throw new AppError(400, 'too_many', it.qty ? `Only ${it.qty} of “${it.name}” can still be returned` : `“${it.name}” is already being returned`);
      if (it.custom && !why.customOk) throw new AppError(400, 'custom_piece', `“${it.name}” was made for you, so it can come back only if it arrived damaged or wrong`);
      let exchangeLabel: string | null = null;
      if (input.kind === 'EXCHANGE' && !it.custom) {
        const ex = it.exchange.find((e) => e.variantId === l.exchangeVariantId);
        if (!ex) throw new AppError(400, 'pick_size', `Choose what you’d like instead of “${it.name}”`);
        exchangeLabel = ex.current ? `Replacement, ${ex.label}` : ex.label;
      }
      if (input.kind === 'EXCHANGE' && it.custom) exchangeLabel = 'Remade for you';
      return { orderItemId: it.orderItemId, qty: l.qty, exchangeVariantId: input.kind === 'EXCHANGE' && !it.custom ? l.exchangeVariantId! : null, exchangeLabel };
    });

    if (why.photo && !input.photos.length) throw new AppError(400, 'photo_needed', 'Please add a photo of the problem, so we can sort it out quickly');
    if (input.kind === 'REFUND' && opt.cod && !input.refundUpi) throw new AppError(400, 'upi_needed', 'This order was paid in cash: enter the UPI ID for your refund');
    const photos = input.photos.length
      ? await this.db.upload.findMany({ where: { id: { in: input.photos }, customerId, kind: 'RETURN_PHOTO', returnId: null }, select: { id: true } })
      : [];
    if (photos.length !== new Set(input.photos).size) throw new AppError(400, 'bad_photo', 'One of the photos didn’t upload. Please add it again.');

    const number = await this.newNumber();
    const r = await this.db.$transaction(async (tx) => {
      const created = await tx.returnRequest.create({
        data: {
          number,
          orderId: o.id,
          kind: input.kind,
          reason: input.reason,
          details: input.details,
          refundUpi: input.kind === 'REFUND' && opt.cod ? input.refundUpi! : null,
          items: { create: lines },
        },
        include: returnInclude,
      });
      if (photos.length) await tx.upload.updateMany({ where: { id: { in: photos.map((p) => p.id) } }, data: { returnId: created.id, attachedAt: new Date() } });
      await this.event(tx, o.id, 'return_requested', `${input.kind === 'EXCHANGE' ? 'Exchange' : 'Return'} requested (${number}): ${why.label.toLowerCase()}`, 'CUSTOMER');
      return created;
    });
    void this.notify.returnRequested(o, this.mail({ ...r, items: r.items.map((ri) => ({ ...ri, orderItem: { name: o.items.find((i) => i.id === ri.orderItemId)?.name ?? 'Piece' } })) }));
    return r;
  }

  async cancelByCustomer(customerId: string, number: string): Promise<{ orderNumber: string }> {
    const r = await this.find(number);
    if (r.order.customerId !== customerId) throw notFound('Request');
    if (r.status !== 'REQUESTED') throw new AppError(409, 'cannot_withdraw', 'The studio is already working on this request. Please WhatsApp us and we’ll help.');
    await this.db.$transaction(async (tx) => {
      await this.release(tx, r.items);
      await tx.returnRequest.update({ where: { id: r.id }, data: { status: 'CANCELLED', closedAt: new Date() } });
      await this.event(tx, r.orderId, 'return_cancelled', `You withdrew request ${r.number}`, 'CUSTOMER');
    });
    return { orderNumber: r.order.number };
  }

  /* ---------------- the studio ---------------- */

  async list(filter: 'open' | 'done' | 'all'): Promise<AdminReturnRow[]> {
    const status: ReturnStatus[] | undefined = filter === 'open' ? ['REQUESTED', 'APPROVED', 'RECEIVED'] : filter === 'done' ? ['EXCHANGED', 'REFUNDED', 'REJECTED', 'CANCELLED'] : undefined;
    const rows = await this.db.returnRequest.findMany({
      where: status ? { status: { in: status } } : {},
      orderBy: { createdAt: filter === 'open' ? 'asc' : 'desc' },
      take: 200,
      include: { items: { include: { orderItem: { include: { uploads: { where: { kind: 'PREVIEW' }, select: { id: true, kind: true } } } } } }, order: { select: { number: true, shipName: true, shipCity: true, paymentMethod: true } } },
    });
    return rows.map((r) => ({
      number: r.number,
      orderNumber: r.order.number,
      kind: r.kind,
      status: r.status,
      reason: r.reason as ReturnReason,
      customerName: r.order.shipName,
      city: r.order.shipCity,
      paymentMethod: r.order.paymentMethod,
      pieces: r.items.reduce((n, i) => n + i.qty, 0),
      images: r.items
        .slice(0, 3)
        .map((i) => (i.orderItem.uploads[0] ? this.files.signedPath(i.orderItem.uploads[0].id, 1) : i.orderItem.imagePath))
        .filter((x): x is string => !!x),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async detail(number: string): Promise<AdminReturnDetail> {
    const r = await this.find(number);
    const o = (await this.orders.byNumber(r.order.number))!;
    const full = o.returns.find((x) => x.id === r.id)!;
    const base = toReturnDto(full, o.items, this.files);
    const items = full.items.map((ri) => {
      const i = o.items.find((x) => x.id === ri.orderItemId)!;
      const dto = base.items.find((x) => x.orderItemId === ri.orderItemId)!;
      return { ...dto, sku: i.sku, unitRefundPaise: unitRefund(o, i), exchangeVariantId: ri.exchangeVariantId, stockReserved: ri.stockReserved };
    });
    const s = await getStoreSettings(this.db);
    const value = items.reduce((n, i) => n + i.unitRefundPaise * i.qty, 0);
    const fee = returnReason(full.reason)?.customerChoice ? s.returnFeePaise : 0;
    return {
      ...base,
      items,
      orderNumber: o.number,
      orderTotalPaise: o.totalPaise,
      orderRefundedPaise: o.refundedPaise,
      paymentMethod: o.paymentMethod,
      paidOnline: o.payments.some((p) => p.status === 'CAPTURED' && !!p.providerPaymentId),
      customer: {
        name: o.shipName,
        phone: o.phone,
        email: o.email,
        city: o.shipCity,
        address: [o.shipLine1, o.shipLine2, o.shipLandmark, `${o.shipCity}, ${o.shipState} ${o.shipPincode}`].filter(Boolean).join(', '),
      },
      suggestedRefundPaise: Math.min(Math.max(0, value - fee), o.totalPaise - o.refundedPaise),
      restocked: full.restocked,
    };
  }

  /** accept: an exchange size is set aside now so it's there when the piece comes back */
  async approve(number: string, adminId: string, opts: { note?: string; pickupCourier?: string; pickupAwb?: string }) {
    const r = await this.find(number);
    if (r.status !== 'REQUESTED') throw new AppError(409, 'not_requested', 'Only new requests can be approved');
    const s = await getStoreSettings(this.db);
    const note = opts.note?.trim() || s.returnInstructions;
    await this.db.$transaction(async (tx) => {
      if (r.kind === 'EXCHANGE') await this.reserve(tx, r.items);
      await tx.returnRequest.update({
        where: { id: r.id },
        data: { status: 'APPROVED', approvedAt: new Date(), studioNote: note, pickupCourier: opts.pickupCourier?.trim() || null, pickupAwb: opts.pickupAwb?.trim() || null },
      });
      await this.event(tx, r.orderId, 'return_approved', `Request ${r.number} approved. ${note}`, 'ADMIN', adminId);
    });
    const after = await this.find(number);
    void this.notify.returnApproved(after.order, this.mail(after));
  }

  async reject(number: string, adminId: string, reason: string) {
    const r = await this.find(number);
    if (r.status !== 'REQUESTED' && r.status !== 'APPROVED') throw new AppError(409, 'closed', 'This request can’t be declined now');
    await this.db.$transaction(async (tx) => {
      await this.release(tx, r.items);
      await tx.returnRequest.update({ where: { id: r.id }, data: { status: 'REJECTED', studioNote: reason, closedAt: new Date() } });
      await this.event(tx, r.orderId, 'return_rejected', `Request ${r.number} not accepted: ${reason}`, 'ADMIN', adminId);
    });
    const after = await this.find(number);
    void this.notify.returnRejected(after.order, this.mail(after));
  }

  /** pickup booked or tracking number added later */
  async pickup(number: string, adminId: string, opts: { courier: string; awb: string }) {
    const r = await this.find(number);
    if (r.status !== 'APPROVED') throw new AppError(409, 'not_approved', 'Add the pickup once the request is approved');
    await this.db.$transaction([
      this.db.returnRequest.update({ where: { id: r.id }, data: { pickupCourier: opts.courier.trim(), pickupAwb: opts.awb.trim() } }),
      this.db.orderEvent.create({ data: { orderId: r.orderId, type: 'return_pickup', message: `Pickup for ${r.number} booked with ${opts.courier.trim()} (${opts.awb.trim()})`, actor: 'ADMIN', adminId } }),
    ]);
  }

  /** the piece is back; optionally put it back on sale */
  async receive(number: string, adminId: string, opts: { restock: boolean; note?: string }) {
    const r = await this.find(number);
    if (r.status !== 'APPROVED') throw new AppError(409, 'not_approved', 'Approve the request first');
    await this.db.$transaction(async (tx) => {
      if (opts.restock) {
        for (const ri of r.items) {
          const item = await tx.orderItem.findUnique({ where: { id: ri.orderItemId }, select: { variantId: true, custom: true } });
          if (!item?.variantId || item.custom) continue;
          await tx.productVariant.updateMany({ where: { id: item.variantId, trackStock: true }, data: { stock: { increment: ri.qty } } });
        }
      }
      await tx.returnRequest.update({ where: { id: r.id }, data: { status: 'RECEIVED', receivedAt: new Date(), restocked: opts.restock } });
      await this.event(tx, r.orderId, 'return_received', `We’ve received the piece${r.items.length > 1 || r.items[0]!.qty > 1 ? 's' : ''} for ${r.number}${opts.note ? `: ${opts.note}` : ''}`, 'ADMIN', adminId);
    });
  }

  async shipExchange(number: string, adminId: string, opts: { courier: string; awb: string }) {
    const r = await this.find(number);
    if (r.kind !== 'EXCHANGE') throw new AppError(409, 'not_exchange', 'This request is for a refund');
    if (r.status !== 'APPROVED' && r.status !== 'RECEIVED') throw new AppError(409, 'not_ready', 'Approve the request first');
    await this.db.$transaction(async (tx) => {
      // the set-aside stock has now left the studio
      await tx.returnItem.updateMany({ where: { returnId: r.id }, data: { stockReserved: 0 } });
      await tx.returnRequest.update({ where: { id: r.id }, data: { status: 'EXCHANGED', exchangeCourier: opts.courier.trim(), exchangeAwb: opts.awb.trim(), closedAt: new Date() } });
      await this.event(tx, r.orderId, 'return_exchanged', `Replacement for ${r.number} sent with ${opts.courier.trim()} (${opts.awb.trim()})`, 'ADMIN', adminId);
    });
    const after = await this.find(number);
    void this.notify.exchangeShipped(after.order, this.mail(after));
  }

  /**
   * Refund the request: back to the original online payment through the gateway, or (cash on delivery, or by
   * choice) paid by UPI / bank transfer outside the site, recorded here with its reference.
   */
  async refund(number: string, adminId: string, opts: { amountPaise: number; method: 'GATEWAY' | 'MANUAL'; reference?: string }) {
    const r = await this.find(number);
    if (r.status !== 'APPROVED' && r.status !== 'RECEIVED') throw new AppError(409, 'not_ready', 'Approve the request before refunding it');
    const o = (await this.orders.byNumber(r.order.number))!;
    const max = o.totalPaise - o.refundedPaise;
    if (opts.amountPaise < 100) throw new AppError(400, 'bad_amount', 'Refund at least ₹1');
    if (opts.amountPaise > max) throw new AppError(400, 'bad_amount', `You can refund up to ${formatINR(max)} on this order`);
    let reference: string;
    if (opts.method === 'GATEWAY') {
      const g = await this.orders.refund(o, opts.amountPaise, `Return ${r.number}`, { actor: 'ADMIN', adminId, returnId: r.id });
      reference = g.providerRefundId;
    } else {
      reference = opts.reference?.trim() ?? '';
      if (reference.length < 4) throw new AppError(400, 'reference_needed', 'Enter the UPI or bank transfer reference (UTR)');
      const total = o.refundedPaise + opts.amountPaise;
      await this.db.$transaction([
        this.db.refund.create({ data: { orderId: o.id, amountPaise: opts.amountPaise, reason: `Return ${r.number}`, status: 'PROCESSED', reference, returnId: r.id, createdById: adminId } }),
        this.db.order.update({ where: { id: o.id }, data: { refundedPaise: total, paymentState: total >= o.totalPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } }),
        this.db.orderEvent.create({ data: { orderId: o.id, type: 'refund', message: `Refund of ${formatINR(opts.amountPaise)} sent${r.refundUpi ? ` to ${r.refundUpi}` : ''} (reference ${reference})`, actor: 'ADMIN', adminId } }),
      ]);
      void this.notify.refunded(o, opts.amountPaise);
    }
    await this.db.$transaction(async (tx) => {
      await this.release(tx, r.items); // an exchange settled as a refund gives its set-aside size back
      await tx.returnRequest.update({ where: { id: r.id }, data: { status: 'REFUNDED', refundPaise: opts.amountPaise, refundReference: reference, closedAt: new Date() } });
    });
  }

  /* ---------------- helpers ---------------- */

  private find = async (number: string) => {
    const r = await this.db.returnRequest.findUnique({ where: { number }, include: { items: { include: { orderItem: { select: { name: true } } } }, order: true } });
    if (!r) throw notFound('Request');
    return r;
  };

  private async newNumber() {
    for (;;) {
      const n = `RT-${randomCode(6)}`;
      if (!(await this.db.returnRequest.findUnique({ where: { number: n }, select: { id: true } }))) return n;
    }
  }

  private event(tx: Tx, orderId: string, type: string, message: string, actor: 'CUSTOMER' | 'ADMIN', adminId: string | null = null) {
    return tx.orderEvent.create({ data: { orderId, type, message, actor, adminId } });
  }

  /** set aside the exchange sizes; stops if one has sold out since the request */
  private async reserve(tx: Tx, items: { id: string; qty: number; exchangeVariantId: string | null; exchangeLabel: string | null }[]) {
    for (const ri of items) {
      if (!ri.exchangeVariantId) continue;
      const v = await tx.productVariant.findUnique({ where: { id: ri.exchangeVariantId }, select: { trackStock: true } });
      if (!v?.trackStock) continue;
      const done = await tx.productVariant.updateMany({ where: { id: ri.exchangeVariantId, stock: { gte: ri.qty } }, data: { stock: { decrement: ri.qty } } });
      if (!done.count) throw new AppError(409, 'exchange_sold_out', `${ri.exchangeLabel ?? 'That size'} is out of stock now. Offer a refund or ask the customer for another size.`);
      await tx.returnItem.update({ where: { id: ri.id }, data: { stockReserved: ri.qty } });
    }
  }

  private async release(tx: Tx, items: { id: string; stockReserved: number; exchangeVariantId: string | null }[]) {
    for (const ri of items) {
      if (!ri.stockReserved || !ri.exchangeVariantId) continue;
      await tx.productVariant.updateMany({ where: { id: ri.exchangeVariantId }, data: { stock: { increment: ri.stockReserved } } });
      await tx.returnItem.update({ where: { id: ri.id }, data: { stockReserved: 0 } });
    }
  }

  private mail(r: { number: string; kind: 'EXCHANGE' | 'REFUND'; reason: string; studioNote: string | null; exchangeCourier: string | null; exchangeAwb: string | null; items: { qty: number; exchangeLabel: string | null; orderItem: { name: string } }[] }): MailReturn {
    return {
      number: r.number,
      kind: r.kind,
      reasonLabel: returnReason(r.reason)?.label ?? r.reason,
      studioNote: r.studioNote,
      exchangeCourier: r.exchangeCourier,
      exchangeAwb: r.exchangeAwb,
      items: r.items.map((i) => ({ name: i.orderItem.name, qty: i.qty, exchangeLabel: i.exchangeLabel })),
    };
  }
}

