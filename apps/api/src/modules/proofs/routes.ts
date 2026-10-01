import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { notFound } from '../../lib/errors.ts';
import type { Db } from '../../lib/prisma.ts';
import type { Files } from '../files/service.ts';
import type { Fulfilment } from '../orders/fulfil.ts';

const tokenParam = z.object({ token: z.string().regex(/^[\w-]{16,64}$/) });

/** The stitch-proof page we link to from WhatsApp and email. The secret token in the link is the key; no login needed. */
export const proofRoutes =
  (db: Db, files: Files, fulfil: Fulfilment): FastifyPluginAsyncZod =>
  async (app) => {
    const view = async (token: string) => {
      const p = await db.proof.findUnique({
        where: { token },
        include: { orderItem: { include: { order: { select: { number: true, shipName: true, status: true } }, uploads: { where: { kind: 'PREVIEW' }, take: 1 }, proofs: { orderBy: { version: 'asc' } } } } },
      });
      if (!p) throw notFound('Proof');
      const item = p.orderItem;
      return {
        orderNumber: item.order.number,
        orderCancelled: item.order.status === 'CANCELLED',
        firstName: item.order.shipName.split(/\s+/)[0],
        item: { name: item.name, description: item.description, qty: item.qty, preview: item.uploads[0] ? files.signedPath(item.uploads[0].id, 7) : item.imagePath },
        proof: { version: p.version, status: p.status, imageUrl: files.signedPath(p.imageUploadId, 7), note: p.note, customerComment: p.customerComment, sentAt: p.sentAt.toISOString(), respondedAt: p.respondedAt?.toISOString() ?? null },
        latest: item.proofs.at(-1)?.id === p.id,
        latestToken: item.proofs.at(-1)?.token ?? null,
        versions: item.proofs.length,
      };
    };

    app.addHook('onSend', async (_req, reply) => {
      reply.header('cache-control', 'private, no-store').header('x-robots-tag', 'noindex');
    });

    app.get('/proofs/:token', { schema: { tags: ['proofs'], summary: 'A stitch proof to approve', params: tokenParam } }, async (req) => view(req.params.token));

    app.post(
      '/proofs/:token/approve',
      { schema: { tags: ['proofs'], summary: 'Approve the proof', params: tokenParam }, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
      async (req) => {
        await fulfil.answerProof(req.params.token, true, null);
        return view(req.params.token);
      },
    );

    app.post(
      '/proofs/:token/changes',
      {
        schema: { tags: ['proofs'], summary: 'Ask for changes', params: tokenParam, body: z.object({ comment: z.string().trim().min(3, 'Tell us what you’d like changed').max(1000) }) },
        config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
      },
      async (req) => {
        await fulfil.answerProof(req.params.token, false, req.body.comment);
        return view(req.params.token);
      },
    );
  };
