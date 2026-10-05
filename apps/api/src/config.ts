import { z } from 'zod';
import { parseDsn } from './lib/monitor.ts';

const bool = z.enum(['0', '1', 'true', 'false']).transform((v) => v === '1' || v === 'true');
const optional = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  /** comma-separated origins allowed by CORS (the web app normally calls through its own /api proxy) */
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /** public address of the storefront, used in emails, WhatsApp messages and invoices */
  APP_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** seconds the in-memory catalogue cache is trusted */
  CATALOG_CACHE_SECONDS: z.coerce.number().int().min(0).default(30),

  /* ---- requests and sessions ---- */
  /** how many proxies in front of the API to trust for the client address (0 = none) */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** shared secret: the web app's /api proxy sends it with the shopper's address (x-client-ip) */
  PROXY_KEY: optional,
  /** the storefront's cache-refresh hook (POST, with PROXY_KEY), called after catalogue edits */
  WEB_REVALIDATE_URL: optional,
  /** secure cookies (on by default in production) */
  COOKIE_SECURE: bool.optional(),
  SESSION_DAYS: z.coerce.number().int().min(1).default(60),
  ADMIN_SESSION_HOURS: z.coerce.number().int().min(1).default(12),
  /** signs private file links (customer logos, proofs, invoices) */
  FILE_SIGNING_SECRET: z.string().min(16).default('dev-only-file-signing-secret'),

  /* ---- one-time passwords ---- */
  OTP_PROVIDER: z.enum(['dev', 'twilio', 'msg91']).default('dev'),
  /** login codes one network (IP address) may ask for per hour, against abuse */
  OTP_IP_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(20),
  /** dev provider only: always use this code (handy for tests and demos) */
  OTP_DEV_CODE: optional,
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_VERIFY_SERVICE_SID: optional,
  MSG91_AUTH_KEY: optional,
  MSG91_OTP_TEMPLATE_ID: optional,

  /* ---- payments ---- */
  PAYMENTS_PROVIDER: z.enum(['fake', 'razorpay']).default('fake'),
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
  PENDING_ORDER_MINUTES: z.coerce.number().int().min(5).default(30),
  /** minutes after checkout to remind a shopper who hasn't paid yet (once; 0 = never) */
  PAYMENT_REMINDER_MINUTES: z.coerce.number().int().min(0).default(10),

  /* ---- messages ---- */
  EMAIL_PROVIDER: z.enum(['outbox', 'resend']).default('outbox'),
  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default('Zulyf <orders@zulyf.com>'),
  /** where new-order alerts go */
  OWNER_EMAIL: optional,
  WHATSAPP_PROVIDER: z.enum(['outbox', 'meta']).default('outbox'),
  META_WA_TOKEN: optional,
  META_WA_PHONE_NUMBER_ID: optional,
  /** language code of the approved WhatsApp templates */
  META_WA_TEMPLATE_LANG: z.string().default('en'),
  OWNER_WHATSAPP: optional,
  /** dev outbox: emails and WhatsApp messages are written here instead of being sent */
  OUTBOX_DIR: z.string().default('.data/outbox'),

  /* ---- files ---- */
  STORAGE: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('.data/uploads'),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  /** public base URL for public files (product photos), e.g. an R2 custom domain */
  S3_PUBLIC_URL: optional,

  /** a second, public bucket for product photos (R2 public access is per bucket); private files stay in S3_BUCKET */
  S3_PUBLIC_BUCKET: optional,

  /* ---- first start on a new server: creates the owner login if there is none yet ---- */
  ADMIN_BOOTSTRAP_EMAIL: optional,
  ADMIN_BOOTSTRAP_PASSWORD: optional,

  /* ---- stitch files ---- */
  PYTHON_BIN: z.string().default('python3'),
  /** extra Python path where pyembroidery is installed (pip install --target .data/pylib -r tools/requirements.txt) */
  STITCH_PYTHONPATH: z.string().default('.data/pylib'),

  /* ---- error reporting ---- */
  /** Sentry or GlitchTip project DSN; errors go to the logs only when empty */
  SENTRY_DSN: optional,
  /** e.g. production or staging (defaults to NODE_ENV) */
  SENTRY_ENVIRONMENT: optional,
  /** the deployed version (defaults to the commit Railway or Render built) */
  RELEASE: optional,
  RAILWAY_GIT_COMMIT_SHA: optional,
  RENDER_GIT_COMMIT: optional,

  /* ---- safety switches for staging/demo servers ---- */
  ALLOW_FAKE_PAYMENTS: bool.default(false),
  ALLOW_DEV_OTP: bool.default(false),
});

export type Config = z.infer<typeof schema> & { cookieSecure: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const c = parsed.data;
  const problems: string[] = [];
  if (c.PAYMENTS_PROVIDER === 'razorpay' && !(c.RAZORPAY_KEY_ID && c.RAZORPAY_KEY_SECRET)) problems.push('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are needed for Razorpay');
  if (c.OTP_PROVIDER === 'twilio' && !(c.TWILIO_ACCOUNT_SID && c.TWILIO_AUTH_TOKEN && c.TWILIO_VERIFY_SERVICE_SID)) problems.push('Twilio Verify needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID');
  if (c.OTP_PROVIDER === 'msg91' && !(c.MSG91_AUTH_KEY && c.MSG91_OTP_TEMPLATE_ID)) problems.push('MSG91 needs MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID');
  if (c.EMAIL_PROVIDER === 'resend' && !c.RESEND_API_KEY) problems.push('RESEND_API_KEY is needed for Resend');
  if (c.WHATSAPP_PROVIDER === 'meta' && !(c.META_WA_TOKEN && c.META_WA_PHONE_NUMBER_ID)) problems.push('META_WA_TOKEN and META_WA_PHONE_NUMBER_ID are needed for WhatsApp');
  if (c.STORAGE === 's3' && !(c.S3_ENDPOINT && c.S3_BUCKET && c.S3_ACCESS_KEY_ID && c.S3_SECRET_ACCESS_KEY)) problems.push('S3 storage needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY');
  if (c.S3_PUBLIC_URL && !c.S3_PUBLIC_BUCKET) problems.push('S3_PUBLIC_URL needs S3_PUBLIC_BUCKET (keep private files out of a public bucket)');
  if (c.SENTRY_DSN && !parseDsn(c.SENTRY_DSN)) problems.push('SENTRY_DSN is not a valid DSN (https://<key>@<host>/<project>)');
  if (c.NODE_ENV === 'production') {
    // a real shop must never run on test switches by accident; staging servers opt in explicitly
    if (c.PAYMENTS_PROVIDER === 'fake' && !c.ALLOW_FAKE_PAYMENTS) problems.push('PAYMENTS_PROVIDER=fake is not allowed in production (set ALLOW_FAKE_PAYMENTS=1 for a demo server)');
    if (c.OTP_PROVIDER === 'dev' && !c.ALLOW_DEV_OTP) problems.push('OTP_PROVIDER=dev is not allowed in production (set ALLOW_DEV_OTP=1 for a demo server)');
    if (c.FILE_SIGNING_SECRET.startsWith('dev-only')) problems.push('set FILE_SIGNING_SECRET to a long random string');
    if (c.PAYMENTS_PROVIDER === 'razorpay' && !c.RAZORPAY_WEBHOOK_SECRET) problems.push('RAZORPAY_WEBHOOK_SECRET is needed in production');
  }
  if (problems.length) throw new Error(`Invalid environment: ${problems.join('; ')}`);
  return { ...c, cookieSecure: c.COOKIE_SECURE ?? c.NODE_ENV === 'production' };
}
