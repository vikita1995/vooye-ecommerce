# Vooye production hardening runbook

## Architecture decision (current implementation)

- **Identity authority: Firebase Authentication.** Google sign-in must be initiated and completed through Firebase Auth. The API validates Firebase ID tokens with Firebase Admin.
- **Business-data authority: PostgreSQL accessed through Prisma.** Keep User, Product, Order, OrderItem, PaymentEvent, Invoice, and seller records in the Prisma-backed PostgreSQL schema as the source of truth. Do not dual-write the same business entity through Prisma and Supabase's Data API.
- **Supabase: managed PostgreSQL / selected platform services only.** The browser uses the Supabase publishable key only for explicitly approved public operations. Do not put a Supabase service/secret key in any NEXT_PUBLIC_* variable. Keep direct client writes to orders, payment transactions, profiles/roles, and inventory denied unless a reviewed RLS policy explicitly requires them.
- **Legacy naming:** lib/supabase/verify-token.ts is a compatibility module but verifies Firebase ID tokens. Rename it only as a separate refactor after references are exhaustively checked.
- **PKCE:** app/auth/callback/route.ts currently disables legacy Supabase OAuth and redirects to sign-in. This is intentional for the Firebase-authoritative architecture; it is not a working Supabase OAuth callback. Do not re-enable exchangeCodeForSession as a partial fix. If the product explicitly chooses Supabase Auth later, migrate the whole login path together: browser and server clients from @supabase/ssr, cookie getAll/setAll on the same origin, a callback that exchanges the code, matching Supabase redirect allow-list entries, and an explicit account-linking migration. Never let Firebase and Supabase independently create separate customer identities for one person.

## Payment / inventory go-live gate

Keep checkout disabled until the following are exercised in Razorpay test mode against a staging deployment and the outcomes are recorded:

1. Successful capture: one order becomes paid, one payment ID is attached, inventory stays reserved, and at most one invoice is issued.
2. Failed payment: the order transitions once and a reservation is released once.
3. Duplicate webhook: replay the exact signed event and confirm no duplicate order, stock movement, invoice, or payment event side effect.
4. Concurrent last-item checkout: run two independent checkout requests for a product with stock = 1; exactly one reservation succeeds and stock never becomes negative.
5. Abandoned checkout: allow the reservation to expire; verify the expiry/reconciliation worker releases stock exactly once.
6. Late capture after expiry/release: do not silently mark paid or re-release stock; create a reconciliation alert and follow a documented refund/manual-recovery path.
7. Amount/currency mismatch and invalid signature: reject/flag them; never fulfil the order.
8. Webhook retry after a transient DB failure: retry safely and verify eventual state consistency.

Do not use live Razorpay credentials for these tests. Use synthetic/staging products and test keys. Confirm the webhook endpoint configured in Razorpay matches the deployed path and secret in Secret Manager.

## Database security checklist

- Keep RLS enabled for every table exposed through Supabase's Data API. Business tables should remain deny-by-default for anon and authenticated unless an explicit least-privilege policy is required.
- Never authorize from user-editable metadata. Roles are assigned only by trusted server-side admin flows.
- Review every SECURITY DEFINER function, fix its search_path, and revoke execution from PUBLIC / client roles unless it is intentionally public and safe.
- Keep Firebase Admin credentials, Razorpay secret/webhook secret, database URLs and Supabase server secret keys in Google Secret Manager / server environment only.
- The current Supabase security advisor reports leaked-password protection disabled. Because Firebase is the active identity provider, verify that Supabase Auth password sign-in is not exposed. If Supabase Auth password sign-in is enabled for any user flow, enable leaked-password protection in the Supabase Auth settings.
- Re-run Supabase security advisors after database/policy changes and review findings before release.

## Deployment and branch protection

The deployment workflow now smoke-tests the Cloud Run revision's /api/health database probe and /api/checkout/status response before proceeding to Firebase Hosting deployment.

Repository administration permission was not available to this automation, so protect main manually:

1. GitHub repository → Settings → Rules → Rulesets (or Branches → Branch protection rules).
2. Target branch main.
3. Require a pull request before merging (at least one approval if a second reviewer is available).
4. Require status checks before merging and select the CI job validate from Vooye CI after it has completed on a pull request.
5. Require branches to be up to date; block force pushes and branch deletion.
6. Restrict direct pushes to main where the plan/repository settings allow it.
7. Confirm the deploy workflow is triggered only after reviewed changes reach main.

## Verification record

- Automated CI in this repository runs Prisma validation/generation, lint, typecheck, tests and a production build.
- The post-deploy smoke test is automated in .github/workflows/deploy.yml.
- Live Google sign-in, Razorpay payment flows, concurrent inventory, webhook replay, and branch protection cannot be proven by static repository edits alone; complete the staging checklist above before enabling checkout.
