# P0 remediation: Supabase as the commerce source of truth

## Decision

The production Supabase project is the authoritative store for customer, product, seller, order, order-item, payment-transaction, and product-image records. Do not introduce a second set of business tables in Prisma or blindly apply Prisma migrations to production.

## Verified production baseline (2026-10-25)

Read-only inspection of project `vooye-prod` (ref `cpoitylvklkcrclsaxem`) returned:

| Public table | Rows |
|---|---:|
| customers | 8 |
| products | 2 |
| orders | 0 |
| order_items | 0 |
| payment_transactions | 0 |
| seller_profiles | 1 |
| product_images | 2 |

The public schema does not contain the Prisma-style `User`, `Product`, `Order`, or `PaymentEvent` tables referenced by current checkout/payment code. This establishes a schema mismatch. Cloud Run's effective `DATABASE_URL` must still be verified without revealing its value to establish whether it targets this same database.

## Safety rule

Checkout must remain disabled until all of the following have been completed and reviewed:

1. Server-side order creation uses the existing Supabase commerce schema.
2. Inventory reservation and release are atomic, concurrency-safe, and idempotent.
3. Razorpay order IDs and payment IDs are persisted in `payment_transactions`.
4. Client verification and webhook processing validate provider order, payment status, amount, currency, ownership, and event idempotency.
5. Customer order history and admin orders read the same canonical records.
6. Expiry, late capture, and payment reconciliation have tested operational handling.
7. Staging integration tests pass.

A new explicit environment gate, `SUPABASE_COMMERCE_CHECKOUT_READY=true`, is required in addition to the existing flags. It is deliberately absent from the production deployment workflow and must not be enabled during this remediation.

## Required implementation sequence

1. Inspect effective Cloud Run database connection target metadata (never log or share credentials) and verify whether it matches the production Supabase project.
2. Implement reviewed Supabase SQL functions/RPCs for atomic order creation, stock reservation/release, and payment-state transitions. Prepare migration files in the repository only; do not run them against production in this work.
3. Refactor checkout, verification, webhook, expiry, and customer order-history routes to use the canonical Supabase records and the new RPCs.
4. Refactor or remove Prisma commerce-model dependencies from the active request paths only after parity tests cover every replaced behavior. Keep Prisma only for any clearly documented remaining use; do not run its current initial/schema migrations against production.
5. Add unit and integration tests for successful and failed payments, invalid signatures, duplicate/out-of-order webhooks, amount/currency mismatch, concurrent stock claims, expiry, and late captures.
6. Run CI and review the PR. Deployment and any database migration require a separate explicit release approval.

## Data preservation

No production rows were modified during this inspection. Do not drop tables, truncate records, rewrite customer IDs, or run `prisma migrate deploy` against production as part of this remediation. Before any future migration, take a verified backup and review the exact SQL and rollback plan.
