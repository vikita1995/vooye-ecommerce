# Vooye — multi-vendor commerce starter

A consolidated Next.js App Router + TypeScript + Prisma/PostgreSQL starter for Vooye (mirrors, home décor, and future product categories).

## Included
- Customer storefront, category/search filtering, cart, account/order-history UI
- Seller portal UI for onboarding/profile, listing products, stock/price editing, order fulfilment views
- Admin portal UI for seller approvals, catalog moderation and order oversight
- Prisma data model for customers, sellers, seller applications, products, orders, order items, payment events
- Razorpay-only payment policy (no COD path); server-side order/payment API patterns and webhook signature verification
- Docker/Cloud Run configuration, GitHub Actions CI/CD with Workload Identity Federation placeholders
- Seed data, environment template, release checklist and tests

## Seller portal separation

The seller portal should become an independently built and deployed application while staying in this repository. See [Seller Portal Architecture](../docs/SELLER_PORTAL_ARCHITECTURE.md) for repository findings, authentication/data-contract blockers, and the staged rollout plan. The current `/seller` route is not yet a standalone portal; do not deploy a second copy of the storefront and treat it as the seller app.

## Important launch status

This is a **production-oriented starter, not a verified live production deployment**. It cannot be declared ready for real customers until you configure real Firebase/Supabase/Razorpay/GCP values, run migrations, validate the Razorpay webhook and end-to-end checkout in test mode, complete legal/tax/shipping/refund policies, and run the release checklist. Never commit `.env` or service-account keys.

## Requirements
- Node.js 22+
- PostgreSQL (Supabase is supported)
- Firebase Authentication project (Google sign-in example; server verifies Firebase ID tokens)
- Razorpay account (test keys first)
- GCP project with Artifact Registry, Cloud Run and GitHub Workload Identity Federation configured

## Local setup
```bash
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```
Open http://localhost:3000.

The UI has demo catalogue data so you can explore before provider credentials are set. APIs that require provider credentials fail closed. Payments are Razorpay-only; checkout must not create an order marked paid merely because the browser returns success.

## Deploy
1. Configure repository Actions variables/secrets as described in `docs/DEPLOYMENT.md`.
2. Set Cloud Run runtime secrets from Secret Manager (do not put secret values in GitHub vars).
3. Create the Supabase database and apply migrations as a controlled release job.
4. Test customer and seller journeys in staging with Razorpay test mode.
5. Promote to live keys only after webhook, refund, inventory, monitoring, and rollback tests pass.

## Roles
- `CUSTOMER`: browse, checkout, view own orders
- `SELLER`: manage only their own seller profile/products/orders
- `ADMIN`: approve sellers, moderate catalog, oversee orders

Role enforcement must happen server-side for every protected route; hiding a button is not authorization.
