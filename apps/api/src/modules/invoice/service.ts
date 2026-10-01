import { GST_STATE_CODES, PAY_METHOD_LABEL, amountInWords, computeInvoice, financialYear, invoiceNumber } from '@store/shared';
import { AppError, notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { Invoice } from '../../generated/prisma/client.ts';
import type { Files } from '../files/service.ts';
import { getStoreSettings } from '../settings/service.ts';
import { renderInvoicePdf, type InvoiceSnapshot } from './pdf.ts';

/* GST invoices. Numbers are consecutive within a financial year (PREFIX/2026-27/0001). The figures are frozen
   in a snapshot when the invoice is issued; the PDF can always be redrawn from it. */
export class InvoiceService {
  constructor(
    private db: Db,
    private files: Files,
  ) {}

  /** issue the invoice for an order (once; later calls return the same invoice) */
  async issue(orderId: string): Promise<Invoice> {
    const existing = await this.db.invoice.findUnique({ where: { orderId } });
    if (existing) return existing.pdfUploadId ? existing : this.attachPdf(existing);
    const o = await this.db.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { id: 'asc' } } } });
    if (!o) throw notFound('Order');
    if (o.status === 'PENDING_PAYMENT' || o.status === 'CANCELLED') throw new AppError(409, 'not_invoiceable', 'Invoices are issued for placed orders only');
    const seller = await getStoreSettings(this.db);
    const interState = seller.state !== o.shipState;
    const inv = computeInvoice({
      lines: o.items.map((i) => ({ name: i.name, hsn: i.hsnCode, qty: i.qty, unitPricePaise: i.unitPricePaise, extraPaise: i.extraPaise, rule: i.gstRule, flatBp: i.gstRateBp })),
      discountPaise: o.discountPaise + o.upiDiscountPaise,
      chargesPaise: o.shippingPaise + o.codFeePaise,
      interState,
    });
    if (inv.totals.totalPaise !== o.totalPaise) throw new Error(`invoice total ${inv.totals.totalPaise} differs from order total ${o.totalPaise} (${o.number})`);
    const now = new Date();
    const fy = financialYear(now);
    const snapshot = (number: string): InvoiceSnapshot => ({
      number,
      issuedAt: now.toISOString(),
      orderNumber: o.number,
      orderDate: (o.placedAt ?? o.createdAt).toISOString(),
      paymentMethod: PAY_METHOD_LABEL[o.paymentMethod],
      seller,
      buyer: {
        name: o.shipName,
        phone: o.shipPhone,
        email: o.email,
        address: [`${o.shipLine1}, ${o.shipLine2}${o.shipLandmark ? `, ${o.shipLandmark}` : ''}`, `${o.shipCity}, ${o.shipState} ${o.shipPincode}`],
        state: o.shipState,
        stateCode: GST_STATE_CODES[o.shipState] ?? null,
        gstin: o.gstin,
        business: o.gstBusiness,
      },
      placeOfSupply: `${o.shipState}${GST_STATE_CODES[o.shipState] ? ` (${GST_STATE_CODES[o.shipState]})` : ''}`,
      interState,
      registered: !!seller.gstin,
      lines: inv.lines,
      totals: inv.totals,
      byRate: inv.byRate,
      amountInWords: amountInWords(o.totalPaise),
    });
    const created = await this.db.$transaction(async (tx) => {
      // atomic "next number" for the financial year, safe with two servers
      const rows = await tx.$queryRaw<{ last: number }[]>`
        INSERT INTO "InvoiceCounter" ("fy", "last") VALUES (${fy}, 1)
        ON CONFLICT ("fy") DO UPDATE SET "last" = "InvoiceCounter"."last" + 1
        RETURNING "last"`;
      const last = Number(rows[0]!.last);
      const number = invoiceNumber(seller.invoicePrefix, fy, last);
      const invoice = await tx.invoice.create({ data: { orderId: o.id, number, fy, seq: last, issuedAt: now, snapshot: snapshot(number) as object } });
      await tx.orderEvent.create({ data: { orderId: o.id, type: 'invoice', message: `GST invoice ${number} issued` } });
      return invoice;
    });
    return this.attachPdf(created);
  }

  /** draw the PDF from the snapshot and store it */
  private async attachPdf(invoice: Invoice): Promise<Invoice> {
    const pdf = await renderInvoicePdf(invoice.snapshot as unknown as InvoiceSnapshot);
    const order = await this.db.order.findUnique({ where: { id: invoice.orderId }, select: { customerId: true } });
    const up = await this.files.saveRaw('INVOICE', pdf, 'application/pdf', 'pdf', { originalName: `${invoice.number.replace(/\//g, '-')}.pdf`, customerId: order?.customerId ?? null });
    return this.db.invoice.update({ where: { id: invoice.id }, data: { pdfUploadId: up.id } });
  }

  async pdf(invoice: Invoice): Promise<Buffer> {
    const withPdf = invoice.pdfUploadId ? invoice : await this.attachPdf(invoice);
    const up = await this.db.upload.findUnique({ where: { id: withPdf.pdfUploadId! } });
    const body = up && (await this.files.read(up));
    return body ?? renderInvoicePdf(invoice.snapshot as unknown as InvoiceSnapshot);
  }
}
