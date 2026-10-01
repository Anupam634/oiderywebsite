import { BRAND, PAY_METHOD_LABEL, formatINR, formatPhone } from '@store/shared';
import type { Config } from '../../config.ts';
import type { Order, OrderItem } from '../../generated/prisma/client.ts';
import type { Transport } from './transport.ts';

/* What we tell shoppers and the studio, by email and WhatsApp.

   WhatsApp needs each template approved once in Meta Business Manager, with exactly this name and body
   ({{1}}, {{2}}… are filled in per message). Keep this list in sync with what's approved there. */
export const WA_TEMPLATES = {
  order_confirmed: 'Hi {{1}}, thank you for your order {{2}} of {{3}}! We expect it to reach you by {{4}}. We’ll send updates here.',
  stitch_proof_ready: 'Hi {{1}}, the stitch proof for {{2}} (order {{3}}) is ready. Please check it and tap Approve, or tell us what to change: {{4}}',
  order_shipped: 'Hi {{1}}, your order {{2}} is on its way with {{3}} (tracking number {{4}}). Track it here: {{5}}',
  order_delivered: 'Hi {{1}}, your order {{2}} has been delivered. We hope you love it! Reply here if anything isn’t right.',
  order_cancelled: 'Hi {{1}}, your order {{2}} has been cancelled. {{3}}',
  refund_processed: 'Hi {{1}}, we’ve refunded {{2}} for order {{3}}. It can take 5–7 working days to reach your account.',
  new_order_alert: 'New order {{1}}: {{2}} for {{3}} item(s) from {{4}}. Payment: {{5}}.',
  proof_answered: 'Order {{1}}: the customer {{2}} the proof for {{3}}. {{4}}',
} as const;
type WaTemplate = keyof typeof WA_TEMPLATES;

const fill = (tpl: string, params: string[]) => tpl.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? '');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const firstName = (o: Pick<Order, 'shipName'>) => o.shipName.trim().split(/\s+/)[0] || 'there';
const day = (d: Date | null) => (d ? d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : 'soon');

export type MailOrder = Order & { items: (OrderItem & { image?: string | null })[] };

export class Notifications {
  constructor(
    private t: Transport,
    private config: Config,
  ) {}

  private url = (path: string) => `${this.config.APP_URL.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  /** absolute link for an image: media paths are on the storefront, /v1/… files go through its /api proxy */
  private img = (p: string | null | undefined) => (!p ? null : /^https?:/.test(p) ? p : p.startsWith('/v1/') ? this.url(`/api${p}`) : this.url(`/${p}`));

  private wa(to: string, template: WaTemplate, params: string[], buttonParam?: string) {
    return this.t.whatsapp({ to, template, params, ...(buttonParam ? { buttonParam } : {}), preview: fill(WA_TEMPLATES[template], params) });
  }

  private layout(title: string, intro: string, body: string, cta?: { label: string; href: string }) {
    const button = cta
      ? `<p style="margin:26px 0 8px"><a href="${esc(cta.href)}" style="display:inline-block;padding:14px 26px;border-radius:999px;background:#E4007C;background-image:linear-gradient(90deg,#FF2E93,#FF8A00);color:#fff;font-weight:700;text-decoration:none">${esc(cta.label)}</a></p>`
      : '';
    return `<!doctype html><html><body style="margin:0;background:#FFF4E6;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#1B1030">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF4E6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #F3DCC4">
<tr><td style="background:#1B1030;background-image:linear-gradient(120deg,#FF2E93,#FF8A00 60%,#FFB300);padding:26px 28px;color:#fff">
<div style="font-family:Georgia,serif;font-style:italic;font-size:28px;font-weight:700">${esc(BRAND.name.toLowerCase())}</div>
<div style="font-size:13px;opacity:.9;margin-top:4px">${esc(BRAND.tagline)}</div></td></tr>
<tr><td style="padding:28px">
<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 10px">${esc(title)}</h1>
<p style="font-size:15px;line-height:1.55;margin:0 0 18px;color:#3A2E4F">${intro}</p>
${body}${button}
</td></tr>
<tr><td style="padding:18px 28px;background:#FFF8EE;font-size:12px;color:#7A6E8A">Questions? Reply to this email or WhatsApp us on ${esc(BRAND.whatsapp)}.<br>${esc(BRAND.legalName)}</td></tr>
</table></td></tr></table></body></html>`;
  }

  private itemsTable(o: MailOrder) {
    const rows = o.items
      .map((i) => {
        const src = this.img(i.image ?? i.imagePath);
        return `<tr><td style="padding:10px 0;border-bottom:1px dashed #F0DCC8;width:64px">${src ? `<img src="${esc(src)}" width="56" height="70" style="border-radius:10px;object-fit:cover;display:block" alt="">` : ''}</td>
<td style="padding:10px 12px;border-bottom:1px dashed #F0DCC8;font-size:14px"><b>${esc(i.name)}</b><br><span style="color:#7A6E8A;font-size:12.5px">${esc(i.description)}</span><br><span style="font-size:12.5px">Qty ${i.qty}</span></td>
<td style="padding:10px 0;border-bottom:1px dashed #F0DCC8;text-align:right;font-weight:700;font-size:14px;white-space:nowrap">${formatINR(i.qty * i.unitPricePaise + i.extraPaise)}</td></tr>`;
      })
      .join('');
    const line = (k: string, v: string, strong = false) =>
      `<tr><td colspan="2" style="padding:4px 0;font-size:14px;${strong ? 'font-weight:700' : 'color:#3A2E4F'}">${k}</td><td style="padding:4px 0;text-align:right;font-size:14px;${strong ? 'font-weight:700' : ''}">${v}</td></tr>`;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
${line('Subtotal', formatINR(o.subtotalPaise))}
${o.discountPaise ? line(esc(o.discountLabel ?? 'Discount'), '−' + formatINR(o.discountPaise)) : ''}
${o.upiDiscountPaise ? line('UPI discount', '−' + formatINR(o.upiDiscountPaise)) : ''}
${line(o.shipping === 'EXPRESS' ? 'Shipping (express)' : 'Shipping', o.shippingPaise ? formatINR(o.shippingPaise) : 'Free')}
${o.codFeePaise ? line('Cash handling', formatINR(o.codFeePaise)) : ''}
${line('Total', formatINR(o.totalPaise), true)}</table>
<p style="font-size:13px;color:#3A2E4F;margin:16px 0 0"><b>Delivering to</b><br>${esc(o.shipName)}, ${esc(o.shipLine1)}, ${esc(o.shipLine2)}${o.shipLandmark ? ', ' + esc(o.shipLandmark) : ''}<br>${esc(o.shipCity)}, ${esc(o.shipState)} ${esc(o.shipPincode)} · ${formatPhone(o.shipPhone)}</p>`;
  }

  async orderPlaced(o: MailOrder) {
    const custom = o.items.some((i) => i.productionStatus !== 'NOT_NEEDED');
    const paid = o.paymentState === 'PAID';
    const link = this.url(`/account/orders/${o.number}`);
    const intro = `${esc(firstName(o))}, your order <b>${o.number}</b> is confirmed${paid ? ' and paid' : ''}. ${
      custom ? 'We’ll WhatsApp you a stitch proof within 24 hours; we start stitching once you approve it.' : 'We’ll pack it with a handwritten note within 1–2 days.'
    } Expected delivery: <b>${day(o.etaDate)}</b>.${o.paymentMethod === 'COD' ? ` Please keep ${formatINR(o.totalPaise)} ready for the delivery partner.` : ''}`;
    const jobs: Promise<unknown>[] = [];
    if (o.email)
      jobs.push(
        this.t.email({
          to: o.email,
          subject: `Order ${o.number} confirmed · ${BRAND.name}`,
          html: this.layout('Thank you for your order!', intro, this.itemsTable(o), { label: 'View your order', href: link }),
          text: `Your order ${o.number} is confirmed. Total ${formatINR(o.totalPaise)}. Expected delivery ${day(o.etaDate)}. ${link}`,
        }),
      );
    if (o.whatsappUpdates) jobs.push(this.wa(o.phone, 'order_confirmed', [firstName(o), o.number, formatINR(o.totalPaise), day(o.etaDate)]));
    jobs.push(this.ownerNewOrder(o));
    await Promise.all(jobs);
  }

  private async ownerNewOrder(o: MailOrder) {
    const pay = o.paymentMethod === 'COD' ? 'Cash on delivery' : `${PAY_METHOD_LABEL[o.paymentMethod]} (paid)`;
    const jobs: Promise<unknown>[] = [];
    if (this.config.OWNER_EMAIL)
      jobs.push(
        this.t.email({
          to: this.config.OWNER_EMAIL,
          subject: `New order ${o.number} · ${formatINR(o.totalPaise)}`,
          html: this.layout(`New order ${o.number}`, `${o.itemCount} item(s), ${pay}, from ${esc(o.shipCity)}.`, this.itemsTable(o), { label: 'Open in admin', href: this.url(`/admin/orders/${o.number}`) }),
          text: `New order ${o.number}: ${formatINR(o.totalPaise)}, ${o.itemCount} item(s), ${pay}.`,
        }),
      );
    if (this.config.OWNER_WHATSAPP) jobs.push(this.wa(this.config.OWNER_WHATSAPP, 'new_order_alert', [o.number, formatINR(o.totalPaise), String(o.itemCount), o.shipCity, pay]));
    await Promise.all(jobs);
  }

  async proofReady(o: Order, item: Pick<OrderItem, 'name'>, token: string, imageUrl: string | null, note: string) {
    const link = this.url(`/proof/${token}`);
    const jobs: Promise<unknown>[] = [];
    if (o.whatsappUpdates) jobs.push(this.wa(o.phone, 'stitch_proof_ready', [firstName(o), item.name, o.number, link], token));
    if (o.email) {
      const img = this.img(imageUrl);
      jobs.push(
        this.t.email({
          to: o.email,
          subject: `Your stitch proof is ready · ${o.number}`,
          html: this.layout(
            'Your stitch proof is ready',
            `${esc(firstName(o))}, here’s how <b>${esc(item.name)}</b> will look. Please approve it, or tell us what to change. We start stitching once you approve.`,
            `${img ? `<img src="${esc(img)}" width="100%" style="border-radius:16px;display:block;max-width:540px" alt="Stitch proof">` : ''}${note ? `<p style="font-size:14px;color:#3A2E4F;margin:14px 0 0"><b>Note from the studio:</b> ${esc(note)}</p>` : ''}`,
            { label: 'Approve or request changes', href: link },
          ),
          text: `Your stitch proof for ${item.name} (order ${o.number}) is ready: ${link}`,
        }),
      );
    }
    await Promise.all(jobs);
  }

  async proofAnswered(o: Order, item: Pick<OrderItem, 'name'>, approved: boolean, comment: string | null) {
    const jobs: Promise<unknown>[] = [];
    const what = approved ? 'approved' : 'asked for changes to';
    if (this.config.OWNER_WHATSAPP) jobs.push(this.wa(this.config.OWNER_WHATSAPP, 'proof_answered', [o.number, what, item.name, comment ? `“${comment.slice(0, 300)}”` : approved ? 'Ready to stitch.' : '']));
    if (this.config.OWNER_EMAIL)
      jobs.push(
        this.t.email({
          to: this.config.OWNER_EMAIL,
          subject: `Proof ${approved ? 'approved' : 'changes requested'} · ${o.number}`,
          html: this.layout(`Proof ${approved ? 'approved' : 'changes requested'}`, `The customer ${what} the proof for <b>${esc(item.name)}</b>.`, comment ? `<p style="font-size:15px">“${esc(comment)}”</p>` : '', {
            label: 'Open in admin',
            href: this.url(`/admin/orders/${o.number}`),
          }),
          text: `Order ${o.number}: the customer ${what} the proof for ${item.name}. ${comment ?? ''}`,
        }),
      );
    await Promise.all(jobs);
  }

  async shipped(o: Order) {
    const track = o.trackingUrl ?? this.url(`/account/orders/${o.number}`);
    const jobs: Promise<unknown>[] = [];
    if (o.whatsappUpdates) jobs.push(this.wa(o.phone, 'order_shipped', [firstName(o), o.number, o.courier ?? 'our courier', o.awb ?? '—', track]));
    if (o.email)
      jobs.push(
        this.t.email({
          to: o.email,
          subject: `Order ${o.number} is on its way`,
          html: this.layout(
            'Your order is on its way!',
            `${esc(firstName(o))}, order <b>${o.number}</b> has left the studio${o.courier ? ` with ${esc(o.courier)}` : ''}${o.awb ? ` (tracking number ${esc(o.awb)})` : ''}.${o.paymentMethod === 'COD' && o.paymentState === 'COD_PENDING' ? ` Please keep ${formatINR(o.totalPaise)} ready.` : ''}`,
            '',
            { label: 'Track your order', href: track },
          ),
          text: `Order ${o.number} is on its way. Track: ${track}`,
        }),
      );
    await Promise.all(jobs);
  }

  async delivered(o: Order) {
    const jobs: Promise<unknown>[] = [];
    if (o.whatsappUpdates) jobs.push(this.wa(o.phone, 'order_delivered', [firstName(o), o.number]));
    if (o.email)
      jobs.push(
        this.t.email({
          to: o.email,
          subject: `Delivered: order ${o.number}`,
          html: this.layout('Delivered!', `${esc(firstName(o))}, order <b>${o.number}</b> has been delivered. We hope you love it. If anything isn’t right, just reply to this email.`, ''),
          text: `Order ${o.number} has been delivered.`,
        }),
      );
    await Promise.all(jobs);
  }

  async cancelled(o: Order, refundPaise: number) {
    const why = refundPaise ? `We’re refunding ${formatINR(refundPaise)} to your original payment method (5–7 working days).` : 'No money was taken.';
    const jobs: Promise<unknown>[] = [];
    if (o.whatsappUpdates) jobs.push(this.wa(o.phone, 'order_cancelled', [firstName(o), o.number, why]));
    if (o.email)
      jobs.push(
        this.t.email({
          to: o.email,
          subject: `Order ${o.number} cancelled`,
          html: this.layout('Your order has been cancelled', `${esc(firstName(o))}, order <b>${o.number}</b> has been cancelled${o.cancelReason ? ` (${esc(o.cancelReason)})` : ''}. ${why}`, ''),
          text: `Order ${o.number} has been cancelled. ${why}`,
        }),
      );
    await Promise.all(jobs);
  }

  async refunded(o: Order, amountPaise: number) {
    const jobs: Promise<unknown>[] = [];
    if (o.whatsappUpdates) jobs.push(this.wa(o.phone, 'refund_processed', [firstName(o), formatINR(amountPaise), o.number]));
    if (o.email)
      jobs.push(
        this.t.email({
          to: o.email,
          subject: `Refund of ${formatINR(amountPaise)} for ${o.number}`,
          html: this.layout('Your refund is on its way', `${esc(firstName(o))}, we’ve refunded <b>${formatINR(amountPaise)}</b> for order <b>${o.number}</b>. It can take 5–7 working days to show in your account.`, ''),
          text: `We've refunded ${formatINR(amountPaise)} for order ${o.number}.`,
        }),
      );
    await Promise.all(jobs);
  }

  /** the GST invoice, attached as a PDF */
  async invoice(o: Order, invoiceNumber: string, pdf: Buffer) {
    if (!o.email) return;
    await this.t.email({
      to: o.email,
      subject: `Invoice ${invoiceNumber} for order ${o.number}`,
      html: this.layout('Your GST invoice', `${esc(firstName(o))}, your tax invoice <b>${esc(invoiceNumber)}</b> for order <b>${o.number}</b> is attached.`, ''),
      text: `Your invoice ${invoiceNumber} for order ${o.number} is attached.`,
      attachments: [{ filename: `${invoiceNumber.replace(/\//g, '-')}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
  }
}
