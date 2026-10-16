import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { apiError, supabaseRest } from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductStatus = "draft" | "pending_review" | "approved" | "rejected" | "archived";
type ProductRow = {
  id: string;
  seller_uid: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  dimensions: string | null;
  price_paise: number;
  stock: number;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
};
type ImageInput = { image_url: string; storage_path: string };
type ProductImageRow = ImageInput & { id: string; product_id: string; sort_order: number };
type ManagedProduct = ProductRow & { images: ImageInput[] };

const PRODUCT_FIELDS = "id,seller_uid,slug,name,category,description,dimensions,price_paise,stock,status,created_at,updated_at";

function fail(message: string, status: number) {
  return apiError(message, status);
}
function handleAdminError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Authentication required" || message === "Authentication invalid or expired") {
    return fail("Please sign in again.", 401);
  }
  if (message === "Forbidden") return fail("Owner/admin access is required.", 403);
  if (message === "SUPABASE_CONFIG_MISSING") return fail("Product service is not configured.", 500);
  console.error("Product management API error:", message || "Unknown error");
  return fail("The request could not be completed.", 500);
}
async function requestDb(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
}
function slugify(value: string) {
  return value.normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
function parseImages(value: unknown): ImageInput[] | null {
  if (!Array.isArray(value) || value.length > 12) return null;
  const images: ImageInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const image = item as Record<string, unknown>;
    const imageUrl = typeof image.image_url === "string" ? image.image_url.trim() : "";
    const storagePath = typeof image.storage_path === "string" ? image.storage_path.trim() : "";
    if (!imageUrl.startsWith("https://") || !storagePath.startsWith("products/") || storagePath.includes("..")) return null;
    images.push({ image_url: imageUrl, storage_path: storagePath });
  }
  const paths = new Set(images.map((image) => image.storage_path));
  if (paths.size !== images.length) return null;
  return images;
}
async function ensurePlatformSeller(firebaseUid: string, email: string) {
  const db = supabaseRest("seller_profiles");
  const lookup = await requestDb(
    `${db.url}?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&select=firebase_uid,status&limit=1`,
    { headers: db.headers }
  );
  if (!lookup.ok) throw new Error("PLATFORM_SELLER_LOOKUP_FAILED");
  const rows = await lookup.json() as { firebase_uid: string; status: string }[];
  const payload = {
    firebase_uid: firebaseUid,
    store_name: "Vooye Official Store",
    store_slug: `vooye-official-${firebaseUid.slice(0, 8).toLowerCase()}`,
    description: "Official Vooye catalogue",
    support_email: email || null,
    status: "approved",
  };
  if (rows[0]) {
    const update = await requestDb(
      `${db.url}?firebase_uid=eq.${encodeURIComponent(firebaseUid)}`,
      { method: "PATCH", headers: { ...db.headers, Prefer: "return=minimal" }, body: JSON.stringify(payload) }
    );
    if (!update.ok) throw new Error("PLATFORM_SELLER_UPDATE_FAILED");
    return;
  }
  const insert = await requestDb(db.url, {
    method: "POST",
    headers: { ...db.headers, Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!insert.ok) {
    // Another concurrent request might have created this row; verify it exists and is approved.
    const verify = await requestDb(
      `${db.url}?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&status=eq.approved&select=firebase_uid&limit=1`,
      { headers: db.headers }
    );
    if (!verify.ok || (await verify.json() as unknown[]).length === 0) throw new Error("PLATFORM_SELLER_CREATE_FAILED");
  }
}
async function loadImages(db: ReturnType<typeof supabaseRest>, products: ProductRow[]) {
  const byId = new Map<string, ImageInput[]>();
  if (!products.length) return byId;
  const ids = products.map((product) => product.id);
  const response = await requestDb(
    `${db.url === "" ? "" : db.url.replace(/\/products$/, "/product_images")}?select=product_id,image_url,storage_path,sort_order&product_id=in.(${ids.join(",")})&order=sort_order.asc`,
    { headers: db.headers }
  );
  if (!response.ok) throw new Error("PRODUCT_IMAGES_LOOKUP_FAILED");
  const rows = await response.json() as ProductImageRow[];
  for (const image of rows) {
    const list = byId.get(image.product_id) ?? [];
    list.push({ image_url: image.image_url, storage_path: image.storage_path });
    byId.set(image.product_id, list);
  }
  return byId;
}
async function attachImages(db: ReturnType<typeof supabaseRest>, productId: string, images: ImageInput[]) {
  const imagesDb = supabaseRest("product_images");
  if (!images.length) return;
  const response = await requestDb(imagesDb.url, {
    method: "POST",
    headers: { ...imagesDb.headers, Prefer: "return=minimal" },
    body: JSON.stringify(images.map((image, index) => ({ product_id: productId, ...image, sort_order: index }))),
  });
  if (!response.ok) throw new Error("PRODUCT_IMAGES_SAVE_FAILED");
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    const status = request.nextUrl.searchParams.get("status") ?? "all";
    if (!["draft", "pending_review", "approved", "rejected", "archived", "all"].includes(status)) {
      return fail("Invalid product status filter.", 400);
    }
    const db = supabaseRest("products");
    const statusFilter = status === "all" ? "" : `&status=eq.${encodeURIComponent(status)}`;
    const response = await requestDb(
      `${db.url}?select=${PRODUCT_FIELDS}&seller_uid=eq.${encodeURIComponent(user.firebaseUid)}${statusFilter}&order=created_at.desc&limit=200`,
      { headers: db.headers }
    );
    if (!response.ok) return fail("Unable to load products.", 502);
    const products = await response.json() as ProductRow[];
    const imageMap = await loadImages(db, products);
    const managed: ManagedProduct[] = products.map((product) => ({
      ...product,
      images: imageMap.get(product.id) ?? [],
    }));
    return NextResponse.json({ products: managed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    let body: unknown;
    try { body = await request.json(); } catch { return fail("Invalid product details.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid product details.", 400);
    const input = body as Record<string, unknown>;
    const allowed = new Set(["name", "slug", "category", "description", "dimensions", "price_rupees", "stock", "images"]);
    if (Object.keys(input).some((key) => !allowed.has(key))) return fail("Unsupported product fields.", 400);

    const name = typeof input.name === "string" ? input.name.trim() : "";
    const category = typeof input.category === "string" ? input.category.trim() : "";
    const description = typeof input.description === "string" ? input.description.trim() : "";
    const dimensions = typeof input.dimensions === "string" ? input.dimensions.trim() : "";
    const slug = slugify(typeof input.slug === "string" && input.slug.trim() ? input.slug : name);
    const priceRupees = typeof input.price_rupees === "number" ? input.price_rupees : Number(input.price_rupees);
    const stock = typeof input.stock === "number" ? input.stock : Number(input.stock);
    const images = parseImages(input.images ?? []);
    if (name.length < 3 || name.length > 160) return fail("Product name must be 3–160 characters.", 400);
    if (category.length < 2 || category.length > 80) return fail("Enter a valid category.", 400);
    if (!description || description.length > 5000) return fail("Description is required and must be under 5,000 characters.", 400);
    if (dimensions.length > 200) return fail("Dimensions must be 200 characters or fewer.", 400);
    if (!slug) return fail("A valid product slug is required.", 400);
    if (!Number.isFinite(priceRupees) || priceRupees <= 0 || priceRupees > 10_000_000 || Math.round(priceRupees * 100) !== priceRupees * 100) return fail("Enter a valid price in rupees with at most two decimal places.", 400);
    if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1_000_000) return fail("Stock must be a whole number from 0 to 1,000,000.", 400);
    if (!images || images.length > 12) return fail("Invalid product images.", 400);

    await ensurePlatformSeller(user.firebaseUid, user.email);
    const db = supabaseRest("products");
    const response = await requestDb(`${db.url}?select=${PRODUCT_FIELDS}`, {
      method: "POST",
      headers: { ...db.headers, Prefer: "return=representation" },
      body: JSON.stringify({
        seller_uid: user.firebaseUid, slug, name, category, description,
        dimensions: dimensions || null, price_paise: Math.round(priceRupees * 100),
        stock, status: "draft",
      }),
    });
    if (response.status === 409) return fail("A product with this slug already exists. Edit that listing instead.", 409);
    if (!response.ok) {
      console.error("Admin product create failed:", response.status);
      return fail("Unable to create product.", 502);
    }
    const rows = await response.json() as ProductRow[];
    const product = rows[0];
    if (!product) return fail("Product was not saved.", 502);
    try {
      await attachImages(db, product.id, images);
    } catch {
      await requestDb(`${db.url}?id=eq.${encodeURIComponent(product.id)}&status=eq.draft`, {
        method: "DELETE", headers: db.headers,
      }).catch(() => undefined);
      return fail("Product image records could not be saved. Please retry.", 502);
    }
    return NextResponse.json({ product: { ...product, images } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    let body: unknown;
    try { body = await request.json(); } catch { return fail("Invalid update.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid product update.", 400);
    const input = body as Record<string, unknown>;
    const allowed = new Set(["product_id", "name", "slug", "category", "description", "dimensions", "price_rupees", "stock", "status", "images"]);
    if (Object.keys(input).some((key) => !allowed.has(key))) return fail("Unsupported product update fields.", 400);
    const productId = typeof input.product_id === "string" ? input.product_id.trim() : "";
    if (!productId) return fail("Product ID is required.", 400);

    const db = supabaseRest("products");
    const lookup = await requestDb(`${db.url}?id=eq.${encodeURIComponent(productId)}&seller_uid=eq.${encodeURIComponent(user.firebaseUid)}&select=${PRODUCT_FIELDS}&limit=1`, { headers: db.headers });
    if (!lookup.ok) return fail("Unable to load product.", 502);
    const currentRows = await lookup.json() as ProductRow[];
    const current = currentRows[0];
    if (!current) return fail("Product not found for this owner account.", 404);

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("name" in input) {
      if (typeof input.name !== "string" || input.name.trim().length < 3 || input.name.trim().length > 160) return fail("Product name must be 3–160 characters.", 400);
      update.name = input.name.trim();
    }
    if ("slug" in input) {
      if (typeof input.slug !== "string" || !slugify(input.slug)) return fail("Enter a valid product slug.", 400);
      update.slug = slugify(input.slug);
    }
    if ("category" in input) {
      if (typeof input.category !== "string" || input.category.trim().length < 2 || input.category.trim().length > 80) return fail("Enter a valid category.", 400);
      update.category = input.category.trim();
    }
    if ("description" in input) {
      if (typeof input.description !== "string" || !input.description.trim() || input.description.trim().length > 5000) return fail("Description is required and must be under 5,000 characters.", 400);
      update.description = input.description.trim();
    }
    if ("dimensions" in input) {
      if (typeof input.dimensions !== "string" || input.dimensions.trim().length > 200) return fail("Dimensions must be 200 characters or fewer.", 400);
      update.dimensions = input.dimensions.trim() || null;
    }
    if ("price_rupees" in input) {
      const value = typeof input.price_rupees === "number" ? input.price_rupees : Number(input.price_rupees);
      if (!Number.isFinite(value) || value <= 0 || value > 10_000_000 || Math.round(value * 100) !== value * 100) return fail("Enter a valid price in rupees.", 400);
      update.price_paise = Math.round(value * 100);
    }
    if ("stock" in input) {
      const value = typeof input.stock === "number" ? input.stock : Number(input.stock);
      if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) return fail("Stock must be a whole number from 0 to 1,000,000.", 400);
      update.stock = value;
    }
    let images: ImageInput[] | undefined;
    if ("images" in input) {
      images = parseImages(input.images);
      if (!images) return fail("Invalid product images.", 400);
    }
    const requestedStatus = input.status;
    if (requestedStatus !== undefined && !["draft", "approved", "rejected", "archived"].includes(String(requestedStatus))) {
      return fail("Status must be draft, approved, rejected, or archived.", 400);
    }

    const currentImageResponse = await requestDb(
      `${supabaseRest("product_images").url}?product_id=eq.${encodeURIComponent(productId)}&select=id,image_url,storage_path,sort_order&order=sort_order.asc`,
      { headers: supabaseRest("product_images").headers }
    );
    if (!currentImageResponse.ok) return fail("Unable to verify product images.", 502);
    const existingImages = await currentImageResponse.json() as ProductImageRow[];
    const finalImages = images ?? existingImages.map((image) => ({ image_url: image.image_url, storage_path: image.storage_path }));
    if (requestedStatus === "approved" && ((update.stock as number | undefined) ?? current.stock) <= 0) return fail("Add positive stock before publishing.", 400);
    if (requestedStatus === "approved" && finalImages.length === 0) return fail("Upload at least one product image before publishing.", 400);

    const response = await requestDb(
      `${db.url}?id=eq.${encodeURIComponent(productId)}&seller_uid=eq.${encodeURIComponent(user.firebaseUid)}&select=${PRODUCT_FIELDS}`,
      { method: "PATCH", headers: { ...db.headers, Prefer: "return=representation" }, body: JSON.stringify({ ...update, ...(requestedStatus ? { status: requestedStatus } : {}) }) }
    );
    if (!response.ok) {
      console.error("Admin product update failed:", response.status);
      return fail(response.status === 409 ? "Product slug already exists." : "Unable to update product.", response.status === 409 ? 409 : 502);
    }
    const rows = await response.json() as ProductRow[];
    const product = rows[0];
    if (!product) return fail("Product could not be updated.", 409);

    if (images) {
      const imagesDb = supabaseRest("product_images");
      const deleteResponse = await requestDb(`${imagesDb.url}?product_id=eq.${encodeURIComponent(productId)}`, { method: "DELETE", headers: imagesDb.headers });
      if (!deleteResponse.ok) return fail("Product details saved, but old images could not be replaced.", 502);
      try {
        await attachImages(db, productId, images);
      } catch {
        return fail("Product details saved, but image records could not be replaced. Reopen and retry image saving.", 502);
      }
    }
    return NextResponse.json({ product: { ...product, images: finalImages } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleAdminError(error);
  }
}
