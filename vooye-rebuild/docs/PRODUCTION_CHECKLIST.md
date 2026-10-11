# Production readiness checklist

Do not take real payments until every item below is complete and verified.

## Business
- [ ] Confirm business legal name, support email/phone, GST treatment/invoicing, shipping coverage and delivery estimates.
- [ ] Publish complete privacy policy, terms, shipping policy, cancellation/return/refund policy.
- [ ] Confirm real product photos, SKU, dimensions, packaging, prices, stock counts and fragile-goods shipping plan.

## Identity and access
- [ ] Create Firebase project, configure allowed domains and sign-in methods.
- [ ] Set Firebase client config as GitHub/Cloud Run public build variables.
- [ ] Set workload identity/application default credentials for Firebase Admin; do not upload service-account keys when WIF is available.
- [ ] Put only trusted administrator Firebase UIDs in `ADMIN_UIDS`; review access periodically.
- [ ] Configure database networking, least-privileged runtime access, backups, PITR, alerts and a restore drill.

## Commerce
- [ ] Run Prisma migrations in a controlled job and seed only non-production catalog values where intended. For Supabase, set pooled `DATABASE_URL` and direct/session `DIRECT_URL`; verify pooler mode and connection limits.
- [ ] Razorpay is the only supported payment method. Exercise the complete online-payment flow in Razorpay test mode before enabling live customers.
- [ ] Register webhook secret and verify signatures against raw request bytes.
- [ ] Confirm webhook event ID uniqueness, replay handling, amount, currency, order ID and payment status tests before going live.
- [ ] Implement cancellation/refund flows and stock restoration. COD is intentionally not enabled.
- [ ] Pilot shipping is manual. Shiprocket is the recommended aggregator to evaluate because it compares carriers and calculates rates using origin/destination PIN, packed weight and dimensions. Obtain written confirmation from Shiprocket and the specific carrier that glass mirrors are accepted on the intended lane, and verify damage-cover exclusions and claim evidence requirements before first dispatch. See `docs/SHIPPING.md`.
- [ ] Do not use Delhivery Direct for mirrors without written exception: its published terms list fragile items (glass, mirror, frames) as restricted.
- [ ] Use the packed parcel dimensions/weight and destination PIN to obtain a real quote; do not use a guessed fee. Set `SHIPPING_FLAT_FEE_PAISE` only after you decide the customer-facing shipping rule. For automated live rates, integrate the selected aggregator's server API before creating the Razorpay order.
- [ ] During manual pilot, enter carrier, tracking/AWB number and tracking URL in admin before marking an order SHIPPED. Automate label creation, tracking webhooks and delivery status only after carrier account credentials and written mirror acceptance are confirmed.
- [ ] Add GST invoice generation, email/SMS receipt, failure recovery and customer support workflows.
- [ ] Add address validation and serviceable PIN code rules. Confirm charges/taxes on the server.

## Reliability and security
- [ ] Move rate limiting to a shared backend; current in-memory limit is best-effort only.
- [ ] Configure CSP and `next/image` remote allow-list after selecting image/storage/CDN providers.
- [ ] Add integration/E2E tests covering race conditions, webhook signature/replay, unauthorised users and price tampering.
- [ ] Add dependency/security scanning, SAST, error monitoring, audit logs and alert policies.
- [ ] Configure Cloud Run minimum/maximum instances, request timeouts, concurrency, health checks and rollback procedure.
- [ ] Verify secrets are referenced from Secret Manager; never print values in CI logs.
- [ ] Test accessibility, mobile layouts, SEO metadata, sitemap, robots, legal pages and performance.
- [ ] Run backup restore and order reconciliation drills.

## Payment-specific checks
- [ ] Exercise payment success, cancel, failed payment, webhook retry, duplicate webhook and signature mismatch in Razorpay test mode.
- [ ] Add an expiry job that releases reserved inventory for abandoned pending online payments, and ensure it cannot cancel a captured payment.
- [ ] Reconcile gateway settlement reports with orders daily.
