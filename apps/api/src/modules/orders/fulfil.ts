import { COURIERS, PRODUCTION_LABEL, type OrderStatus, type ProductionStatus } from '@store/shared';
import { randomToken } from '../../lib/crypto.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { Files } from '../files/service.ts';
import type { InvoiceService } from '../invoice/service.ts';
import type { Notifications } from '../notify/messages.ts';
import type { OrderService } from './service.ts';

/* What happens after an order is placed: stitch proofs, production, shipping, delivery. */

/** where an order can go next from the admin */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: [],
  PLACED: ['IN_PRODUCTION', 'SHIPPED'],
  IN_PRODUCTION: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** items whose proof is settled (or that never needed one) */
const SETTLED: ProductionStatus[] = ['NOT_NEEDED', 'APPROVED', 'IN_PRODUCTION', 'DONE'];

export class Fulfilment {
  constructor(
    private db: Db,
    private orders: OrderService,
    private invoices: InvoiceService,
    private notify: Notifications,
    private files: Files,
  ) {}

  private event(orderId: string, type: string, message: string, adminId: string | null, visible = true) {
    return this.db.orderEvent.create({ data: { orderId, type, message, actor: adminId ? 'ADMIN' : 'SYSTEM', adminId, visible } });
  }

  /** move an order forward (production → shipped → delivered) */
  async advance(number: string, to: OrderStatus, opts: { adminId: string; courier?: string; awb?: string; trackingUrl?: string; force?: boolean }) {
    const o = await this.orders.byNumber(number);
    if (!o) throw notFound('Order');
    if (!NEXT_STATUS[o.status].includes(to)) throw new AppError(409, 'bad_transition', `An order that is “${o.status.toLowerCase().replace('_', ' ')}” can’t be marked “${to.toLowerCase().replace('_', ' ')}”`);
    const now = new Date();
    if (to === 'IN_PRODUCTION') {
      await this.db.order.update({ where: { id: o.id }, data: { status: 'IN_PRODUCTION' } });
      await this.event(o.id, 'in_production', 'Your order is being stitched', opts.adminId);
    }
    if (to === 'SHIPPED') {
      const waiting = o.items.filter((i) => !SETTLED.includes(i.productionStatus));
      if (waiting.length && !opts.force)
        throw new AppError(409, 'proofs_pending', `${waiting.length} piece(s) still need an approved proof: ${waiting.map((i) => `${i.name} (${PRODUCTION_LABEL[i.productionStatus].toLowerCase()})`).join(', ')}`);
      if (!opts.courier?.trim()) throw new AppError(400, 'courier_needed', 'Choose the courier');
      const courier = COURIERS.find((c) => c.id === opts.courier || c.name === opts.courier);
      const awb = opts.awb?.trim() || null;
      const url = opts.trackingUrl?.trim() || (courier?.track && awb ? courier.track.replace('{awb}', encodeURIComponent(awb)) : null);
      await this.db.$transaction([
        this.db.order.update({ where: { id: o.id }, data: { status: 'SHIPPED', shippedAt: now, courier: courier?.name ?? opts.courier!.trim(), awb, trackingUrl: url } }),
        this.db.orderItem.updateMany({ where: { orderId: o.id, productionStatus: { in: ['APPROVED', 'IN_PRODUCTION'] } }, data: { productionStatus: 'DONE' } }),
      ]);
      await this.event(o.id, 'shipped', `Shipped with ${courier?.name ?? opts.courier}${awb ? ` (tracking ${awb})` : ''}`, opts.adminId);
      const invoice = await this.invoices.issue(o.id);
      const shipped = await this.orders.load(o.id);
      void this.notify.shipped(shipped);
      void this.invoices.pdf(invoice).then((pdf) => this.notify.invoice(shipped, invoice.number, pdf));
    }
    if (to === 'DELIVERED') {
      const cod = o.paymentMethod === 'COD' && o.paymentState === 'COD_PENDING';
      await this.db.order.update({ where: { id: o.id }, data: { status: 'DELIVERED', deliveredAt: now, ...(cod ? { paymentState: 'PAID', paidAt: now } : {}) } });
      await this.event(o.id, 'delivered', cod ? 'Delivered · cash collected' : 'Delivered', opts.adminId);
      void this.notify.delivered(await this.orders.load(o.id));
    }
    return this.orders.load(o.id);
  }

  /** send a stitch proof for one item (a new version replaces the open one) */
  async sendProof(itemId: string, image: Buffer, note: string, adminId: string) {
    const item = await this.db.orderItem.findUnique({ where: { id: itemId }, include: { order: true, proofs: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!item) throw notFound('Item');
    if (item.order.status === 'CANCELLED' || item.order.status === 'PENDING_PAYMENT') throw new AppError(409, 'not_active', 'This order isn’t active');
    const processed = await this.files.processImage(image, 'PROOF');
    const up = await this.files.save('PROOF', processed, { orderItemId: item.id, customerId: item.order.customerId, originalName: `proof-v${(item.proofs[0]?.version ?? 0) + 1}.jpg` });
    const version = (item.proofs[0]?.version ?? 0) + 1;
    const proof = await this.db.$transaction(async (tx) => {
      await tx.proof.updateMany({ where: { orderItemId: item.id, status: 'SENT' }, data: { status: 'SUPERSEDED' } });
      const p = await tx.proof.create({ data: { orderItemId: item.id, version, imageUploadId: up.id, note: note.trim(), token: randomToken(18) } });
      await tx.orderItem.update({ where: { id: item.id }, data: { productionStatus: 'PROOF_SENT' } });
      await tx.orderEvent.create({ data: { orderId: item.orderId, type: 'proof_sent', message: `Stitch proof${version > 1 ? ` (version ${version})` : ''} sent for ${item.name}`, actor: 'ADMIN', adminId } });
      return p;
    });
    void this.notify.proofReady(item.order, item, proof.token, this.files.signedPath(up.id, 30), proof.note);
    return proof;
  }

  /** the shopper approves the proof or asks for changes (from the link we sent) */
  async answerProof(token: string, approve: boolean, comment: string | null) {
    const proof = await this.db.proof.findUnique({ where: { token }, include: { orderItem: { include: { order: true } } } });
    if (!proof) throw notFound('Proof');
    if (proof.status === 'SUPERSEDED') throw new AppError(409, 'proof_replaced', 'There’s a newer proof for this piece. Please open the latest link we sent.');
    if (proof.status !== 'SENT') throw new AppError(409, 'proof_answered', approve ? 'You’ve already answered this proof' : 'You’ve already answered this proof');
    const item = proof.orderItem;
    const order = item.order;
    if (order.status === 'CANCELLED') throw new AppError(409, 'order_cancelled', 'This order was cancelled');
    if (!approve && !comment?.trim()) throw new AppError(400, 'comment_needed', 'Tell us what you’d like changed');
    await this.db.$transaction(async (tx) => {
      await tx.proof.update({ where: { id: proof.id }, data: { status: approve ? 'APPROVED' : 'CHANGES_REQUESTED', customerComment: comment?.trim() || null, respondedAt: new Date() } });
      await tx.orderItem.update({ where: { id: item.id }, data: { productionStatus: approve ? 'APPROVED' : 'CHANGES_REQUESTED' } });
      await tx.orderEvent.create({
        data: { orderId: order.id, type: approve ? 'proof_approved' : 'proof_changes', message: approve ? `You approved the proof for ${item.name}` : `You asked for changes to ${item.name}`, actor: 'CUSTOMER', ...(comment ? { data: { comment } } : {}) },
      });
      if (approve && order.status === 'PLACED') {
        // once every proof is approved, stitching starts
        const open = await tx.orderItem.count({ where: { orderId: order.id, productionStatus: { notIn: SETTLED } } });
        if (!open) {
          await tx.order.update({ where: { id: order.id }, data: { status: 'IN_PRODUCTION' } });
          await tx.orderEvent.create({ data: { orderId: order.id, type: 'in_production', message: 'All proofs approved: your order is being stitched' } });
        }
      }
    });
    void this.notify.proofAnswered(order, item, approve, comment?.trim() || null);
    return this.db.proof.findUniqueOrThrow({ where: { id: proof.id } });
  }

  /** the studio sets an item's production step by hand (e.g. approved on a WhatsApp call) */
  async setItemStatus(itemId: string, status: ProductionStatus, adminId: string) {
    const item = await this.db.orderItem.findUnique({ where: { id: itemId } });
    if (!item) throw notFound('Item');
    await this.db.orderItem.update({ where: { id: itemId }, data: { productionStatus: status } });
    await this.event(item.orderId, 'item_status', `${item.name}: ${PRODUCTION_LABEL[status].toLowerCase()}`, adminId, false);
    return item;
  }
}
