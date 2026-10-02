import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireOwner } from '../../lib/auth.ts';
import { AppError } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { InvoiceSnapshot } from '../invoice/pdf.ts';

/* GST reports for the accountant (owner only), as CSV files that open in Excel: every invoice line (sales
   register), an HSN summary split B2B/B2C (GSTR-1 table 12), and refunds (for credit notes). Numbers come from
   the invoice snapshots, so they match the invoice PDFs to the paisa. Dates are Indian time. */

const IST_MS = 5.5 * 3_600_000;
const range = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
});

/** inclusive dates in Indian time → [start, end) instants */
export function istWindow(from: string, to: string) {
  const start = new Date(Date.parse(`${from}T00:00:00Z`) - IST_MS);
  const end = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000 - IST_MS);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new AppError(400, 'bad_date', 'Those dates are not valid');
  if (start >= end) throw new AppError(400, 'bad_range', 'The start date must be on or before the end date');
  if (end.getTime() - start.getTime() > 400 * 86_400_000) throw new AppError(400, 'range_too_long', 'Pick at most a year at a time');
  return { start, end };
}

const rupees = (paise: number) => Number((paise / 100).toFixed(2));
const rate = (bp: number) => bp / 100;
/** DD-MM-YYYY in Indian time, as Indian accountants write it */
export const istDay = (d: Date | string) => {
  const t = new Date(new Date(d).getTime() + IST_MS);
  return `${String(t.getUTCDate()).padStart(2, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${t.getUTCFullYear()}`;
};

type Cell = string | number | null;
/** RFC 4180 CSV with a BOM (so Excel reads ₹ and Hindi names). Text that Excel would run as a formula is
    neutralised with a leading quote (a customer could type "=HYPERLINK(…)" as their name). */
export function toCsv(rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v === null) return '';
    if (typeof v === 'number') return String(v);
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const ORDER_STATUS: Record<string, string> = {
  PENDING_PAYMENT: 'Waiting for payment', PLACED: 'Placed', IN_PRODUCTION: 'In production', SHIPPED: 'Shipped', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};

export const adminReportRoutes =
  (db: Db): FastifyPluginAsyncZod =>
  async (app) => {
    app.addHook('preValidation', requireOwner);

    const invoicesIn = (start: Date, end: Date) =>
      db.invoice.findMany({
        where: { issuedAt: { gte: start, lt: end } },
        orderBy: [{ fy: 'asc' }, { seq: 'asc' }],
        select: { number: true, issuedAt: true, snapshot: true, order: { select: { number: true, status: true } } },
      });
    const send = (reply: { header: (k: string, v: string) => unknown }, name: string, q: { from: string; to: string }, body: string) => {
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="${name}-${q.from}_to_${q.to}.csv"`);
      reply.header('cache-control', 'private, no-store');
      return body;
    };

    app.get(
      '/admin/reports/gst-sales.csv',
      { schema: { tags: ['admin'], summary: 'Sales register: every invoice line with GST, for a date range (owner)', querystring: range } },
      async (req, reply) => {
        const { start, end } = istWindow(req.query.from, req.query.to);
        const rows: Cell[][] = [[
          'Invoice no', 'Invoice date', 'Order no', 'Order status', 'Customer', 'Customer GSTIN', 'Type', 'Place of supply', 'State code',
          'Inter-state', 'HSN', 'Description', 'Qty', 'GST rate %', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total incl. GST', 'Payment',
        ]];
        const sum = { qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
        for (const inv of await invoicesIn(start, end)) {
          const s = inv.snapshot as unknown as InvoiceSnapshot;
          for (const l of s.lines) {
            rows.push([
              inv.number, istDay(inv.issuedAt), inv.order.number, ORDER_STATUS[inv.order.status] ?? inv.order.status,
              s.buyer.business || s.buyer.name, s.buyer.gstin, s.buyer.gstin ? 'B2B' : 'B2C', s.buyer.state, s.buyer.stateCode,
              s.interState ? 'Yes' : 'No', l.hsn, l.name, l.qty, rate(l.rateBp), rupees(l.taxablePaise), rupees(l.cgstPaise),
              rupees(l.sgstPaise), rupees(l.igstPaise), rupees(l.valuePaise), s.paymentMethod,
            ]);
            sum.qty += l.qty; sum.taxable += l.taxablePaise; sum.cgst += l.cgstPaise; sum.sgst += l.sgstPaise; sum.igst += l.igstPaise; sum.total += l.valuePaise;
          }
        }
        rows.push(['Total', '', '', '', '', '', '', '', '', '', '', '', sum.qty, '', rupees(sum.taxable), rupees(sum.cgst), rupees(sum.sgst), rupees(sum.igst), rupees(sum.total), '']);
        return send(reply, 'gst-sales-register', req.query, toCsv(rows));
      },
    );

    app.get(
      '/admin/reports/gst-hsn.csv',
      { schema: { tags: ['admin'], summary: 'HSN summary (GSTR-1 table 12), B2B and B2C apart, for a date range (owner)', querystring: range } },
      async (req, reply) => {
        const { start, end } = istWindow(req.query.from, req.query.to);
        const groups = new Map<string, { type: string; hsn: string; desc: string; rateBp: number; qty: number; value: number; taxable: number; igst: number; cgst: number; sgst: number }>();
        for (const inv of await invoicesIn(start, end)) {
          const s = inv.snapshot as unknown as InvoiceSnapshot;
          const type = s.buyer.gstin ? 'B2B' : 'B2C';
          for (const l of s.lines) {
            const key = `${type}|${l.hsn}|${l.rateBp}`;
            const g = groups.get(key) ?? { type, hsn: l.hsn, desc: l.name, rateBp: l.rateBp, qty: 0, value: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
            g.qty += l.qty; g.value += l.valuePaise; g.taxable += l.taxablePaise; g.igst += l.igstPaise; g.cgst += l.cgstPaise; g.sgst += l.sgstPaise;
            groups.set(key, g);
          }
        }
        const rows: Cell[][] = [['Supply type', 'HSN', 'Description', 'UQC', 'Total quantity', 'Total value', 'Rate %', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Cess']];
        for (const g of [...groups.values()].sort((a, b) => a.type.localeCompare(b.type) || a.hsn.localeCompare(b.hsn) || a.rateBp - b.rateBp)) {
          rows.push([g.type, g.hsn, g.desc, 'NOS-NUMBERS', g.qty, rupees(g.value), rate(g.rateBp), rupees(g.taxable), rupees(g.igst), rupees(g.cgst), rupees(g.sgst), 0]);
        }
        return send(reply, 'gst-hsn-summary', req.query, toCsv(rows));
      },
    );

    app.get(
      '/admin/reports/refunds.csv',
      { schema: { tags: ['admin'], summary: 'Refunds for a date range, for credit notes (owner)', querystring: range } },
      async (req, reply) => {
        const { start, end } = istWindow(req.query.from, req.query.to);
        const refunds = await db.refund.findMany({
          where: { createdAt: { gte: start, lt: end } },
          orderBy: { createdAt: 'asc' },
          include: { order: { select: { number: true, shipName: true, gstin: true, invoice: { select: { number: true, issuedAt: true } } } } },
        });
        const returnIds = [...new Set(refunds.map((r) => r.returnId).filter((x): x is string => !!x))];
        const returns = new Map((await db.returnRequest.findMany({ where: { id: { in: returnIds } }, select: { id: true, number: true } })).map((r) => [r.id, r.number]));
        const rows: Cell[][] = [['Refund date', 'Order no', 'Invoice no', 'Invoice date', 'Customer', 'Customer GSTIN', 'Amount', 'Status', 'How', 'Reference', 'Return request', 'Reason']];
        for (const r of refunds) {
          rows.push([
            istDay(r.createdAt), r.order.number, r.order.invoice?.number ?? null, r.order.invoice ? istDay(r.order.invoice.issuedAt) : null,
            r.order.shipName, r.order.gstin, rupees(r.amountPaise), r.status, r.providerRefundId ? 'Razorpay' : 'Manual (UPI/bank)',
            r.providerRefundId ?? r.reference ?? null, r.returnId ? (returns.get(r.returnId) ?? null) : null, r.reason,
          ]);
        }
        return send(reply, 'refunds', req.query, toCsv(rows));
      },
    );
  };
