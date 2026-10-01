import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError, notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { UploadKind } from '../../generated/prisma/client.ts';
import type { Files } from './service.ts';

/** what shoppers may upload before ordering (attached to the order when it's placed) */
const CUSTOMER_KINDS: Record<string, UploadKind> = { logo: 'LOGO', pet: 'PET_PHOTO', preview: 'PREVIEW' };

export const fileRoutes =
  (db: Db, files: Files): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      '/uploads',
      {
        schema: { tags: ['files'], summary: 'Upload a logo, pet photo or preview (multipart: kind + file)', consumes: ['multipart/form-data'] },
        config: { rateLimit: { max: 40, timeWindow: '10 minutes' } },
      },
      async (req, reply) => {
        if (!req.isMultipart()) throw new AppError(415, 'multipart_required', 'Send the file as multipart/form-data');
        const part = await req.file({ limits: { fileSize: 16 << 20, files: 1, fields: 4 } });
        if (!part) throw new AppError(400, 'no_file', 'Choose a file to upload');
        const kindField = part.fields.kind;
        const kindName = kindField && 'value' in kindField ? String(kindField.value) : '';
        const kind = CUSTOMER_KINDS[kindName];
        if (!kind) throw new AppError(400, 'bad_kind', 'Unknown upload kind');
        const buf = await part.toBuffer();
        if (part.file.truncated) throw new AppError(413, 'file_too_big', 'That file is too big');
        const processed = await files.processImage(buf, kind);
        const me = await app.sessions.customer(req);
        const u = await files.save(kind, processed, { originalName: part.filename, customerId: me?.customerId ?? null });
        reply.code(201);
        return { id: u.id, kind: kindName, width: u.width, height: u.height, bytes: u.bytes };
      },
    );

    app.get(
      '/files/:id',
      {
        schema: { tags: ['files'], summary: 'A private file, through a signed link', params: z.object({ id: z.string().max(40) }), querystring: z.object({ exp: z.coerce.number().int(), sig: z.string().max(64) }) },
      },
      async (req, reply) => {
        if (!files.checkSignature(req.params.id, req.query.exp, req.query.sig)) throw new AppError(403, 'link_expired', 'This link has expired. Open it again from your order page.');
        const u = await db.upload.findUnique({ where: { id: req.params.id } });
        if (!u) throw notFound('File');
        const body = await files.read(u);
        if (!body) throw notFound('File');
        const inline = /^image\/(png|jpeg|webp)$/.test(u.mime) || u.mime === 'application/pdf';
        const name = (u.originalName ?? `${u.kind.toLowerCase()}-${u.id}`).replace(/[^\w.\- ]+/g, '_');
        reply
          .header('content-type', u.mime)
          .header('cache-control', 'private, max-age=3600')
          .header('x-content-type-options', 'nosniff')
          .header('content-security-policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
          .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
        return reply.send(body);
      },
    );

    // public files from local storage (in production a bucket's public URL serves these instead)
    app.get('/media/*', { schema: { hide: true } }, async (req, reply) => {
      const key = (req.params as { '*': string })['*'];
      if (!key.startsWith('public/') || key.includes('..')) throw notFound('File');
      const u = await db.upload.findUnique({ where: { key } });
      if (!u || !u.isPublic) throw notFound('File');
      const body = await files.read(u);
      if (!body) throw notFound('File');
      // s-maxage lets a CDN in front (e.g. Vercel's, through the shop's /api proxy) keep product photos too
      reply.header('content-type', u.mime).header('cache-control', 'public, max-age=31536000, s-maxage=31536000, immutable').header('x-content-type-options', 'nosniff');
      return reply.send(body);
    });
  };
