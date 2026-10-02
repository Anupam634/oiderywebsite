import { z } from 'zod';
import {
  BRAND,
  CHECKOUT_PAYMENT,
  COD_MAX_PAISE,
  PAY_METHOD,
  checkoutDetailsSchema,
  deliveryDays,
  formatINR,
  type PaymentStart,
  type PlaceOrderResult,
} from '@store/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../../config.ts';
import { randomCode } from '../../lib/crypto.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { Actor, Prisma } from '../../generated/prisma/client.ts';
import { lineSchema, priceCart, type PricedLine } from '../cart/service.ts';
import type { Files } from '../files/service.ts';
import type { Notifications } from '../notify/messages.ts';
import type { GatewayPayment, PaymentGateway } from '../payments/gateway.ts';
import { orderInclude, toOrderDto, type FullOrder } from './dto.ts';

type Tx = Prisma.TransactionClient;

export const placeOrderSchema = z.object({
  items: z.array(lineSchema).min(1, 'Your bag is empty').max(50),
  coupon: z.string().trim().toUpperCase().max(30).optional(),
  shipping: z.enum(['standard', 'express']),
  payment: z.enum(['upi', 'card', 'netbanking', 'wallet', 'cod']),
  details: checkoutDetailsSchema,
  saveAddress: z.boolean().default(true),
  /** one id per checkout attempt: retrying "place order" returns the same order */
  clientKey: z.string().min(8).max(64),
  /** the total the shopper saw; if ours differs we stop and show the new one */
  expectedTotalPaise: z.number().int().min(0).optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

const UPLOAD_MAX_AGE_DAYS = 30;
const CUSTOMER_UPLOADS = new Set(['LOGO', 'PET_PHOTO', 'PREVIEW']);

export class OrderService {
  constructor(
    private db: Db,
    private config: Config,
    readonly gateway: PaymentGateway,
    private files: Files,
    private notify: Notifications,
    private log: FastifyBaseLogger,
  ) {}

  load = async (id: string) => {
    const o = await this.db.order.findUnique({ where: { id }, include: orderInclude });
    if (!o) throw notFound('Order');
    return o;
  };
  byNumber = (number: string) => this.db.order.findUnique({ where: { number }, include: orderInclude });
  dto = (o: FullOrder) => toOrderDto(o, this.files, this.config.PENDING_ORDER_MINUTES);

  /** customer-facing view of an order with item images for messages */
  private forMail = (o: FullOrder) => ({ ...o, items: o.items.map((i) => ({ ...i, image: i.uploads.find((u) => u.kind === 'PREVIEW') ? this.files.signedPath(i.uploads.find((u) => u.kind === 'PREVIEW')!.id, 30) : i.imagePath })) });

  private event(tx: Tx | Db, orderId: string, type: string, message: string, opts: { actor?: Actor; adminId?: string | null; visible?: boolean; data?: object } = {}) {
    return tx.orderEvent.create({
      data: { orderId, type, message, actor: opts.actor ?? 'SYSTEM', adminId: opts.adminId ?? null, visible: opts.visible ?? true, ...(opts.data ? { data: opts.data } : {}) },
    });
  }

  /* ---------------- placing an order ---------------- */

  async place(customerId: string, input: PlaceOrderInput, ip: string): Promise<PlaceOrderResult> {
    const customer = await this.db.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new AppError(401, 'login_required', 'Please log in again');
    const again = await this.db.order.findUnique({ where: { customerId_clientKey: { customerId, clientKey: input.clientKey } }, include: orderInclude });
    if (again) return { order: this.dto(again), payment: again.status === 'PENDING_PAYMENT' ? await this.paymentStart(again) : null };

    const priced = await priceCart(this.db, input, { customerId });
    const bad = priced.lines.filter((l) => !l.available);
    if (bad.length)
      throw new AppError(409, 'cart_changed', 'Something in your bag needs a look', { lines: priced.lines.map(({ facts: _f, input: _i, ...l }) => l) });
    if (input.coupon && priced.couponStatus && !priced.couponStatus.valid) throw new AppError(409, 'coupon_invalid', priced.couponStatus.message);
    const t = priced.totals;
    if (input.expectedTotalPaise !== undefined && input.expectedTotalPaise !== t.totalPaise)
      throw new AppError(409, 'price_changed', `Your total is now ${formatINR(t.totalPaise)}. Please check and try again.`, { totals: t });
    const cod = input.payment === 'cod';
    if (cod) {
      if (!t.codAllowed) throw new AppError(409, 'cod_not_allowed', 'Made-for-you pieces are prepaid. Please pay by UPI or card.');
      if (t.totalPaise > COD_MAX_PAISE) throw new AppError(409, 'cod_limit', `Cash on delivery is available up to ${formatINR(COD_MAX_PAISE)}. Please pay online.`);
      if (customer.codBlocked) throw new AppError(409, 'cod_blocked', 'Cash on delivery isn’t available for this account. Please pay online.');
    }

    // files made at add-to-bag time (preview renders, logos, pet photos)
    const uploadIds = [...new Set(priced.lines.flatMap((l) => l.input.uploads ?? []))];
    const uploads = uploadIds.length ? await this.db.upload.findMany({ where: { id: { in: uploadIds } } }) : [];
    const usable = new Map(
      uploads
        .filter((u) => CUSTOMER_UPLOADS.has(u.kind) && !u.orderItemId && (!u.customerId || u.customerId === customerId) && Date.now() - u.createdAt.getTime() < UPLOAD_MAX_AGE_DAYS * 86_400_000)
        .map((u) => [u.id, u]),
    );
    for (const l of priced.lines) {
      if ('studio' in l.input && l.input.studio.source === 'upload' && !(l.input.uploads ?? []).some((id) => usable.get(id)?.kind === 'LOGO'))
        throw new AppError(409, 'logo_missing', `Please add your logo again for “${l.facts?.name ?? 'your design'}” in the design studio`);
    }

    const d = input.details;
    const makeDays = Math.max(...priced.lines.map((l) => l.facts!.makeDays));
    const etaDate = new Date(Date.now() + deliveryDays(d.pincode, { express: input.shipping === 'express', makeDays }) * 86_400_000);
    const couponUsed = priced.coupon && t.discountLabel === `Coupon ${priced.coupon.code}` ? priced.coupon.code : null;
    const now = new Date();

    const orderId = await this.db.$transaction(async (tx) => {
      // an earlier unpaid attempt by this shopper gives its stock back first
      for (const s of await tx.order.findMany({ where: { customerId, status: 'PENDING_PAYMENT' }, select: { id: true } })) await this.releaseInTx(tx, s.id, 'Replaced by a newer checkout');

      const need = new Map<string, number>();
      for (const l of priced.lines) if (l.facts!.trackStock && l.facts!.variantId) need.set(l.facts!.variantId, (need.get(l.facts!.variantId) ?? 0) + l.qty);
      for (const [variantId, qty] of need) {
        const r = await tx.productVariant.updateMany({ where: { id: variantId, stock: { gte: qty } }, data: { stock: { decrement: qty } } });
        if (!r.count) throw new AppError(409, 'sold_out', 'Sorry, a piece in your bag just sold out. Please check your bag.');
      }
      if (couponUsed) {
        const n = await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "code" = ${couponUsed} AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
        if (!n) throw new AppError(409, 'coupon_invalid', 'This offer has just run out');
      }

      const order = await tx.order.create({
        data: {
          number: await this.newNumber(tx),
          customerId,
          clientKey: input.clientKey,
          status: cod ? 'PLACED' : 'PENDING_PAYMENT',
          paymentState: cod ? 'COD_PENDING' : 'PENDING',
          paymentMethod: PAY_METHOD[input.payment],
          shipping: input.shipping === 'express' ? 'EXPRESS' : 'STANDARD',
          couponCode: couponUsed,
          itemCount: t.itemCount,
          subtotalPaise: t.subtotalPaise,
          mrpTotalPaise: t.mrpTotalPaise,
          discountPaise: t.discountPaise,
          discountLabel: t.discountLabel,
          shippingPaise: t.shippingPaise,
          upiDiscountPaise: t.upiDiscountPaise,
          codFeePaise: t.codFeePaise,
          totalPaise: t.totalPaise,
          phone: customer.phone,
          email: d.email || customer.email || null,
          whatsappUpdates: d.whatsappUpdates,
          shipName: d.name,
          shipPhone: d.phone,
          shipLine1: d.line1,
          shipLine2: d.line2,
          shipLandmark: d.landmark,
          shipCity: d.city,
          shipState: d.state,
          shipPincode: d.pincode,
          addressType: d.addressType === 'work' ? 'WORK' : d.addressType === 'other' ? 'OTHER' : 'HOME',
          gstin: d.gst?.gstin ?? null,
          gstBusiness: d.gst?.business ?? null,
          giftNote: d.giftNote || null,
          etaDate,
          ip,
          placedAt: cod ? now : null,
        },
      });
      for (const l of priced.lines) {
        const item = await tx.orderItem.create({ data: this.itemData(order.id, l) });
        const ids = (l.input.uploads ?? []).filter((id) => usable.has(id));
        if (ids.length) await tx.upload.updateMany({ where: { id: { in: ids }, orderItemId: null }, data: { orderItemId: item.id, attachedAt: now, customerId } });
      }
      await this.event(tx, order.id, cod ? 'placed' : 'created', cod ? 'Order placed · cash on delivery' : 'Order created · waiting for payment', { actor: 'CUSTOMER' });
      if (input.saveAddress) await this.rememberAddress(tx, customerId, d);
      const profile: Prisma.CustomerUpdateInput = {};
      if (!customer.name) profile.name = d.name;
      if (!customer.email && d.email) profile.email = d.email;
      if (customer.whatsappOptIn !== d.whatsappUpdates) profile.whatsappOptIn = d.whatsappUpdates;
      if (Object.keys(profile).length) await tx.customer.update({ where: { id: customerId }, data: profile });
      return order.id;
    });

    const full = await this.load(orderId);
    if (cod) {
      void this.notify.orderPlaced(this.forMail(full));
      return { order: this.dto(full), payment: null };
    }
    try {
      return { order: this.dto(full), payment: await this.paymentStart(full) };
    } catch (err) {
      this.log.error({ err, order: full.number }, 'could not start the payment');
      await this.cancel(full.id, 'Payment could not be started', { actor: 'SYSTEM', notify: false });
      throw new AppError(502, 'payment_unavailable', 'Online payment isn’t available right now. Please try again in a few minutes.');
    }
  }

  private itemData(orderId: string, l: PricedLine): Prisma.OrderItemUncheckedCreateInput {
    const f = l.facts!;
    const it = l.input;
    return {
      orderId,
      kind: f.kind,
      productId: f.productId,
      variantId: f.variantId,
      sku: f.sku,
      name: f.name,
      description: f.description,
      imagePath: f.imagePath,
      qty: l.qty,
      unitPricePaise: l.unitPricePaise,
      unitMrpPaise: l.unitMrpPaise,
      extraPaise: l.extraPaise,
      custom: l.custom,
      ...('personalisation' in it && it.personalisation ? { personalisation: it.personalisation } : {}),
      ...('studio' in it ? { studio: it.studio } : {}),
      petName: 'petName' in it && it.petName ? it.petName : null,
      giftWrap: 'giftWrap' in it && !!it.giftWrap,
      hsnCode: f.hsnCode,
      gstRule: f.gstRule,
      gstRateBp: f.gstRateBp,
      productionStatus: f.needsProof ? 'AWAITING_PROOF' : 'NOT_NEEDED',
      stockReserved: f.trackStock ? l.qty : 0,
    };
  }

  private async newNumber(tx: Tx) {
    for (let i = 0; i < 6; i++) {
      const n = `${BRAND.orderPrefix}-${randomCode(6)}`;
      if (!(await tx.order.findUnique({ where: { number: n }, select: { id: true } }))) return n;
    }
    throw new Error('could not find a free order number');
  }

  /** keep the address for next time (updates an identical one instead of adding a copy) */
  private async rememberAddress(tx: Tx, customerId: string, d: PlaceOrderInput['details']) {
    const data = {
      name: d.name, phone: d.phone, line1: d.line1, line2: d.line2, landmark: d.landmark, city: d.city, state: d.state, pincode: d.pincode,
      type: d.addressType === 'work' ? ('WORK' as const) : d.addressType === 'other' ? ('OTHER' as const) : ('HOME' as const),
    };
    const same = await tx.address.findFirst({ where: { customerId, line1: d.line1, pincode: d.pincode, name: d.name } });
    const hasDefault = await tx.address.count({ where: { customerId, isDefault: true } });
    if (same) await tx.address.update({ where: { id: same.id }, data });
    else await tx.address.create({ data: { ...data, customerId, isDefault: !hasDefault } });
  }

  /* ---------------- payments ---------------- */

  /** open (or reopen) the payment window for an unpaid order */
  async paymentStart(o: FullOrder): Promise<PaymentStart> {
    if (o.status !== 'PENDING_PAYMENT') throw new AppError(409, 'not_payable', 'This order doesn’t need a payment');
    if (Date.now() - o.createdAt.getTime() > this.config.PENDING_ORDER_MINUTES * 60_000)
      throw new AppError(409, 'payment_window_closed', 'The payment window for this order has closed. Please check out again.');
    let p = await this.db.payment.findFirst({ where: { orderId: o.id, provider: this.gateway.name, status: 'CREATED', amountPaise: o.totalPaise }, orderBy: { createdAt: 'desc' } });
    if (!p) {
      const g = await this.gateway.createOrder({ amountPaise: o.totalPaise, receipt: o.number, notes: { order: o.number } });
      p = await this.db.payment.create({ data: { orderId: o.id, provider: this.gateway.name, providerOrderId: g.providerOrderId, amountPaise: o.totalPaise } });
    }
    return {
      provider: this.gateway.name,
      orderNumber: o.number,
      amountPaise: o.totalPaise,
      currency: 'INR',
      method: CHECKOUT_PAYMENT[o.paymentMethod],
      ...(this.gateway.keyId ? { keyId: this.gateway.keyId } : {}),
      ...(p.providerOrderId ? { providerOrderId: p.providerOrderId } : {}),
      description: `Order ${o.number}`,
      prefill: { name: o.shipName, email: o.email ?? '', contact: `+91${o.phone}` },
    };
  }

  /** the browser's Razorpay success handler: check the signature, confirm with Razorpay, mark paid */
  async confirmRazorpay(o: FullOrder, body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
    const p = await this.db.payment.findUnique({ where: { providerOrderId: body.razorpay_order_id } });
    if (!p || p.orderId !== o.id) throw new AppError(400, 'payment_mismatch', 'This payment is for another order');
    if (!this.gateway.verifyCheckout(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature))
      throw new AppError(400, 'bad_signature', 'We couldn’t verify this payment. If money was taken, it will be refunded automatically.');
    let gp = await this.gateway.fetchPayment(body.razorpay_payment_id);
    if (gp.status === 'authorized') gp = await this.gateway.capture(gp.paymentId, gp.amountPaise);
    if (gp.status !== 'captured') throw new AppError(402, 'payment_incomplete', 'The payment hasn’t completed yet');
    await this.recordPaid(p.id, gp);
    return this.load(o.id);
  }

  /** the dev/demo payment sheet */
  async fakePayment(o: FullOrder, ok: boolean) {
    if (this.gateway.name !== 'fake') throw new AppError(404, 'not_found', 'Not available');
    const p = await this.db.payment.findFirst({ where: { orderId: o.id, provider: 'fake', status: 'CREATED' }, orderBy: { createdAt: 'desc' } });
    if (!p?.providerOrderId) throw new AppError(409, 'not_payable', 'Start the payment first');
    const gp = (this.gateway as unknown as { pay(id: string, amt: number, m: string, ok: boolean): GatewayPayment }).pay(p.providerOrderId, p.amountPaise, CHECKOUT_PAYMENT[o.paymentMethod], ok);
    if (!ok) {
      await this.db.payment.update({ where: { id: p.id }, data: { errorReason: gp.errorReason } });
      await this.event(this.db, o.id, 'payment_failed', 'A payment attempt failed', { visible: false });
      throw new AppError(402, 'payment_failed', 'The payment didn’t go through. You can try again.');
    }
    await this.recordPaid(p.id, gp);
    return this.load(o.id);
  }

  /**
   * The one place an order becomes paid (checkout handler, webhook and reconciliation all call it).
   * Safe to call twice. A payment that lands after the order was auto-cancelled brings the order back if
   * the stock is still there, otherwise it's refunded.
   */
  async recordPaid(paymentRowId: string, gp: GatewayPayment) {
    const outcome = await this.db.$transaction(async (tx) => {
      const pay = await tx.payment.findUniqueOrThrow({ where: { id: paymentRowId }, include: { order: { include: { items: true } } } });
      const o = pay.order;
      if (pay.status === 'CAPTURED' && pay.providerPaymentId === gp.paymentId) return { kind: 'noop' as const, orderId: o.id };
      await tx.payment.update({
        where: { id: pay.id },
        data: { status: 'CAPTURED', providerPaymentId: gp.paymentId, method: gp.method, errorReason: null, raw: (gp.raw ?? {}) as Prisma.InputJsonValue },
      });
      if (gp.amountPaise !== o.totalPaise)
        await this.event(tx, o.id, 'amount_mismatch', `Paid ${formatINR(gp.amountPaise)} but the order total is ${formatINR(o.totalPaise)}`, { visible: false });
      if (o.upiDiscountPaise && gp.method && gp.method !== 'upi')
        await this.event(tx, o.id, 'upi_discount_mismatch', `UPI discount given but paid by ${gp.method}`, { visible: false });
      if (o.paymentState === 'PAID') return { kind: 'noop' as const, orderId: o.id };
      const now = new Date();
      if (o.status === 'PENDING_PAYMENT') {
        await tx.order.update({ where: { id: o.id }, data: { status: 'PLACED', paymentState: 'PAID', paidAt: now, placedAt: now } });
        await this.event(tx, o.id, 'paid', `Payment of ${formatINR(gp.amountPaise)} received`);
        return { kind: 'placed' as const, orderId: o.id };
      }
      if (o.status === 'CANCELLED') {
        if (await this.reserveAgain(tx, o.items)) {
          if (o.couponCode) await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "code" = ${o.couponCode}`;
          await tx.order.update({ where: { id: o.id }, data: { status: 'PLACED', paymentState: 'PAID', paidAt: now, placedAt: now, cancelledAt: null, cancelReason: null } });
          await this.event(tx, o.id, 'paid', `Payment of ${formatINR(gp.amountPaise)} received`);
          return { kind: 'placed' as const, orderId: o.id };
        }
        await tx.order.update({ where: { id: o.id }, data: { paymentState: 'PAID', paidAt: now } });
        return { kind: 'refund' as const, orderId: o.id };
      }
      await tx.order.update({ where: { id: o.id }, data: { paymentState: 'PAID', paidAt: now } });
      return { kind: 'noop' as const, orderId: o.id };
    });
    if (outcome.kind === 'placed') void this.notify.orderPlaced(this.forMail(await this.load(outcome.orderId)));
    if (outcome.kind === 'refund') {
      const o = await this.load(outcome.orderId);
      await this.refund(o, o.totalPaise - o.refundedPaise, 'Paid after the order had closed and the piece sold out', { actor: 'SYSTEM' });
    }
  }

  /** take stock again for a cancelled order; false (and nothing taken) if any piece has sold out since */
  private async reserveAgain(tx: Tx, items: { variantId: string | null; qty: number; id: string }[]) {
    const taken: { variantId: string; itemId: string; qty: number }[] = [];
    for (const i of items) {
      if (!i.variantId) continue;
      const v = await tx.productVariant.findUnique({ where: { id: i.variantId }, select: { trackStock: true } });
      if (!v?.trackStock) continue;
      const r = await tx.productVariant.updateMany({ where: { id: i.variantId, stock: { gte: i.qty } }, data: { stock: { decrement: i.qty } } });
      if (!r.count) {
        for (const t of taken) await tx.productVariant.updateMany({ where: { id: t.variantId }, data: { stock: { increment: t.qty } } });
        return false;
      }
      taken.push({ variantId: i.variantId, itemId: i.id, qty: i.qty });
    }
    for (const t of taken) await tx.orderItem.update({ where: { id: t.itemId }, data: { stockReserved: t.qty } });
    return true;
  }

  /* ---------------- cancelling and refunds ---------------- */

  /** give reserved stock and the coupon use back, and mark the order cancelled (no refund here) */
  private async releaseInTx(tx: Tx, orderId: string, reason: string, actor: Actor = 'SYSTEM', adminId: string | null = null) {
    const o = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!o || o.status === 'CANCELLED') return false;
    for (const i of o.items) {
      if (!i.stockReserved || !i.variantId) continue;
      await tx.productVariant.updateMany({ where: { id: i.variantId }, data: { stock: { increment: i.stockReserved } } });
      await tx.orderItem.update({ where: { id: i.id }, data: { stockReserved: 0 } });
    }
    if (o.couponCode) await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE "code" = ${o.couponCode}`;
    await tx.order.update({ where: { id: o.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason || (actor === 'CUSTOMER' ? 'Cancelled by the customer' : null) } });
    const message = actor === 'CUSTOMER' ? `You cancelled the order${reason ? ` (${reason})` : ''}` : `Order cancelled: ${reason}`;
    await this.event(tx, o.id, 'cancelled', message, { actor, adminId });
    return true;
  }

  /** cancel an order; anything already paid is refunded in full */
  async cancel(orderId: string, reason: string, opts: { actor: Actor; adminId?: string | null; notify?: boolean }) {
    const changed = await this.db.$transaction((tx) => this.releaseInTx(tx, orderId, reason, opts.actor, opts.adminId ?? null));
    let o = await this.load(orderId);
    let refunded = 0;
    if (changed && o.paymentState === 'PAID' && o.totalPaise > o.refundedPaise) {
      refunded = o.totalPaise - o.refundedPaise;
      await this.refund(o, refunded, reason, { actor: opts.actor, adminId: opts.adminId ?? null, notify: false });
      o = await this.load(orderId);
    }
    if (changed && opts.notify !== false) void this.notify.cancelled(o, refunded);
    return o;
  }

  async refund(o: FullOrder, amountPaise: number, reason: string, opts: { actor: Actor; adminId?: string | null; notify?: boolean; returnId?: string }) {
    if (amountPaise <= 0) throw new AppError(400, 'bad_amount', 'Nothing to refund');
    if (amountPaise > o.totalPaise - o.refundedPaise) throw new AppError(400, 'bad_amount', `You can refund up to ${formatINR(o.totalPaise - o.refundedPaise)}`);
    const pay = o.payments.find((p) => p.status === 'CAPTURED' && p.providerPaymentId);
    if (!pay) throw new AppError(409, 'not_paid_online', 'This order wasn’t paid online, so there is nothing to refund through the gateway');
    const r = await this.gateway.refund(pay.providerPaymentId!, amountPaise, { order: o.number, reason: reason.slice(0, 200) });
    const total = o.refundedPaise + amountPaise;
    await this.db.$transaction([
      this.db.refund.create({ data: { orderId: o.id, paymentId: pay.id, amountPaise, reason, providerRefundId: r.providerRefundId, status: r.status, returnId: opts.returnId ?? null, createdById: opts.adminId ?? null } }),
      this.db.order.update({ where: { id: o.id }, data: { refundedPaise: total, paymentState: total >= o.totalPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } }),
      this.db.orderEvent.create({ data: { orderId: o.id, type: 'refund', message: `Refund of ${formatINR(amountPaise)} started`, actor: opts.actor, adminId: opts.adminId ?? null } }),
      ...(total >= o.totalPaise ? [this.db.payment.update({ where: { id: pay.id }, data: { status: 'REFUNDED' } })] : []),
    ]);
    if (opts.notify !== false) void this.notify.refunded(o, amountPaise);
    return { providerRefundId: r.providerRefundId, status: r.status };
  }

  /* ---------------- housekeeping ---------------- */

  /**
   * Unpaid orders older than the payment window: ask the gateway once more (a webhook may have been lost),
   * then cancel and put the stock back.
   */
  async expireUnpaid() {
    const cutoff = new Date(Date.now() - this.config.PENDING_ORDER_MINUTES * 60_000);
    const stale = await this.db.order.findMany({ where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff } }, include: { payments: true }, take: 50 });
    for (const o of stale) {
      try {
        let paid = false;
        for (const p of o.payments) {
          if (!p.providerOrderId || p.provider !== this.gateway.name) continue;
          const gp = await this.gateway.findPaid(p.providerOrderId);
          if (gp) {
            const done = gp.status === 'authorized' ? await this.gateway.capture(gp.paymentId, gp.amountPaise) : gp;
            if (done.status === 'captured') {
              await this.recordPaid(p.id, done);
              paid = true;
              break;
            }
          }
        }
        if (!paid) await this.cancel(o.id, 'Payment not completed in time', { actor: 'SYSTEM', notify: false });
      } catch (err) {
        this.log.error({ err, order: o.number }, 'could not expire an unpaid order');
      }
    }
    return stale.length;
  }
}
