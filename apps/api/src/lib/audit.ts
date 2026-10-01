import type { FastifyRequest } from 'fastify';
import type { Db } from './prisma.ts';

/** record what studio staff changed (who, what, when); never blocks the change itself */
export function audit(db: Db, req: FastifyRequest, action: string, entity: string, entityId?: string | null, data?: object) {
  return db.auditLog
    .create({ data: { adminId: req.admin?.adminId ?? null, action, entity, entityId: entityId ?? null, ...(data ? { data } : {}) } })
    .then(() => undefined)
    .catch((err: unknown) => req.log.error({ err }, 'audit log failed'));
}
