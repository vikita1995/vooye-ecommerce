# Vooye invoices

## What is implemented

- A persistent `Invoice` snapshot is created after a Razorpay payment is confirmed, when the required seller business configuration is present.
- The invoice API checks that the authenticated customer owns the order and that payment is captured before returning a PDF.
- The order-history page uses the Prisma commerce orders and exposes **Download invoice PDF** only for successfully captured orders.
- If invoice configuration is added after a payment, the first invoice-download request can create the missing snapshot.
- Optional invoice email is sent through the Resend HTTP API when both `RESEND_API_KEY` and a verified `INVOICE_FROM_EMAIL` are configured. A provider idempotency key is used to avoid duplicate messages when payment verification and the webhook both run.

## Required server configuration

Set these as server-side Cloud Run environment variables or Secret Manager-backed variables. Do not add the Resend API key to a `NEXT_PUBLIC_*` variable or commit it to Git.

- `INVOICE_SELLER_LEGAL_NAME`: actual legal name of the supplier.
- `INVOICE_SELLER_ADDRESS`: actual business address. Separate lines may be represented with literal `\\n`.
- `INVOICE_SELLER_EMAIL` and `INVOICE_SELLER_PHONE`: optional support contact details.
- `INVOICE_SELLER_GSTIN`: optional; set only to a verified, applicable GSTIN.
- `INVOICE_NUMBER_PREFIX`: optional prefix; defaults to `VOO-INV`.
- `RESEND_API_KEY` and `INVOICE_FROM_EMAIL`: optional if invoice emails are required. Verify the sender/domain with Resend first.

If the required legal name or address is missing, payment completion is not blocked. Invoice issuance is logged as deferred and the download endpoint returns an actionable configuration error.

## Database target verification is a release gate

The connected Supabase project currently exposes the legacy snake_case tables (`public.orders`, `public.order_items`, `public.customers`, `public.products`) but does not expose the Prisma tables named `"Order"`, `"OrderItem"`, `"User"`, or `"Product"`. The invoice migration below references the Prisma `"Order"` table. **Do not apply this Prisma migration to that Supabase project unless Cloud Run's `DATABASE_URL` / `DIRECT_URL` are confirmed to target a database that already contains the Prisma schema.** If those URLs target the connected Supabase project, the application currently has two competing commerce data models; reconcile them before enabling invoice downloads. The app code uses both models today.

## Apply the database migration before using invoice downloads

The schema migration is at `prisma/migrations/20261016150000_add_invoices/migration.sql`.

Run this in a trusted environment configured with the same production `DIRECT_URL` used for Prisma migrations, from the `vooye-production` directory:

```bash
npx prisma validate
npx prisma migrate deploy
npx prisma generate
npm run typecheck
npm test
```

Do not print the connection string or commit it. The existing GitHub deployment workflow does **not** run database migrations automatically, so apply and verify this migration through your controlled release process before relying on invoice download in production.

## Important tax/accounting limitation

The current checkout stores subtotal, shipping and total, but does not calculate or persist GST/tax line items. This feature therefore generates an **order invoice/payment record**, not a GST tax invoice. The PDF explicitly states this limitation. The invoice number is order-derived and is not a sequential GST invoice series. Before using these PDFs as tax invoices or for tax reporting, have the applicable tax treatment, GST registration details, tax calculation and statutory invoice numbering reviewed and implemented. Do not represent a zero tax value as a tax determination.

## Verification checklist

1. Apply the schema migration and confirm Prisma client generation passes.
2. Configure legal business name/address in the Cloud Run runtime environment.
3. Complete a Razorpay **test-mode** payment and confirm the invoice record is created.
4. Download the PDF from **My Account → My Orders**; confirm line items, captured payment reference, shipping, totals, and seller/customer snapshot.
5. Download again and verify the invoice number and snapshot remain unchanged.
6. Try an unpaid order and an order ID belonging to another customer; invoice download must be rejected.
7. If Resend is configured, confirm exactly one email with the PDF attachment is sent to the buyer email. Check Resend logs; do not assume delivery from a successful HTTP request alone.
