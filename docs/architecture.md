# Architecture

Vooye is structured as a category-flexible commerce system. The initial storefront focuses on mirrors, furniture, and decor, but the database and application boundaries should support new categories without redesigning the core platform.

## Application Layout

- `frontend/` contains the Next.js application.
- `docs/` contains project decisions and operating notes.
- `infrastructure/` is reserved for Docker, GCP Cloud Run, Artifact Registry, and related deployment files.
- `prisma/` will be added in the database phase with schema and migrations committed to Git.

## Data Access

The application will use Prisma for database access. PostgreSQL should be treated as a portable database target so the app can start on Supabase PostgreSQL and later move to Google Cloud SQL PostgreSQL with minimal application changes.

Application code should depend on Prisma and environment variables, not on Supabase-specific database APIs.

## Planned Domain Model

Core models planned for the Prisma phase:

- User
- Address
- Category
- Product
- ProductImage
- ProductVariant
- Inventory
- Cart
- CartItem
- Wishlist
- Order
- OrderItem
- Payment
- Shipment

Money fields should use fixed precision decimal types. Product attributes should support structured common fields plus extensible category-specific metadata.
