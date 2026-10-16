# Vooye repository audit — 2026-10-16

Scope: repository code and configuration on `upgrade/prisma-7`, GitHub Actions results, and the connected Supabase project. This is an implementation audit, not a claim of live SMS or live payment testing.

## Changes made on this branch

- Synced tested Firebase sign-in, Firebase ID-token verification/session route, middleware and account/customer pages from `main` into `upgrade/prisma-7` via PR #25. The PR was merged into this branch, not into `main`.
- Added a usable localStorage cart: product pages can add a listing, cart supports quantity changes/removal and survives refresh. It is browser-local and is not an authenticated server cart.
- Changed customer order history to query Prisma `Order` / `OrderItem`, the same source used by Razorpay checkout. Query is scoped to the authenticated Prisma user ID.
- Aligned address type inputs to the live database constraint (`shipping` / `billing`), and added six-digit Indian PIN validation to address create/update endpoints.
- Replaced the admin orders endpoint, which incorrectly contained product-moderation code, with Prisma order listing and constrained fulfilment-state transitions. The endpoint cannot manually mark an order paid/captured.
- Aligned seller/admin browser pages with Firebase Auth, sending Firebase ID tokens to the existing server APIs rather than trying to read a separate Supabase browser session.
- Removed the seller-admin UI call to the nonexistent seller audit-history endpoint. An audit-history feature is not implemented until a backing table and API are added.
- Added the public Razorpay key as a frontend Docker build arg, passed from the GitHub Actions variable `NEXT_PUBLIC_RAZORPAY_KEY_ID`. This is a public identifier, not a secret.
- Hardened the Razorpay order creation endpoint with JSON handling, E.164 phone and Indian PIN validation, server-side price calculation, missing-key fail-closed handling and non-secret errors.
- Enabled CI to run on `upgrade/prisma-7` and added a production build step with CI-only placeholder configuration.

## Validation evidence

Latest observed branch CI runs:
- `Vooye CI` for commit `c34c8bac402bf68376fadbc38de4fb48712aac76`: passed Prisma validate, client generation, lint, typecheck and tests.
- `Vooye CI` for commit `c46425aa91aa2ce23b2c102a3af898a871bbac6f`: passed the build-enabled workflow through the then-current code.
- Later runs for the seller/admin session changes: lint, typecheck and tests passed; the production-build step was still in progress when this report was written.

See [GitHub Actions](https://github.com/vikita1995/vooye-ecommerce/actions) for current status. No browser-driven full checkout, production SMS delivery, live Razorpay transaction, or database restore drill has been performed.

## Supabase inspection

Connected project `vooye-prod` (`cpoitylvklkcrclsaxem`) reported `ACTIVE_HEALTHY`, Postgres 17.11. RLS was enabled for the nine inspected public tables: `customers`, `customer_addresses`, `orders`, `order_items`, `payment_transactions`, `seller_profiles`, `products`, `product_images`, and `user_profiles`.

The direct-client access policies on customer/order/seller tables deny `anon` and `authenticated` access, consistent with server-mediated APIs using the service role. Public SELECT policies exist for approved Supabase products and their images. Do not expose the service-role key to browser code.

Advisors:
- Security warning: Supabase leaked-password protection is disabled. Remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Performance advisor reports duplicate indexes on `seller_profiles` and several unused indexes. Review query patterns before removing indexes; no indexes were dropped during this audit.

## Production blockers — do not enable live checkout yet

1. **No Prisma migration directory was present in the repository tree.** The Prisma schema/config exists, but no `prisma/migrations` files were found. The Supabase REST schema and Prisma schema use different models and naming/status values. Establish one documented source of truth and a reviewed migration baseline before applying schema changes. No production DDL was run during this audit.
2. **Deployment workflow has no Secret Manager bindings and no Prisma migration release step.** The existing deployment guide also calls this out. Confirm the actual existing secret names and service account access before adding `--set-secrets`; do not guess secret resource names or put values in GitHub variables.
3. **No checkout page exists.** The cart intentionally keeps checkout disabled. The cart stores contents in browser localStorage, not server-side, and its price display is not authoritative.
4. **Inventory is not reserved when an order is created.** Current verification/webhook code decrements stock after payment. Concurrent checkouts can therefore charge a customer before inventory conflict is discovered. Add a transactional reservation/expiry/release model and reconciliation/refund handling before accepting real payments.
5. **Payment verification needs stronger provider reconciliation.** The callback verifies the Razorpay signature but does not fetch authoritative payment amount/currency/capture state from Razorpay before marking the order paid. Webhook processing must handle late captures, failed/cancelled events, duplicate/out-of-order events, and payment/order idempotency atomically.
6. **No refund or periodic reconciliation workflow was found.** Add operational alerts and a tested exception/refund process before go-live.
7. **Supabase and Prisma still represent separate product/seller/customer/order datasets.** Storefront/product pages use Prisma `Product` / `Seller`; seller/admin product management and image metadata use Supabase REST tables. This can cause changes to a seller listing not to appear in the Prisma catalogue until the models are reconciled or synced.
8. **Real phone SMS is not verified by CI.** Firebase Phone Auth requires the intended provider, authorized production domain, reCAPTCHA, quota and billing/provider settings. Test a genuine SMS only after confirming those settings; never fake an OTP.
9. **Admin authorization needs an explicit Firebase UID allowlist or trusted role mapping.** The admin API uses `ADMIN_UIDS` and a Supabase `user_profiles.user_id` lookup. Ensure the configured IDs match Firebase UIDs and roles are only set by a trusted process.
10. **Cloud Run runtime configuration not independently verified.** Confirm `DATABASE_URL`, `DIRECT_URL`, Firebase Admin project ID/application-default credentials, Razorpay server secrets, shipping configuration, and runtime service identity. Keep secrets in Secret Manager.

## Recommended go-live sequence

1. Choose and document the authoritative database model. Create/review migrations and apply them in a controlled release, with backup/restore plan.
2. Bind runtime secrets by Secret Manager references and validate them without printing values.
3. Implement a server-backed cart/checkout flow, address selection from saved addresses, delivery serviceability rules, taxes/shipping, inventory reservation, Razorpay order/payment reconciliation, idempotent webhooks, refund, expiry release and support handling.
4. Add integration tests for Firebase identity/session, ownership isolation, OTP delivery and invalid/expired OTPs, addresses, seller approval, duplicate webhook, payment failure/late capture, stock conflict and refunds.
5. Test a real Razorpay test-mode lifecycle and non-production SMS end-to-end. Keep live payments off until the checklist is verified.


## Additional hardening after initial audit
- The Razorpay order-creation API is now fail-closed behind `CHECKOUT_ENABLED=true`; unset/false returns 503 before creating a payment order. The cart UI remains non-checkout-capable.
- Fixed over-escaped E.164 phone and six-digit PIN/OTP regexes in account/phone/address flows. The browser and API must use a single literal backslash in regex source (e.g. `/^\\+[1-9]\\d{7,14}$/` in Markdown code).
- Added a transactional Supabase RPC for seller-status transitions; it writes the status and audit record atomically, with execution denied to `anon` and `authenticated` and granted to `service_role` only.
