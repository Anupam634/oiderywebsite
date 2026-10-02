import { z } from 'zod';
import { PINCODE_RE } from '@store/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { notFound } from '../../lib/errors.ts';
import { lookupPincode } from './service.ts';

export const pincodeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/pincodes/:pin',
    {
      schema: {
        tags: ['catalog'],
        summary: 'City and state of a pincode, for filling in addresses (India Post pincode directory)',
        params: z.object({ pin: z.string().regex(PINCODE_RE, 'Enter a 6-digit pincode') }),
      },
    },
    async (req, reply) => {
      const hit = lookupPincode(req.params.pin);
      if (!hit) throw notFound('Pincode');
      reply.header('cache-control', 'public, max-age=86400');
      return hit;
    },
  );
};
