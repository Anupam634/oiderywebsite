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
   `order_shipped`, `order_delivered`, `order_cancelled`, `refund_processed`, `new_order_alert`, `proof_answered`,
   `return_requested`, `return_approved`, `return_rejected`, `exchange_shipped`, `return_request_alert`.
   Until they're approved, keep `WHATSAPP_PROVIDER=outbox` (emails still go out).
5. **Resend**: add and verify the sending domain (SPF and DKIM records in DNS).
6. **Cloudflare R2**: a private bucket (e.g. `shop-private`) and, optionally, a public bucket for product
   photos (e.g. `shop-media`) with a custom domain like `media.<domain>`. **Never make the private bucket public**:
   it holds customer logos, photos and invoices.
7. **Hosting**: Vercel (Pro) and Railway, or a VPS.

## Step by step (option A)

Keep everything in one part of the world: the storefront's server code runs in **Singapore** (`sin1`, set in
`apps/web/vercel.json`), so create the Railway project (database and API) in its **Southeast Asia (Singapore)**
region too. Every page asks the API for data; across oceans that adds up.

1. **Database**: create PostgreSQL on Railway (or Neon, Singapore region). Copy its connection string.
2. **API on Railway**: new service from this repository. In the service settings set the config file path to
   `/apps/api/railway.json` (it builds `apps/api/Dockerfile` from the repository root, checks `/health` before
   switching traffic, restarts on crashes and only redeploys when API code changes). Set the environment from
   `apps/api/.env.example`, at least:
   - `NODE_ENV=production`, `DATABASE_URL`, `APP_URL=https://<domain>`, `WEB_ORIGIN=https://<domain>`
   - `PROXY_KEY` and `FILE_SIGNING_SECRET`: two different long random strings (`openssl rand -hex 32`)
   - `TRUST_PROXY=1`, `WEB_REVALIDATE_URL=https://<domain>/api/revalidate`
   - `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` for the first owner login (remove the password after the first start)
   - providers: `OTP_PROVIDER`, `PAYMENTS_PROVIDER`, `EMAIL_PROVIDER`, `WHATSAPP_PROVIDER`, `STORAGE=s3` and their keys
   - `SENTRY_DSN` for error reports (see "Errors and uptime" below)
   Migrations run automatically on start. Add the custom domain `api.<domain>` and check `https://api.<domain>/health`.
3. **Catalogue**: either add products in the admin, or load the demo catalogue once for a preview server:
   `node dist/seed.js` in the API service's shell (it refuses to run on a shop that already has orders).
4. **Storefront on Vercel**: import the repository, root directory `apps/web` (its `vercel.json` sets the
   framework, the install and build commands and the Singapore region).
   Environment: `API_URL=https://api.<domain>`, `PROXY_KEY` (same as the API), `NEXT_PUBLIC_SITE_URL=https://<domain>`,
   `NEXT_PUBLIC_INDEXABLE=0` until launch. If product photos live on a public R2 bucket (`S3_PUBLIC_URL`), also set
   `NEXT_PUBLIC_IMAGE_HOSTS=media.<domain>` so the storefront can resize them. For analytics, set
   `NEXT_PUBLIC_META_PIXEL_ID` and/or `NEXT_PUBLIC_GA_ID` (see "Analytics" below). Add the domain.
   Uploads pass through the storefront, and Vercel caps a request at 4.5 MB: the shop resizes photos in the
   browser to stay under 4 MB, so phone photos of any size work; a machine file over 4 MB is refused politely.
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
Photos are resized and converted to AVIF/WebP by the storefront on first view and kept in the `webcache` volume
(a photo replaced at the same address shows its old version for up to a week, so upload replacements as new files).
Back up nightly with `scripts/backup-db.sh` from cron, and copy backups off the server (R2 or similar).

## Errors and uptime

- **Error reports**: create a project in **Sentry** (free tier) or **GlitchTip** (Sentry-compatible, free tier or
  self-hosted) and put its DSN in the API's `SENTRY_DSN`. Errors from the API, its background jobs, the storefront
  server and shoppers' browsers all arrive there (browser and storefront errors travel through the API's
  `/v1/client-errors`). Reports carry the route pattern only (e.g. `/proof/[token]`), never request bodies,
  cookies or secret links. Without a DSN everything still goes to the Railway/Vercel logs.
- **Uptime**: one monitor on `https://<domain>/api/health` checks the whole chain (storefront → API → database).
  UptimeRobot or Better Stack (free tiers), alerting by email and WhatsApp/SMS.

## Analytics

Both are optional and switched off until their IDs are set on the storefront (then redeploy, they're read at build
time). The privacy policy page mentions whichever is on.

- **Meta Pixel** (to measure Instagram and Facebook posts and ads): Meta Events Manager → Data sources → add a
  Pixel → `NEXT_PUBLIC_META_PIXEL_ID`. Events sent: `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`,
  `Purchase` (with the order number as event id). Check them with Events Manager → Test events.
- **Google Analytics 4**: create a property and a web data stream → `NEXT_PUBLIC_GA_ID` (`G-…`). Events: `page_view`,
  `view_item`, `add_to_cart`, `begin_checkout`, `purchase`. In the data stream's **Enhanced measurement → Page views
  → Advanced**, turn off "Page changes based on browser history events" (the shop sends its own page views;
  leaving it on counts pages twice). Check with Admin → DebugView.
- Account, order, proof, login and admin pages are never reported, and automatic Google events on them are
  labelled `/private`.

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
- [ ] Uptime monitor on `https://<domain>/api/health` (UptimeRobot or Better Stack, free tiers)
- [ ] `SENTRY_DSN` set, and a test error seen in Sentry/GlitchTip
- [ ] Meta Pixel and GA4 IDs set (if wanted); a test order shows up as a Purchase in both
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
