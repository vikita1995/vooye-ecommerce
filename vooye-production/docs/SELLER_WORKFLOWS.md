# Customer, seller and admin workflows

## Customer
- Browse active products from approved sellers.
- Create an account using Firebase Authentication.
- Add products to cart and provide delivery details.
- Pay using Razorpay only.
- See only their own order history, shipment updates and refund status.

## Seller
- Authenticate as a customer and apply for a seller account.
- Store starts `PENDING`; seller cannot publish products until admin approval.
- Manage only their own product drafts, prices, inventory and images.
- Submit listings for moderation; admin activates approved products.
- See only order items assigned to that seller; add shipment/tracking information.
- View payout/reconciliation records. Do not store card details or Razorpay secrets in seller-facing data.

## Admin
- Assign ADMIN role only through a trusted operator-controlled process.
- Approve/reject/suspend sellers.
- Moderate listings and handle takedowns.
- View all orders/payment events and initiate a documented refund/reconciliation process.
- Audit admin actions.

## Required implementation before live launch
The present folder includes role model and seller/admin portal screen scaffolds, but seller application/product management, order fulfillment, admin moderation, cart persistence, Firebase client sign-in UI, and payout/refund UI/API are not fully connected. Implement these authenticated APIs and integration tests before launch. The existing API authentication helper verifies Firebase ID tokens and upserts users, but all future endpoints must enforce roles and resource ownership on the server.
