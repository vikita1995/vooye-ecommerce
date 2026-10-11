# Vooye go-live checklist

Do not mark the store live until every relevant item is verified.

## Application and access
- [ ] Replace scaffold-only customer/seller/admin screens with connected, tested flows.
- [ ] Firebase sign-in, token expiry, disabled users and account recovery tested.
- [ ] Admin role assigned only through trusted process; seller routes check approved status.
- [ ] Seller APIs scope all queries and mutations to authenticated seller ID.
- [ ] Customer APIs scope orders and addresses to authenticated user ID.
- [ ] Uploads use private or controlled object storage, MIME/size validation and safe image transformation.
- [ ] Privacy policy, terms, shipping, cancellation, returns/refunds and contact details published.

## Payments and stock
- [ ] Razorpay test-mode success/failure/cancel/duplicate webhook/out-of-order event tests pass.
- [ ] Verify payment amount/currency against server-side order amount, not just signature.
- [ ] Webhook idempotency uses Razorpay event ID and stores processed events atomically.
- [ ] Late payment on expired/cancelled order is reconciled; never silently mark cancelled order paid.
- [ ] Inventory reservation/expiry/release uses DB transactions and safe concurrent updates.
- [ ] Refund flow, audit trail and daily reconciliation implemented.
- [ ] Shipping/tax calculation reviewed; no missing config defaults to free shipping.

## Infrastructure
- [ ] GitHub Actions CI passes on the final branch.
- [ ] Docker image builds and starts on Cloud Run with non-root user.
- [ ] Workload Identity Federation restricted to intended repository/branch.
- [ ] Runtime secrets are bound from Secret Manager; no secrets in Git or image.
- [ ] Database migrations run as a controlled release step; backups and restore drill verified.
- [ ] Logs, uptime alert, error alert, payment reconciliation alert and budget alerts configured.
- [ ] Cloud Run min/max instances, concurrency, CPU/memory, timeout and scaling reviewed.
- [ ] Domain HTTPS, DNS, canonical URL, Firebase authorized domains and email sender tested.
- [ ] Rollback procedure tested against a previous image and compatible schema migration.

## Business
- [ ] Seller verification and marketplace seller terms reviewed.
- [ ] Payout process, commissions, invoices, GST/accounting and customer support process documented.
- [ ] Real-product photography, dimensions, shipping packaging and return eligibility reviewed.
- [ ] Accessibility and mobile-browser QA completed.
