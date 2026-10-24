# Seller portal separation plan

## Decision

Keep a single GitHub repository for now, but run the customer storefront and seller portal as independently built and deployed applications. Reuse the existing Artifact Registry repository `vooye-app` and publish separate images (`vooye-frontend` and `vooye-seller`) to separate Cloud Run services. Use `seller.vooye.in` for the seller application and `vooye.in` for customers.

Do not deploy a second service from the current storefront image and call it a seller portal: that would duplicate the same Next.js routes and would not isolate the seller UI or its bundle.

## Repository inspection findings

- The current application lives in `vooye-production/` and uses Next.js App Router, TypeScript, Prisma and Supabase.
- `vooye-production/Dockerfile` builds one Next.js standalone image.
- `.github/workflows/deploy.yml` deploys the existing `vooye-frontend` Cloud Run service and Firebase Hosting when changes land on `main`. A seller workflow must not change or trigger the production storefront deployment.
- `app/seller/page.tsx` currently redirects to `/admin/products`; it is not an independent seller dashboard.
- `app/admin/products/page.tsx` uses Firebase Authentication and calls `/api/admin/*`, and its UI explicitly describes itself as an official catalogue manager rather than the seller portal.
- `app/api/seller/products/route.ts` uses a different authentication path via `requireUser()` and verified Supabase access tokens, and reads/writes seller-owned records through Supabase REST.
- `lib/catalog.ts` reads published products and approved seller profiles from Supabase. This is the existing shared catalogue path that should remain the source of truth for the storefront.
- The Prisma schema models users, sellers, products and orders, while the current seller REST routes use Supabase tables such as `seller_profiles` and `products`. These models must be reconciled before moving the seller UI; do not assume they are interchangeable.

## Required target architecture

1. **Customer application** — keep the existing storefront and its current deployment unchanged.
2. **Seller application** — a dedicated Next.js app with its own Dockerfile, image and Cloud Run service. It must not ship the customer storefront routes/assets.
3. **Shared data** — seller edits write to the existing canonical Supabase product tables used by `lib/catalog.ts`; the storefront reads from those same tables.
4. **Authentication and authorization** — choose one supported seller identity/token flow and use it consistently. Verify tokens server-side, require an approved seller for seller operations, and derive seller ownership from the verified identity, never request-body fields.
5. **Cross-origin API access** — if the seller UI calls APIs hosted on `vooye.in`, explicitly allow only the seller origin where browser CORS applies, send the required bearer token, and never expose the service-role key to the browser. Prefer a clearly defined API boundary rather than copying privileged credentials into the seller app.
6. **Fresh storefront data** — product writes must update the canonical rows and invalidate any relevant cache. Current catalogue reads use `cache: "no-store"`; keep this behavior unless a deliberate cache with invalidation is introduced. Product details, category/search results, and stock/price must remain consistent.
7. **Independent CI/CD** — add a seller-only workflow triggered by seller-app paths or manual dispatch. It must build/test the seller app independently and deploy only the seller Cloud Run service. Do not include seller paths in the existing storefront deploy trigger.
8. **Safe rollout** — test login, seller approval, product create/edit/publish, image uploads, cross-origin calls, public catalogue propagation, stock/price changes, and unauthorized access before configuring the custom domain or production secrets.

## Implementation order

- Phase 1: resolve the authentication/table-contract mismatch and define the seller API boundary.
- Phase 2: create the standalone seller application and its Dockerfile.
- Phase 3: add seller-specific CI and a separately gated Cloud Run deployment workflow.
- Phase 4: test product update propagation against the shared catalogue and validate security.
- Phase 5: configure `seller.vooye.in` and production runtime secrets only after the above checks pass.

## Why this change is documentation-first

A separate Docker image alone would not create a separate seller experience. The current seller route is only a redirect, and the existing admin product UI uses a different authentication/API path from the seller product API. Building and deploying a second image before resolving these contracts could create a nonfunctional portal or an insecure cross-origin integration. This plan records the verified starting point and prevents accidental changes to the live storefront while the split is implemented.
