/* Create (or reset) a studio admin login:
     pnpm --filter @store/api admin:create owner@studio.in "Owner Name" [OWNER|STAFF]
   The password comes from ADMIN_PASSWORD, or a random one is printed once. */
import { hashPassword, randomCode } from '../src/lib/crypto.ts';
import { createPrisma } from '../src/lib/prisma.ts';

const [email, name, role = 'OWNER'] = process.argv.slice(2);
if (!email || !name || !['OWNER', 'STAFF'].includes(role)) {
  console.error('usage: admin:create <email> "<name>" [OWNER|STAFF]');
  process.exit(1);
}
const password = process.env.ADMIN_PASSWORD ?? `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`;
if (password.length < 10) {
  console.error('ADMIN_PASSWORD must be at least 10 characters');
  process.exit(1);
}
const db = createPrisma(process.env.DATABASE_URL!);
const data = { name, role: role as 'OWNER' | 'STAFF', passwordHash: await hashPassword(password), active: true, failedLogins: 0, lockedUntil: null };
const a = await db.adminUser.upsert({ where: { email: email.toLowerCase() }, create: { email: email.toLowerCase(), ...data }, update: data });
console.log(`${a.role} ${a.email} is ready.${process.env.ADMIN_PASSWORD ? '' : ` Password (shown once): ${password}`}`);
await db.$disconnect();
