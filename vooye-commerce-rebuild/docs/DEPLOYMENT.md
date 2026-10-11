# Deployment (Google Cloud Run)

1. Create managed PostgreSQL or a Supabase project. Configure pooling appropriately for Cloud Run; use a direct connection for Prisma migrations where the provider requires it.
2. Store `DATABASE_URL`, Razorpay secret values and webhook secret in Secret Manager. Never commit `.env` files.
3. Configure runtime service account to access only required secrets and Firebase authentication verification. Use Workload Identity Federation for GitHub Actions deploy access.
4. Build container with `docker build -t REGION-docker.pkg.dev/PROJECT/REPOSITORY/vooye:TAG .` and push it to Artifact Registry.
5. Run migrations once as a release job: `npx prisma migrate deploy`, with the production database URL securely injected.
6. Deploy the image to Cloud Run and inject runtime secret references. Set `PORT=8080`; the container uses Next.js `PORT` support.
7. Test homepage, product data, sign-in, COD order, stock decrement, order history and unauthorized admin response.
8. Start with Razorpay test mode. Do not advertise online payment until order reservation, payment verification, webhook idempotency and refunds have passed tests.

The included workflow runs lint/typecheck/test/build only; deployment is intentionally not automatic so you can review the new architecture and configure secrets/IAM deliberately.
