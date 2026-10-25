# Checkout Release Safety Gate

## Current decision

**Keep checkout disabled.** This repository is not ready for a production checkout release until the Supabase-backed order/payment path is integrated and verified end-to-end.

This document is a release checklist only. It does not apply database migrations, change production configuration, or enable checkout.

## Verified blockers

- The Supabase migrations `20261025100000_atomic_checkout_order_persistence.sql` and `20261025120000_atomic_payment_lifecycle.sql` exist in the repository, but they must not be assumed to exist in the live database. Verify migration history and deployed function definitions before any release.
- The current Razorpay verify and webhook routes still use Prisma order/payment-event models. The pending-order expiry route also uses Prisma. These routes are not yet wired to the Supabase RPCs introduced by the two migrations.
- Customer order-history code has both a Supabase-backed route and a legacy Prisma-backed commerce-orders route. Confirm which endpoint the storefront actually calls and avoid presenting two different order sources as if they were consistent.
- The repository's checkout readiness gate requires explicit release flags plus server/provider configuration. Keep the flags closed until the end-to-end checks below pass.
- The current live commerce database has existing customer, seller, product, and image rows. Preserve them; do not reset tables or use destructive migrations as a shortcut.

## Required implementation before enabling checkout

- [ ] Integrate checkout-order creation with `create_checkout_order`, and attach the Razorpay provider order using `attach_razorpay_order`.
- [ ] Integrate both browser verification and the Razorpay webhook with the same idempotent payment-event processor. Verify Razorpay signatures on webhooks and confirm captured amount/currency against the stored order.
- [ ] Ensure late captures, duplicate events, payment failures, and unknown provider orders are recorded for reconciliation without accidentally confirming or cancelling the wrong order.
- [ ] Move expiry handling to the Supabase expiry RPC (or prove an equivalent single-source implementation), with authenticated scheduling and observable failures.
- [ ] Ensure invoice issuance happens only after a confirmed captured payment, and that invoice retries are idempotent.
- [ ] Align customer order history and seller/admin views with the same canonical order source.
- [ ] Add automated tests for duplicate webhook delivery, browser/webhook races, amount/currency mismatch, late capture after expiry, stock reservation, exactly-once stock release, and expiry retries.
- [ ] Verify that every service-role RPC is called only from trusted server code and that no service-role key reaches client bundles.
- [ ] Confirm stock, order, and payment state consistency using a staging/test project before release.

## Release sequence

1. Review and merge application changes through a pull request; do not deploy directly from an unreviewed branch.
2. Back up/confirm recovery procedures for the live database and inspect the exact migration diff.
3. Apply the migrations only during an explicitly approved release, then verify the expected functions and grants exist.
4. Run staging tests using Razorpay test mode and test customer/product records.
5. Verify the checkout gate is still closed in production.
6. Enable checkout only after explicit approval and a documented rollback plan.

## Operational notes

- Never put credentials, API keys, webhook secrets, or service-role keys in issues, pull requests, logs, or chat.
- Do not delete or rewrite existing customer/product/seller data as part of this work.
- A successful application deployment does not prove that Supabase migrations were applied.
