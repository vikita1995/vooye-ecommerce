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
- [ ] Run Prisma migrations in a controlled job and seed only non-production catalog values where intended.
- [ ] Online-payment flow is scaffolded but must be penetration-tested and exercised in Razorpay test mode before enabling it for customers.
- [ ] Register webhook secret and verify signatures against raw request bytes.
- [ ] Confirm webhook event ID uniqueness, replay handling, amount, currency, order ID and payment status tests before going live.
- [ ] Implement cancellation/refund flows and stock restoration; add COD confirmation and fraud controls.
- [ ] Implement shipping provider integration, tracking numbers, label creation and delivery status updates.
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
