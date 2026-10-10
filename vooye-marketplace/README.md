# Vooye Marketplace starter
Responsive Next.js storefront starter for Vooye.

## Routes
`/`, `/search?q=mirror`, `/category/mirrors`, `/category/wall-mirrors`, `/category/vanity`, `/product/[slug]`, `/cart`, `/wishlist`, `/account`, `/account/orders`, `/track`, `/help`, `/returns`, `/policies`, `/checkout`, `/admin`.

## Run
Install Node.js 22+, then run `npm install`, `npm run dev`, and open http://localhost:3000.

## Important production limitations
This code is a UI and route starter, not a complete production marketplace. Product data and displayed ratings are sample data. Cart/wishlist use browser localStorage. Authentication, database, verified-purchase reviews, real tracking, support-ticket delivery, admin authorization, payment processing, tax/shipping, refunds, email/SMS and seller settlements are not implemented. Checkout and admin are intentionally placeholders.

Before launch, add a database and migrations, secure authentication and role checks, payment provider with signed webhook validation and idempotency, shipping integration, ticket persistence, verified reviews, object storage, rate limiting, audit logs, backups, monitoring, and approved legal policies. Never trust client-submitted prices or commit secrets.