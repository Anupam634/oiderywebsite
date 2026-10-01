# Embroidery store platform

The production code for the store (placeholder brand **Taanka**). The look and flows come from the
approved design preview in `../design`; this repo is the real app.

| Part | Path | Stack |
| --- | --- | --- |
| Storefront | `apps/web` | Next.js 16 (App Router), React 19, TypeScript, plain CSS |
| API | `apps/api` | Node.js, Fastify 5, Zod, Prisma 7, PostgreSQL |
| Shared rules | `packages/shared` | catalogue filters, pricing, coupons, checkout validation, studio pricing |
| Stitch engine | `packages/stitch` | turns a logo, motif or name into thread colours and renders it on real garment photos |

Money is always integer **paise**. The browser shows an instant estimate, but the API's
`POST /v1/cart/price` is the price we charge (it re-checks stock, names, coupons and studio pieces).

## Run it locally

Needs Node 20.9+ and pnpm (`corepack enable`).

```sh
pnpm install
pnpm db:start              # local Postgres on :54329 (keep this running)
pnpm db:migrate && pnpm db:seed
pnpm dev                   # API on :4000 (docs at /docs), web on :3000
```

Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local` first.

## Checks

```sh
pnpm typecheck
pnpm test                  # API tests start their own throwaway Postgres
pnpm build
```

Browser journeys (headless Chrome) live in `../.tooling/node`: `reactflow.js`, `checkoutflow.js`, `studioflow.js`.

## Pages

- `/` home: offers, categories, product rails
- `/shop/<category>/<sub>?type=&price=&occ=&fam=&rating=&sort=&q=` listing with filters
- `/p/<slug>` product: gallery, zoom, live name preview, reviews
- `/studio?g=<garment>&s=<sample>&how=upload|motif|name` design studio
- `/checkout` server-priced summary, coupons, address, delivery speed, payment method

## Phases

1. **Storefront + catalogue API** (done): home, shop, product, bag, wishlist, studio, checkout up to payment.
2. Phone OTP login, saved addresses, orders, Razorpay (test mode), COD, GST invoice.
3. Admin panel: products, photos, stock, orders, coupons, studio prices.
4. Studio orders: store uploaded logos, proof approval, PES files for the Brother machine.
5. Hosting, backups, monitoring, security review.

Not yet real: payment and order creation (phase 2), uploaded logo files are only kept in the
browser (phase 4), delivery dates use demo pincode zones, garment photos are Unsplash demos.
