# Architecture overview

- Next.js App Router: public storefront and server endpoints.
- PostgreSQL + Prisma: authoritative product, stock, customer, order and order-item state.
- Firebase Authentication: browser sign-in; every private API independently verifies the Firebase ID token server-side.
- Admin allow-list: only Firebase UIDs explicitly set in `ADMIN_UIDS` are allowed to use product management APIs.
- Checkout: client sends product IDs and quantities only; server fetches prices/stock from PostgreSQL and performs conditional stock decrement in a transaction.
- Razorpay integration: SDK configuration and raw-body signature validation are scaffolded. Online checkout is deliberately disabled pending idempotent order reservation and reconciliation.

All product prices are stored as integer paise to avoid floating-point currency errors. The UI's abstract mirror illustrations are placeholders; replace with owned/licensed product photos and configure an image CDN/storage service before launch.
