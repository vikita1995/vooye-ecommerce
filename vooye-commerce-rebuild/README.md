# Vooye Commerce — clean rebuild

A new, separate Next.js app for Vooye (mirrors and home décor). It does not overwrite the existing `vooye-marketplace/` app.

## Included
- Responsive storefront, search/category filtering, product details, client cart and checkout form
- PostgreSQL data model via Prisma; database-backed products and orders
- Firebase ID-token verification on server routes
- Server-side price/stock calculation and transactional stock reservation
- Cash-on-delivery order path, plus Razorpay order creation/verification integration seams
- Admin product/order APIs protected by `ADMIN_UIDS` allow-list
- Rate-limit helper, validation, security headers, seed script, Dockerfile, CI workflow and setup docs

## Important status
This is a **deployable foundation**, not a claim that live commerce is production-certified. Before taking real orders, configure providers, run migrations and tests, verify Firebase/Supabase/Cloud Run IAM, configure a valid return/refund policy and GST/shipping, and execute the release checklist. Razorpay order creation, browser signature verification and webhook reconciliation are scaffolded; they require provider credentials, test-mode validation, reconciliation alerts and review before considering live payments ready. Never put secrets in source control.

## Quick start
Requirements: Node.js 22+, PostgreSQL 15+, npm.

```bash
cp .env.example .env
npm install
npx prisma generate
npm run db:deploy
npm run db:seed
npm run dev
```
Open http://localhost:3000. Use the product seed to browse. Authentication actions require Firebase config; checkout requires a signed-in Firebase user. COD can work without Razorpay; online payments remain unavailable until configured.

## Deploy to Cloud Run
Build with `docker build -t vooye .` and configure Cloud Run with `DATABASE_URL`, Firebase Admin configuration through workload identity/application credentials, and optional Razorpay secrets through Secret Manager. Do not run schema migrations inside every app instance; run `npx prisma migrate deploy` as a controlled release job. See `docs/DEPLOYMENT.md`.

## Repository layout
- `app/` pages and API routes
- `components/` storefront UI
- `lib/` auth, database, validation, payments, services
- `prisma/` schema and seed
- `tests/` unit tests
- `docs/` setup and production checklist
