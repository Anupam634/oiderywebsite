import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    /** extra data for the client (e.g. the bag lines that need a look) */
    public details?: unknown,
  ) {
    super(message);
  }
}
export const notFound = (what: string) => new AppError(404, 'not_found', `${what} not found`);

/** Consistent JSON errors: { error: { code, message, details? } } */
export function registerErrorHandler(app: FastifyInstance) {
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: { code: 'not_found', message: `No route for ${req.method} ${req.url}` } });
  });
  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({
        error: { code: 'invalid_request', message: 'The request is not valid', details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })) },
      });
    }
    if (err instanceof AppError)
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } });
    const status = (err as FastifyError).statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'request failed');
    return reply.code(status).send({ error: { code: status === 429 ? 'rate_limited' : 'server_error', message: status >= 500 ? 'Something went wrong' : err.message } });
  });
}
