import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../../config.ts';

/* Sends email (Resend) and WhatsApp template messages (Meta Cloud API). Without keys, messages go to an
   outbox folder instead (open the .html files in a browser), so every flow can be tried locally.
   Sending never throws: a failed message is logged and must not break an order. */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/** A WhatsApp template message. The template (name + body with {{1}}…) must be approved in Meta Business Manager. */
export interface WhatsAppMessage {
  /** 10-digit Indian mobile */
  to: string;
  template: string;
  params: string[];
  /** fills a URL button's {{1}} (e.g. the proof link's token) */
  buttonParam?: string;
  /** the text the customer will see, for the outbox and logs */
  preview: string;
}

export class Transport {
  private outbox: string;
  constructor(
    private config: Config,
    private log: FastifyBaseLogger,
  ) {
    this.outbox = path.resolve(config.OUTBOX_DIR);
  }

  private async toOutbox(name: string, files: Record<string, string | Buffer>) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(this.outbox, `${stamp}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}`);
    await fs.mkdir(dir, { recursive: true });
    await Promise.all(Object.entries(files).map(([f, c]) => fs.writeFile(path.join(dir, f), c)));
    return dir;
  }

  async email(m: EmailMessage): Promise<boolean> {
    try {
      if (this.config.EMAIL_PROVIDER === 'resend') {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${this.config.RESEND_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from: this.config.EMAIL_FROM,
            to: [m.to],
            subject: m.subject,
            html: m.html,
            text: m.text,
            attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64'), content_type: a.contentType })),
          }),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
        this.log.info({ to: m.to, subject: m.subject }, 'email sent');
      } else {
        const files: Record<string, string | Buffer> = { 'email.html': m.html, 'email.txt': `To: ${m.to}\nSubject: ${m.subject}\n\n${m.text}` };
        for (const a of m.attachments ?? []) files[a.filename] = a.content;
        const dir = await this.toOutbox(`email-${m.subject}`, files);
        this.log.info({ to: m.to, subject: m.subject, dir }, 'email written to the outbox');
      }
      return true;
    } catch (err) {
      this.log.error({ err, to: m.to, subject: m.subject }, 'email failed');
      return false;
    }
  }

  async whatsapp(m: WhatsAppMessage): Promise<boolean> {
    try {
      if (this.config.WHATSAPP_PROVIDER === 'meta') {
        const components: object[] = [{ type: 'body', parameters: m.params.map((text) => ({ type: 'text', text })) }];
        if (m.buttonParam) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: m.buttonParam }] });
        const res = await fetch(`https://graph.facebook.com/v21.0/${this.config.META_WA_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.config.META_WA_TOKEN}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: `91${m.to}`,
            type: 'template',
            template: { name: m.template, language: { code: this.config.META_WA_TEMPLATE_LANG }, components },
          }),
        });
        if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}`);
        this.log.info({ to: m.to, template: m.template }, 'whatsapp sent');
      } else {
        const dir = await this.toOutbox(`whatsapp-${m.template}`, { 'whatsapp.json': JSON.stringify(m, null, 2), 'whatsapp.txt': `To: +91 ${m.to}\n\n${m.preview}\n` });
        this.log.info({ to: m.to, template: m.template, dir }, 'whatsapp written to the outbox');
      }
      return true;
    } catch (err) {
      this.log.error({ err, to: m.to, template: m.template }, 'whatsapp failed');
      return false;
    }
  }
}
