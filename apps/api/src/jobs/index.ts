import type { FastifyBaseLogger } from 'fastify';
import { capture, errorReport } from '../lib/monitor.ts';
import type { Db } from '../lib/prisma.ts';
import type { Files } from '../modules/files/service.ts';
import type { OrderService } from '../modules/orders/service.ts';

/* Background housekeeping inside the API process. Every job is safe to run twice (e.g. two servers). */

const ORPHAN_UPLOAD_DAYS = 30;

export async function cleanUp(db: Db, files: Files) {
  const now = Date.now();
  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  const otps = await db.otpChallenge.deleteMany({ where: { createdAt: { lt: new Date(now - 2 * 86_400_000) } } });
  // files shoppers uploaded for a bag they never ordered, or for a return they never sent
  const orphans = await db.upload.findMany({
    where: {
      createdAt: { lt: new Date(now - ORPHAN_UPLOAD_DAYS * 86_400_000) },
      OR: [{ orderItemId: null, kind: { in: ['LOGO', 'PET_PHOTO', 'PREVIEW'] } }, { returnId: null, kind: 'RETURN_PHOTO' }],
    },
    select: { id: true, key: true },
    take: 500,
  });
  for (const u of orphans) await files.remove(u);
  return { sessions: sessions.count, otps: otps.count, uploads: orphans.length };
}

export function startJobs(deps: { db: Db; files: Files; orders: OrderService; log: FastifyBaseLogger }) {
  const timers: NodeJS.Timeout[] = [];
  const every = (ms: number, name: string, fn: () => Promise<unknown>) => {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        await fn();
      } catch (err) {
        deps.log.error({ err }, `job failed: ${name}`);
        capture(errorReport(err, { tags: { source: 'job', job: name } }));
      } finally {
        running = false;
      }
    };
    const t = setInterval(run, ms);
    t.unref();
    timers.push(t);
  };
  every(60_000, 'expire unpaid orders', () => deps.orders.expireUnpaid());
  every(6 * 3_600_000, 'clean up', async () => deps.log.info(await cleanUp(deps.db, deps.files), 'cleaned up'));
  return () => timers.forEach(clearInterval);
}
