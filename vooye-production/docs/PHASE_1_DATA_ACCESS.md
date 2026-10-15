# Phase 1: data access and release safety

## Current architecture findings

- The public catalogue is read through Prisma/PostgreSQL (`Product`, `Seller` models).
- Seller application/product/admin APIs currently use Supabase REST tables such as `seller_profiles` and `products`.
- Customer profile uses the Supabase REST `customers` table.
- Seller image files use Supabase Storage and image metadata uses a separate Supabase REST table.
- These are distinct data models. Until seller/product data is consolidated, a seller write in Supabase is not guaranteed to appear in the Prisma-backed storefront.

## Safety decision

Do not run a production migration or automatically copy/delete records until current Supabase table definitions, constraints, row counts, and existing production data have been inspected and a reversible migration plan approved. The Git repository does not contain a Prisma migrations directory at the time of this audit.

The intended long-term direction is one authoritative relational data model for users, seller applications, sellers, products, and product-image metadata. Supabase Storage can remain the binary image store. A schema/data migration must preserve current seller/product records and their IDs or provide a verified mapping before changing API routes.

## Payments

Payment-related changes are explicitly out of scope for this phase. Do not invoke Razorpay, create orders, or mark orders paid as part of storefront or seller tests. Keep payment code isolated for a later, separately tested release.

## Release controls

- Work on a feature branch and review a pull request before merge.
- Run Prisma validation, lint, typecheck, and unit tests in CI.
- Do not deploy this branch to Cloud Run automatically.
- A database readiness check should fail with HTTP 503 if PostgreSQL cannot be reached, without exposing connection details.
