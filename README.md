# Vooye E-commerce

Vooye is a category-flexible e-commerce platform for mirrors, furniture, decor, and future home product categories.

## Current Status

Phase 1 has established the project foundation:

- Next.js app in `frontend/`
- TypeScript, Tailwind CSS, and ESLint
- Root environment variable example
- Initial architecture, security, and deployment notes
- Basic Next.js security headers

Prisma, PostgreSQL, Supabase, authentication, product management, cart, checkout, orders, tests, CI, and deployment files are planned for later phases.

## Repository Layout

```txt
vooye-ecommerce/
|-- frontend/          # Next.js storefront and future admin app
|-- docs/              # Architecture, security, and deployment notes
|-- infrastructure/    # Future Docker, GCP, and IaC files
|-- .env.example       # Safe example environment variables
|-- .gitignore
`-- README.md
```

## Local Setup

Use Node.js 24 or a compatible current Node.js runtime.

```bash
cd frontend
npm install
npm run dev
```

The app runs locally at `http://localhost:3000` by default.

## Environment Variables

Do not commit real `.env` files. Start from the root example file:

```bash
cp ../.env.example .env.local
```

Only variables prefixed with `NEXT_PUBLIC_` are safe to expose to browser code. Database URLs, service-role keys, payment secrets, and admin secrets must stay server-only.

## Verification

From `frontend/`:

```bash
npm run lint
npm run typecheck
npm run build
```

## Planned Phases

1. Repository foundation and documentation
2. Prisma and PostgreSQL schema
3. Supabase integration and product image storage strategy
4. Authentication and role-based authorization
5. Product, category, variant, image, and inventory management
6. Customer storefront, search, filtering, wishlist, cart, and checkout
7. Orders, payments, shipments, and admin dashboard
8. Tests, security hardening, SEO, performance, Docker, and Cloud Run deployment
