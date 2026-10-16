# Vooye product import (V01 / V02)

## Catalogue values
- V01 Gold Arch Full-Length Mirror with Stand — ₹2,999, stock 250, status draft.
- V02 Gold Rounded-Corner Full-Length Mirror with Stand — ₹2,999, stock 250, status draft.
- Category: Floor Mirrors.
- Exact dimensions are intentionally blank until confirmed.

## Current database status
The production Supabase project currently has no rows in `public.seller_profiles` and `public.products`. Do not invent a seller identity or publish these products. The guarded SQL import checks that the supplied Firebase UID belongs to an `approved` seller profile and throws before writing if that check fails.

## Upload images
1. Extract the supplied `vooye-product-upload-pack.zip`.
2. In the `vooye-production` directory, install dependencies with `npm ci` if needed.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your local environment. Never commit or share the service-role key.
4. Run:
   `node scripts/upload-product-assets.mjs "C:\\path\\to\\vooye_product_upload_pack\\products"`
   Pass the extracted `products` folder (the directory containing the two product-slug folders).
5. Confirm the five WebP objects exist in Storage bucket `vooye-products`.

## Import as drafts
1. Open Supabase SQL Editor for project `cpoitylvklkcrclsaxem`.
2. Open `supabase/product-listings/v01-v02-draft-import.sql`.
3. Replace `REPLACE_WITH_APPROVED_FIREBASE_UID` with the owner's verified Firebase UID only after `public.seller_profiles` shows that identity as `approved`.
4. Run the script. It inserts/updates only draft/pending-review products and refuses to overwrite already-published slugs.
5. Run the verification query at the end of the SQL file. Each product should have five or the expected count of images (2 for V01 and 3 for V02), price_paise=299900, stock=250, status=draft.

## Publishing
The storefront now reads `public.products`, `public.seller_profiles`, and `public.product_images`. It renders only `products.status='approved'`, positive stock, and approved sellers. Do not change drafts to approved until the seller, final price, stock, image URLs and dimensions are verified. Checkout is independent and remains disabled until its Prisma order/product data integration is reconciled with this catalogue.
