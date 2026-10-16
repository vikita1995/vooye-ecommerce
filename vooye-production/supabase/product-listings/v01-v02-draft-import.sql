-- Vooye product listing import: V01 and V02
-- Run only AFTER:
--   1) Uploading the five WebP assets to the public "vooye-products" bucket.
--   2) Confirming the owner Firebase UID belongs to an APPROVED public.seller_profiles row.
-- All rows created by this script remain status='draft'; nothing is published.
-- Replace the placeholder below with the owner's Firebase UID. Do not use a Supabase auth.users UUID.

DO $vooye$
DECLARE
  v_seller_uid text := 'REPLACE_WITH_APPROVED_FIREBASE_UID';
  v_v01_id uuid;
  v_v02_id uuid;
  v_base_url text := 'https://cpoitylvklkcrclsaxem.supabase.co/storage/v1/object/public/vooye-products/';
BEGIN
  IF v_seller_uid = 'REPLACE_WITH_APPROVED_FIREBASE_UID' OR length(trim(v_seller_uid)) < 10 THEN
    RAISE EXCEPTION 'Set v_seller_uid to the approved seller Firebase UID before running this import';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.seller_profiles
    WHERE firebase_uid = v_seller_uid AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'No approved seller profile found for the supplied Firebase UID. No products were imported.';
  END IF;

  INSERT INTO public.products
    (seller_uid, slug, name, category, description, dimensions, price_paise, stock, status)
  VALUES
    (v_seller_uid, 'vooye-gold-arched-floor-mirror',
     'V01 Gold Arch Full-Length Mirror with Stand', 'Floor Mirrors',
     'Gold-tone arched full-length mirror with a black freestanding support. A statement piece for dressing areas, bedrooms and entryways.',
     NULL, 299900, 250, 'draft')
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        dimensions = EXCLUDED.dimensions,
        price_paise = EXCLUDED.price_paise,
        stock = EXCLUDED.stock,
        updated_at = now()
    WHERE public.products.seller_uid = EXCLUDED.seller_uid
      AND public.products.status IN ('draft', 'pending_review')
  RETURNING id INTO v_v01_id;

  IF v_v01_id IS NULL THEN
    RAISE EXCEPTION 'V01 slug already belongs to another seller or a published listing. Resolve manually; no changes committed.';
  END IF;

  INSERT INTO public.products
    (seller_uid, slug, name, category, description, dimensions, price_paise, stock, status)
  VALUES
    (v_seller_uid, 'vooye-gold-rounded-rectangle-floor-mirror',
     'V02 Gold Rounded-Corner Full-Length Mirror with Stand', 'Floor Mirrors',
     'Full-length mirror with softly rounded rectangular corners, a gold-tone edge and a black freestanding support. Designed for dressing areas and bedrooms.',
     NULL, 299900, 250, 'draft')
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        dimensions = EXCLUDED.dimensions,
        price_paise = EXCLUDED.price_paise,
        stock = EXCLUDED.stock,
        updated_at = now()
    WHERE public.products.seller_uid = EXCLUDED.seller_uid
      AND public.products.status IN ('draft', 'pending_review')
  RETURNING id INTO v_v02_id;

  IF v_v02_id IS NULL THEN
    RAISE EXCEPTION 'V02 slug already belongs to another seller or a published listing. Resolve manually; no changes committed.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.product_images
    WHERE storage_path IN (
      'products/vooye-gold-arched-floor-mirror/01-front.webp',
      'products/vooye-gold-arched-floor-mirror/02-side-angle.webp',
      'products/vooye-gold-rounded-rectangle-floor-mirror/01-front.webp',
      'products/vooye-gold-rounded-rectangle-floor-mirror/02-window-angle.webp',
      'products/vooye-gold-rounded-rectangle-floor-mirror/03-room-angle.webp'
    )
    AND product_id NOT IN (v_v01_id, v_v02_id)
  ) THEN
    RAISE EXCEPTION 'One or more image paths already belong to a different product. Resolve image assignments manually.';
  END IF;

  INSERT INTO public.product_images (product_id, image_url, storage_path, sort_order)
  VALUES
    (v_v01_id, v_base_url || 'products/vooye-gold-arched-floor-mirror/01-front.webp',
     'products/vooye-gold-arched-floor-mirror/01-front.webp', 0),
    (v_v01_id, v_base_url || 'products/vooye-gold-arched-floor-mirror/02-side-angle.webp',
     'products/vooye-gold-arched-floor-mirror/02-side-angle.webp', 1),
    (v_v02_id, v_base_url || 'products/vooye-gold-rounded-rectangle-floor-mirror/01-front.webp',
     'products/vooye-gold-rounded-rectangle-floor-mirror/01-front.webp', 0),
    (v_v02_id, v_base_url || 'products/vooye-gold-rounded-rectangle-floor-mirror/02-window-angle.webp',
     'products/vooye-gold-rounded-rectangle-floor-mirror/02-window-angle.webp', 1),
    (v_v02_id, v_base_url || 'products/vooye-gold-rounded-rectangle-floor-mirror/03-room-angle.webp',
     'products/vooye-gold-rounded-rectangle-floor-mirror/03-room-angle.webp', 2)
  ON CONFLICT (storage_path) DO UPDATE
    SET image_url = EXCLUDED.image_url,
        sort_order = EXCLUDED.sort_order
    WHERE public.product_images.product_id = EXCLUDED.product_id;

  RAISE NOTICE 'V01 and V02 were prepared as drafts for seller UID %. Stock and price saved; publishing was not performed.', v_seller_uid;
END
$vooye$;

-- Verification query after import:
-- SELECT p.slug, p.name, p.price_paise, p.stock, p.status, s.store_name, s.status AS seller_status,
--        count(i.id) AS image_count
-- FROM public.products p
-- JOIN public.seller_profiles s ON s.firebase_uid = p.seller_uid
-- LEFT JOIN public.product_images i ON i.product_id = p.id
-- WHERE p.slug IN ('vooye-gold-arched-floor-mirror', 'vooye-gold-rounded-rectangle-floor-mirror')
-- GROUP BY p.id, s.store_name, s.status
-- ORDER BY p.slug;
