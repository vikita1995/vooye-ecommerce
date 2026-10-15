Vooye logo + mirror gallery uploader

1. Extract the vooye-asset-pack folder into the root of your existing vooye-production project.
2. Ensure your local .env or .env.local contains the SERVER-SIDE Supabase key already used by your backend:
   SUPABASE_SERVICE_ROLE_KEY=...  (or SUPABASE_SECRET_KEY=...)
   Do not paste this key into chat or commit it to GitHub.
3. From the vooye-production folder run:
   node vooye-asset-pack/upload-vooye-assets.mjs
4. The script uploads the logo and six images to the public vooye-products bucket and verifies the public URLs. It writes uploaded-assets-manifest.json.
5. It does not insert/publish a product in the database. Price, stock and seller ownership must be confirmed separately.

The uploaded paths are intended to match the logo URL already referenced in app/layout.tsx, app/page.tsx, app/seller/page.tsx and app/admin/page.tsx:
  brand/vooye-logo.png

Product images are stored under:
  products/arched-gold-floor-mirror/
