# Security

Security requirements for Vooye:

- Never commit real secrets or `.env` files.
- Use server-only environment variables for database URLs, service-role keys, auth secrets, and payment secrets.
- Use `NEXT_PUBLIC_` only for values that are safe in browser code.
- Access PostgreSQL through Prisma to avoid SQL injection-prone query construction.
- Validate user input on the server.
- Protect admin routes with authentication and role-based authorization.
- Never trust client-submitted prices, inventory, quantities, totals, discounts, or order state.
- Calculate cart totals, tax, shipping, and inventory reservations on the server.
- Do not store card numbers, CVV values, or sensitive payment-card data.
- Avoid logging passwords, tokens, API keys, payment secrets, or webhook secrets.

## Current Foundation

The Next.js app disables the `X-Powered-By` header and adds baseline security headers:

- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `X-DNS-Prefetch-Control`

A stricter Content Security Policy should be added after image, payment, analytics, and Supabase endpoints are finalized.

## Secret Management

Local development should use uncommitted `.env.local` files. Production should use GCP Secret Manager with Cloud Run environment bindings.
