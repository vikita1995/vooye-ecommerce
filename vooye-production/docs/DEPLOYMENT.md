# Deployment and provider configuration

## GitHub Actions repository variables
Set these under Settings → Secrets and variables → Actions → Variables:
- `GCP_PROJECT_ID`: `vooye-510916`
- `GCP_REGION`: `asia-south1`
- `AR_REPOSITORY`: `vooye-app`
- `CLOUD_RUN_SERVICE`: `vooye-frontend`
- `WIF_PROVIDER`: full resource name of your existing Workload Identity Federation provider
- `WIF_SERVICE_ACCOUNT`: deployer service-account email

Grant the deployer only the permissions required to push to Artifact Registry and deploy/update the intended Cloud Run service. Restrict WIF attribute conditions to this GitHub owner/repository and `main` branch. Do not use service-account JSON keys.

## Cloud Run runtime secrets
Create Secret Manager secrets for:
- `DATABASE_URL`
- `DIRECT_URL`
- `FIREBASE_ADMIN_PROJECT_ID`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `SHIPPING_FLAT_FEE_PAISE`

Then update the deployment workflow to bind each secret using `--set-secrets`. This starter intentionally does not embed secret values into GitHub variables or the image. Do not launch checkout until runtime secrets and DB connectivity are configured. Ensure public Razorpay key ID is injected as a build-time variable if the client checkout UI is enabled.

## Database
1. Create a Supabase PostgreSQL database.
2. Configure pooled `DATABASE_URL` for application connections and direct `DIRECT_URL` for Prisma migrations.
3. Run `npx prisma migrate dev --name init` locally to create the first migration, review it, commit `prisma/migrations/`.
4. In a controlled release job run `npx prisma migrate deploy` before shifting traffic.
5. Verify backup retention and perform a restore drill.

## Firebase
- In Firebase Console → Authentication → Templates → Password reset, set the email action/custom handler URL to `https://vooye.in/account/reset-password`. This page validates Firebase's `mode=resetPassword` and `oobCode`, then calls Firebase's `verifyPasswordResetCode` / `confirmPasswordReset` APIs. Do not use the retired Supabase password-reset flow.
- Ensure `vooye.in` is an authorized domain for the Firebase project. A working CI build does not verify that Firebase will deliver a production reset email.
Enable Firebase Authentication providers you intend to support. Add your production domains to Authorized domains. Configure the client app keys and server project ID. Cloud Run should use its attached service identity / Application Default Credentials to verify tokens. Never expose service-account credentials.

## Inventory reservation and order expiry
- The checkout API requires a non-empty `SERVICEABLE_PIN_CODES` allowlist of six-digit Indian PIN codes. Leave this unset until the shipping partner has confirmed serviceability.
- Orders reserve stock inside the same Prisma transaction that creates the pending order and records an inventory-reservation event.
- Set `CRON_SECRET` in Secret Manager and configure Cloud Scheduler to POST to `/api/cron/expire-pending-orders` with `Authorization: Bearer <secret>` at least every 5 minutes. The endpoint expires pending payment orders and releases only reservations created by this implementation. Do not put the secret in source control.
- Late captures after expiry and inventory/payment mismatches require a support/refund reconciliation workflow; do not enable live payments until that workflow is tested.

## Checkout feature gate
- `CHECKOUT_ENABLED` must remain `false` (or unset) until payment verification, inventory reservation/release, shipping, refund/reconciliation, and deployment secret bindings have been tested.
- The order API returns HTTP 503 unless `CHECKOUT_ENABLED=true` is explicitly set in the Cloud Run runtime environment. Do not enable it only to make the button appear.
- Use Razorpay test mode with a non-production checkout deployment first. Live keys should be enabled only after the full go-live checklist passes.

## Razorpay
- Start in test mode and use test keys.
- Configure webhook URL: `https://YOUR_DOMAIN/api/payments/razorpay/webhook`.
- Subscribe to `payment.captured` and payment failure events as required by your operational design.
- Verify webhook signatures and event idempotency, and test duplicate/out-of-order delivery.
- Test payment success, cancellation, timeout, payment failure, inventory conflict, refund and reconciliation.
- Before live activation, implement and test refund API/workflow and periodic reconciliation. Do not enable live keys before the release checklist is complete.

## Custom domain
Map `vooye.in` to Cloud Run using the chosen domain mapping / load balancer setup, configure DNS exactly as instructed by Google Cloud, enforce HTTPS, then add the domain to Firebase Auth authorized domains and `NEXT_PUBLIC_STORE_URL`.

## Important limitation
The included deployment workflow is a template. It does not bind Secret Manager secrets or apply Prisma migrations automatically. Add and verify those steps for your project before using it to serve real customers.
