# Embroidery store platform

The production code for the store (placeholder brand **Taanka**): a colourful, shop-first storefront, a
studio admin, and an API that takes orders, payments, stitch proofs and machine files.

| Part | Path | Stack |
| --- | --- | --- |
| Storefront + admin | `apps/web` | Next.js 16 (App Router), React 19, TypeScript, plain CSS |
| API | `apps/api` | Node.js, Fastify 5, Zod, Prisma 7, PostgreSQL; Python + pyembroidery for machine files |
| Shared rules | `packages/shared` | catalogue filters, pricing, coupons, GST maths, checkout validation, studio pricing, API types |
| Stitch engine | `packages/stitch` | turns a logo, motif or name into thread colours and renders it on real garment photos |

Money is always integer **paise**. The browser shows instant estimates; the API's prices are the ones charged.

## What it does

- **Shop:** home, listings with filters, product pages with a live stitched preview of the customer's name,
  design studio (upload a logo or pick a motif + name, see it on real garments), bag, wishlist.
- **Accounts:** login with a mobile number and SMS code, saved addresses, order history, cancel, reviews.
- **Checkout:** server-priced bag, coupons, delivery dates by pincode, UPI / card / net banking / wallet
  through Razorpay, cash on delivery for ready-made pieces, GST invoice details.
- **Orders:** stock reserved at checkout, unpaid orders released after 30 minutes, late payments reinstated
  or refunded, refunds through Razorpay, emails and WhatsApp messages at each step, GST invoice PDFs.
- **Returns & exchanges:** after delivery the customer asks from the order page (pieces, reason, photos,
  another size or a refund; a UPI ID for cash orders). The studio approves (the new size is set aside),
  marks it received (back into stock), then sends the replacement or refunds through Razorpay or by UPI.
  The window, fee and what's offered are in Settings.
- **Made-for-you pieces:** stitch proofs sent from the admin; the customer approves or asks for changes from
  a link; machine files (PES/DST/JEF/EXP) uploaded by the digitizer become a PES for the Brother machine
  with the customer's thread colours, plus a preview and stitch count.
- **Admin (`/admin`):** dashboard, orders, production board, returns, packing slips, products (details, stock,
  photos, personalisation, GST), categories, coupons, reviews, customers, store settings, staff, audit trail.

## Run it locally

Needs Node 20.9+, pnpm (`corepack enable`) and Python 3 (for machine files).

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm db:start                                  # local PostgreSQL on :54329 (keep it running)
pnpm db:migrate && pnpm --filter @store/api generate && pnpm db:seed   # tables, Prisma client, demo catalogue
python3 -m pip install --target apps/api/.data/pylib -r apps/api/tools/requirements.txt
ADMIN_PASSWORD='choose-a-password' pnpm --filter @store/api admin:create you@example.com "Your Name"
pnpm dev                                       # API on :4000 (docs at /docs), web on :3000
```

Local defaults send nothing real: login codes show on screen ("test mode"), payments use a test sheet,
emails and WhatsApp messages are written to `apps/api/.data/outbox/`.

## Fonts and photos

- Fonts are self-hosted and subset (Latin + ₹, Devanagari for Hindi) in `apps/web/src/fonts`; only the body and
  heading fonts are preloaded. To change them, edit and run `apps/web/scripts/build-fonts.py` (needs
  `pip install fonttools brotli`).
- Photos go through Next's image optimizer (AVIF/WebP at the width the layout needs): use `photo()` from
  `apps/web/src/lib/img.ts` with a `sizes` value for every catalogue image.
- The design studio's heavy image maths runs in a web worker (`apps/web/src/lib/stitch.worker.ts`).

## Checks

```sh
pnpm typecheck
pnpm test        # API tests start their own throwaway PostgreSQL
pnpm build
```

Browser journeys (headless Chrome) live in `../.tooling/node`: `reactflow.js` (product + shop),
`studioflow.js` (design studio), `phase2flow.js` (login, checkout, payments, account) and
`adminflow.js` (proof → approval → shipping → delivery, product editing).

## Pages

- Shop: `/`, `/shop/<category>/<sub>?type=&price=&occ=&fam=&rating=&sort=&q=`, `/p/<slug>`,
  `/studio?g=<garment>&s=<sample>&how=upload|motif|name`, `/checkout`
- Account: `/login`, `/account`, `/account/orders/<number>`, `/proof/<token>`
- Info: `/contact`, `/policies/shipping|refunds|terms|privacy`
- Studio: `/admin` and its sections

## Deploying

See [DEPLOY.md](DEPLOY.md): hosting options, the accounts to create, environment settings and the
before-launch checklist. Docker images: `apps/api/Dockerfile`, `apps/web/Dockerfile`; a one-server setup
with automatic HTTPS: `deploy/docker-compose.yml`.
