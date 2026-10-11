# Deployment (Google Cloud Run)

1. Create managed PostgreSQL or a Supabase project. Configure pooling appropriately for Cloud Run; use a direct connection for Prisma migrations where the provider requires it.
2. Store `DATABASE_URL`, Razorpay secret values and webhook secret in Secret Manager. Never commit `.env` files.
3. Configure runtime service account to access only required secrets and Firebase authentication verification. Use Workload Identity Federation for GitHub Actions deploy access.
4. Build container with `docker build -t REGION-docker.pkg.dev/PROJECT/REPOSITORY/vooye:TAG .` and push it to Artifact Registry.
5. Run migrations once as a release job: `npx prisma migrate deploy`, with the production database URL securely injected.
6. Deploy the image to Cloud Run and inject runtime secret references. Set `PORT=8080`; the container uses Next.js `PORT` support.
7. Test homepage, product data, sign-in, Razorpay test payment, stock decrement, order history and unauthorized admin response.
8. Start with Razorpay test mode. Do not advertise online payment until order reservation, payment verification, webhook idempotency and refunds have passed tests.

The included workflow runs lint/typecheck/test/build only; deployment is intentionally not automatic so you can review the new architecture and configure secrets/IAM deliberately.


## Supabase PostgreSQL configuration

1. In Supabase Project Settings → Database, copy the pooled connection string for `DATABASE_URL` (transaction pooler is suitable for serverless runtime; use the exact provider-recommended pooler mode and connection options).
2. Set `DIRECT_URL` to the direct or session connection string used by Prisma migrations. If direct IPv6 connectivity is unavailable, use Supabase's session pooler for `DIRECT_URL`.
3. URL-encode special characters in the database password. Do not commit either URL.
4. Apply schema using `npm run db:deploy` as a controlled release step, not at app startup.
5. Set `SHIPPING_FLAT_FEE_PAISE` only after shipping pricing is decided. The app intentionally rejects order creation if this is unset.
6. Add Razorpay secrets through Secret Manager; configure a webhook pointing to `/api/payments/razorpay/webhook`. Use test keys first.
