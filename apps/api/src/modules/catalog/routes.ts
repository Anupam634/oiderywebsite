import { z } from 'zod';
import { applyListing, facetCounts, listingQuerySchema } from '@store/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { notFound } from '../../lib/errors.ts';
import { getStoreSettings, publicStore } from '../settings/service.ts';
import type { CatalogRepo } from './repo.ts';

const CACHE = 'public, max-age=30, stale-while-revalidate=300';

export const catalogRoutes =
  (repo: CatalogRepo): FastifyPluginAsyncZod =>
  async (app) => {
    app.get('/store', { schema: { tags: ['catalog'], summary: 'Seller details for the policy and contact pages' } }, async (_req, reply) => {
      reply.header('cache-control', 'public, max-age=300');
      return publicStore(await getStoreSettings(repo.db));
    });

    app.get('/categories', { schema: { tags: ['catalog'], summary: 'Category tree with product counts' } }, async (_req, reply) => {
      reply.header('cache-control', CACHE);
      return { items: await repo.categories() };
    });

    app.get(
      '/products',
      { schema: { tags: ['catalog'], summary: 'Shop listing: filters, facet counts, sort, pages', querystring: listingQuerySchema } },
      async (req, reply) => {
        const q = req.query;
        const index = await repo.index();
        const all = applyListing(index, q);
        const start = (q.page - 1) * q.pageSize;
        reply.header('cache-control', CACHE);
        return {
          items: await repo.cards(all.slice(start, start + q.pageSize).map((p) => p.id)),
          total: all.length,
          page: q.page,
          pageSize: q.pageSize,
          facets: facetCounts(index, q),
        };
      },
    );

    app.get(
      '/products/:slug',
      { schema: { tags: ['catalog'], summary: 'Product page data', params: z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) }) } },
      async (req, reply) => {
        const product = await repo.product(req.params.slug);
        if (!product) throw notFound('Product');
        reply.header('cache-control', CACHE);
        return product;
      },
    );

    app.get(
      '/search',
      { schema: { tags: ['catalog'], summary: 'Search suggestions', querystring: z.object({ q: z.string().trim().min(1).max(80), limit: z.coerce.number().int().min(1).max(12).default(6) }) } },
      async (req, reply) => {
        const hits = applyListing(await repo.index(), listingQuerySchema.parse({ q: req.query.q }));
        reply.header('cache-control', CACHE);
        return { items: await repo.cards(hits.slice(0, req.query.limit).map((p) => p.id)), total: hits.length };
      },
    );
  };
