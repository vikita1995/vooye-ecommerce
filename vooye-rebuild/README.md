# Vooye Commerce — clean rebuild

A new, separate Next.js app for Vooye (mirrors and home décor). It does not overwrite the existing `vooye-marketplace/` app.

## Included
- Responsive storefront, search/category filtering, product details, client cart and checkout form
- PostgreSQL data model via Prisma; database-backed products and orders
- Firebase ID-token verification on server routes
- Server-side price/stock calculation and transactional stock reservation
- Razorpay-only checkout with server-side order creation, signature verification and webhook reconciliation
- Admin product/order APIs protected by `ADMIN_UIDS` allow-list
- Rate-limit helper, validation, security headers, seed script, Dockerfile, CI workflow and setup docs

## Important status
This is a **deployable foundation**, not a claim that live commerce is production-certified. Before taking real orders, configure providers, run migrations and tests, verify Firebase/Supabase/Cloud Run IAM, configure a valid return/refund policy and GST/shipping, and execute the release checklist. Razorpay order creation, browser signature verification and webhook reconciliation are scaffolded; they require provider credentials, test-mode validation, reconciliation alerts and review before considering live payments ready. Never put secrets in source control.

## Quick start
Requirements: Node.js 22+, a Supabase PostgreSQL project, Firebase project, Razorpay account (test mode first), npm.

```bash
cp .env.example .env
npm install
npx prisma generate
npm run db:deploy
npm run db:seed
npm run dev
```
Open http://localhost:3000. Use the product seed to browse. Authentication actions require Firebase config; checkout requires a signed-in Firebase user, Razorpay test keys and a confirmed shipping fee. Shipping is manual during the initial pilot; Shiprocket is the recommended aggregator to evaluate, subject to written confirmation that the chosen courier accepts glass mirrors and provides appropriate damage protection. Delhivery Direct currently lists fragile items including glass/mirrors as restricted, so do not use that service for Vooye mirrors without a separate written approval. Admins can save a carrier, tracking number and tracking URL for each order. This rebuild is configured for Razorpay only. Checkout remains unavailable until Razorpay test keys, webhook secret, Firebase authentication and a confirmed `SHIPPING_FLAT_FEE_PAISE` are configured. Supabase PostgreSQL uses `DATABASE_URL` for pooled runtime connections and `DIRECT_URL` for Prisma migrations.

## Deploy to Cloud Run
Build with `docker build -t vooye .` and configure Cloud Run with `DATABASE_URL`, Firebase Admin configuration through workload identity/application credentials, and optional Razorpay secrets through Secret Manager. Do not run schema migrations inside every app instance; run `npx prisma migrate deploy` as a controlled release job. See `docs/DEPLOYMENT.md`.

## Repository layout
- `app/` pages and API routes
- `components/` storefront UI
- `lib/` auth, database, validation, payments, services
- `prisma/` schema and seed
- `tests/` unit tests
- `docs/` setup and production checklist
