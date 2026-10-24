# Vooye Seller Portal

A separate Next.js application intended to be built into the independent `vooye-seller` Docker image and deployed to its own Cloud Run service.

## Current scope
- Firebase email/password sign-in for an existing account.
- Server-side proxy to the existing storefront seller product API, avoiding browser CORS and never exposing Supabase service-role credentials.
- View products returned for the authenticated seller.
- Create draft product listings in the shared Supabase catalogue through the existing API.

## Prerequisites
1. Enable Email/Password in the project's Firebase Authentication providers, if this is the login method used for seller accounts.
2. Configure the four `NEXT_PUBLIC_FIREBASE_*` values at image build time.
3. Set runtime `SELLER_API_ORIGIN=https://vooye.in` on the seller Cloud Run service.
4. Ensure the corresponding Firebase UID has an approved row in `seller_profiles`.

## Local development
```bash
cp .env.example .env.local
npm install
npm run dev
```
Use Node.js 22. Visit http://localhost:3000.

## Current limitations
- This first implementation intentionally does not include product image upload, product editing/status changes, order management, seller onboarding, or payment reporting.
- The existing product API creates drafts. Customers will not see a draft until it is approved/published by the existing moderation path.
- Product listing GET and POST must be verified against the live schema and approved seller account in staging before production deployment.
- No Cloud Run deployment is triggered by this workflow. Deploying the seller image requires a separately reviewed deployment workflow and configured GCP identity/secrets.
