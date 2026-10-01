# Going live

This guide takes the store from a laptop to a real shop. Nothing here is switched on automatically: every
outside service needs an account in the studio's own name.

## What runs where

| Part | What it is | Recommended home |
| --- | --- | --- |
| Storefront + admin | `apps/web` (Next.js) | **Vercel Pro** (commercial use needs Pro), or the Docker image |
| API | `apps/api` (Node + Python for machine files) | **Railway** or **Render** from `apps/api/Dockerfile`, or a VPS |
| Database | PostgreSQL 15+ | Railway Postgres / Neon / Render Postgres (with daily backups) |
| Files | logos, pet photos, proofs, invoices, product photos | **Cloudflare R2** (S3-compatible) |
| Login codes | SMS one-time passwords | **Twilio Verify** (fastest to start) or **MSG91** (cheaper, needs DLT) |
| Payments | UPI, cards, net banking, wallets | **Razorpay** |
| Email | order confirmations, invoices | **Resend** |
| WhatsApp | proofs, shipping updates | **Meta WhatsApp Cloud API** |

The browser only ever talks to the storefront domain; the storefront forwards `/api/*` to the API. The API
needs its own public address only for Razorpay webhooks (`https://api.<domain>/v1/webhooks/razorpay`).

Two ways to host:

- **A. Managed (recommended):** web on Vercel, API + database on Railway, files on R2. Little to maintain.
- **B. One server:** a VPS (2 GB RAM or more) running `deploy/docker-compose.yml` (PostgreSQL, API, web and
  Caddy for automatic HTTPS). Cheapest; you look after updates and backups (`scripts/backup-db.sh`).

## Accounts to create (in the business's name)

1. **Domain** (e.g. from Cloudflare, Namecheap or GoDaddy).
2. **Razorpay**: sign up, finish KYC (PAN, bank account, GST if registered). Activation checks the website
   for these pages, which already exist: Terms (`/policies/terms`), Privacy (`/policies/privacy`),
   Refunds and cancellations (`/policies/refunds`), Shipping (`/policies/shipping`), Contact (`/contact`).
3. **Twilio** (Verify service) or **MSG91** (register the business, sender ID and OTP template on a DLT
   portal first; this takes a few days).
4. **Meta Business** + **WhatsApp Business Platform**: verify the business, add a phone number, and get these
   templates approved with exactly these names and texts (from `apps/api/src/modules/notify/messages.ts`):
   `order_confirmed`, `stitch_proof_ready` (with a URL button `https://<domain>/proof/{{1}}`),
   `order_shipped`, `order_delivered`, `order_cancelled`, `refund_processed`, `new_order_alert`, `proof_answered`.
   Until they're approved, keep `WHATSAPP_PROVIDER=outbox` (emails still go out).
5. **Resend**: add and verify the sending domain (SPF and DKIM records in DNS).
6. **Cloudflare R2**: a private bucket (e.g. `shop-private`) and, optionally, a public bucket for product
   photos (e.g. `shop-media`) with a custom domain like `media.<domain>`. **Never make the private bucket public**:
   it holds customer logos, photos and invoices.
7. **Hosting**: Vercel (Pro) and Railway, or a VPS.

## Step by step (option A)

1. **Database**: create PostgreSQL on Railway (or Neon). Copy its connection string.
2. **API on Railway**: new service from this repository, Dockerfile `apps/api/Dockerfile`, build context the
   repository root. Set the environment from `apps/api/.env.example`, at least:
   - `NODE_ENV=production`, `DATABASE_URL`, `APP_URL=https://<domain>`, `WEB_ORIGIN=https://<domain>`
   - `PROXY_KEY` and `FILE_SIGNING_SECRET`: two different long random strings (`openssl rand -hex 32`)
   - `TRUST_PROXY=1`, `WEB_REVALIDATE_URL=https://<domain>/api/revalidate`
   - `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` for the first owner login (remove the password after the first start)
   - providers: `OTP_PROVIDER`, `PAYMENTS_PROVIDER`, `EMAIL_PROVIDER`, `WHATSAPP_PROVIDER`, `STORAGE=s3` and their keys
   Migrations run automatically on start. Add the custom domain `api.<domain>` and check `https://api.<domain>/health`.
3. **Catalogue**: either add products in the admin, or load the demo catalogue once for a preview server:
   `node dist/seed.js` in the API service's shell (it refuses to run on a shop that already has orders).
4. **Storefront on Vercel**: import the repository, root directory `apps/web`, framework Next.js.
   Install command `pnpm install`, build command `cd ../.. && pnpm turbo run build --filter=@store/web`.
   Environment: `API_URL=https://api.<domain>`, `PROXY_KEY` (same as the API), `NEXT_PUBLIC_SITE_URL=https://<domain>`,
   `NEXT_PUBLIC_INDEXABLE=0` until launch. Add the domain.
5. **Razorpay**: start with **test keys** (`PAYMENTS_PROVIDER=razorpay`, test key id/secret). Add the webhook
   `https://api.<domain>/v1/webhooks/razorpay` with events `payment.authorized`, `payment.captured`,
   `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`, and put its secret in
   `RAZORPAY_WEBHOOK_SECRET`. Place a few test orders (UPI, card, a failure, a refund). Switch to live keys
   after activation.
6. **Store settings**: log in at `https://<domain>/admin` → Settings: legal name, address, GSTIN, state,
   grievance officer, invoice prefix. Change the bootstrap password (Settings → My password) and add staff.
7. **Before launch** (see the checklist below), then set `NEXT_PUBLIC_INDEXABLE=1`, redeploy the storefront and
   submit `https://<domain>/sitemap.xml` in Google Search Console.

## Option B: one server

```sh
git clone <repo> /srv/store && cd /srv/store
cp deploy/.env.example deploy/.env    # fill in DOMAIN, secrets and provider keys
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

Point `<domain>`, `www.<domain>` and `api.<domain>` (A records) at the server first: Caddy fetches HTTPS
certificates automatically. Files stay on the server (`STORAGE=local`, in a Docker volume) unless you set R2.
Back up nightly with `scripts/backup-db.sh` from cron, and copy backups off the server (R2 or similar).

## Before launch: checklist

- [ ] Real brand name and logo (`packages/shared/src/brand.ts`, `apps/web/src/components/icons.tsx` `Logo`, favicon, OG image)
- [ ] Real product photos replace the demo (Unsplash) photos; garment photos in the studio replaced or credited
- [ ] Demo reviews removed (Admin → Reviews → "Remove demo reviews"); ratings recounted from real reviews
- [ ] Every product checked: price, MRP, stock, HSN code and GST rate **confirmed by your CA**
- [ ] Store settings filled in (GSTIN, address, grievance officer); a test invoice looks right
- [ ] Policies reviewed by a lawyer (they're marked as drafts on the pages until you remove that line)
- [ ] Machine test: a PES from the admin (Order → Machine files) stitched on the Brother machine
- [ ] Razorpay live keys and webhook secret; a ₹1 live order placed and refunded
- [ ] SMS code arrives on Jio, Airtel and Vi numbers
- [ ] WhatsApp templates approved; emails land in the inbox (not spam)
- [ ] Uptime monitor on `https://<domain>` and `https://api.<domain>/health` (UptimeRobot or Better Stack, free tiers)
- [ ] Database backups on (provider backups or `scripts/backup-db.sh`), and one restore tested
- [ ] Two-factor login on every account above (hosting, email, Razorpay, domain, Meta)

## Running it day to day

- Orders, proofs, machine files, shipping and refunds: `/admin`.
- Unpaid online orders cancel themselves after 30 minutes and give their stock back.
- Logs: Railway/Vercel dashboards (or `docker compose logs -f api`).
- Updating: push to the main branch (CI runs typecheck, tests and build); Railway and Vercel redeploy.
  Database changes ship as Prisma migrations and run on start.
- Costs (rough, check current prices): Vercel Pro about $20/month, Railway about $5–20/month at this size,
  R2 and Resend free tiers to start, Razorpay about 2% per payment, SMS a few paise to a few rupees per code
  depending on provider, WhatsApp per-message charges from Meta.
