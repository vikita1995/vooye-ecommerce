import { NextRequest, NextResponse } from "next/server";
import {
  apiError,
  handleApiError,
  rateLimitRequest,
  requireUser,
  supabaseRest,
} from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES_PER_PRODUCT = 8;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const STORAGE_BUCKET = "product-images";

type SellerRow = { firebase_uid: string; status: string };
type ProductRow = { id: string; seller_uid: string };
type ProductImageRow = {
  id: string;
  product_id: string;
  storage_path: string;
};

function detectImageType(
  bytes: Uint8Array
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
    bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 &&
    bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function extensionForType(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  return "webp";
}

function storageObjectUrl(baseUrl: string, objectPath: string): string {
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/${STORAGE_BUCKET}/${encodedPath}`;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

export async function POST(request: NextRequest) {
  let uploadedObjectPath: string | null = null;
  let storageBaseUrl: string | null = null;
  let storageHeaders: Record<string, string> | null = null;

  try {
    const user = await requireUser(request);
    const throttled = rateLimitRequest(request, {
      scope: "seller-image-upload",
      key: user.uid,
      limit: 20,
      windowMs: 60_000,
    });
    if (throttled) return throttled;

    const sellerDb = supabaseRest("seller_profiles");
    const sellerResponse = await fetchWithTimeout(
      `${sellerDb.url}?firebase_uid=eq.${encodeURIComponent(user.uid)}&select=firebase_uid,status&limit=1`,
      { headers: sellerDb.headers }
    );
    if (!sellerResponse.ok) return apiError("Unable to verify seller approval.", 502);

    const sellers = (await sellerResponse.json()) as SellerRow[];
    if (!sellers[0] || sellers[0].status !== "approved") {
      return apiError("An approved seller account is required to upload product images.", 403);
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_FILE_BYTES + 128 * 1024) {
      return apiError("Upload is too large. Maximum image size is 5 MB.", 413);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("Send a multipart form with product_id and file.", 400);
    }

    const productIdValue = form.get("product_id");
    const fileValue = form.get("file");
    if (typeof productIdValue !== "string" || !productIdValue.trim() || productIdValue.length > 128) {
      return apiError("A valid product_id is required.", 400);
    }
    if (!(fileValue instanceof File)) {
      return apiError("An image file is required in the file field.", 400);
    }

    const productId = productIdValue.trim();
    if (fileValue.size < 1 || fileValue.size > MAX_FILE_BYTES) {
      return apiError("Image must be larger than 0 bytes and no more than 5 MB.", 413);
    }
    if (!ALLOWED_TYPES.has(fileValue.type)) {
      return apiError("Only JPEG, PNG, and WebP images are allowed.", 415);
    }

    const fileBytes = new Uint8Array(await fileValue.arrayBuffer());
    const detectedType = detectImageType(fileBytes);
    if (!detectedType || detectedType !== fileValue.type) {
      return apiError("File content does not match its declared image type.", 415);
    }

    const productsDb = supabaseRest("products");
    const productResponse = await fetchWithTimeout(
      `${productsDb.url}?id=eq.${encodeURIComponent(productId)}&seller_uid=eq.${encodeURIComponent(user.uid)}&select=id,seller_uid&limit=1`,
      { headers: productsDb.headers }
    );
    if (!productResponse.ok) return apiError("Unable to verify product ownership.", 502);

    const products = (await productResponse.json()) as ProductRow[];
    if (!products[0]) {
      return apiError("Product not found or does not belong to your seller account.", 404);
    }

    const imagesDb = supabaseRest("product_images");
    const countResponse = await fetchWithTimeout(
      `${imagesDb.url}?product_id=eq.${encodeURIComponent(productId)}&select=id&limit=${MAX_IMAGES_PER_PRODUCT + 1}`,
      { headers: { ...imagesDb.headers, Prefer: "count=exact" } }
    );
    if (!countResponse.ok) return apiError("Unable to check the product image limit.", 502);

    const range = countResponse.headers.get("content-range");
    const countMatch = range?.match(/\/(\d+)$/);
    let imageCount: number;
    if (countMatch) {
      imageCount = Number(countMatch[1]);
    } else {
      imageCount = ((await countResponse.json()) as unknown[]).length;
    }
    if (imageCount >= MAX_IMAGES_PER_PRODUCT) {
      return apiError(`A product can have at most ${MAX_IMAGES_PER_PRODUCT} images.`, 409);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return apiError("Image storage is not configured.", 500);

    storageBaseUrl = `${supabaseUrl}/storage/v1/object`;
    storageHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    // Use a server-generated object key, never a client-provided filename.
    const objectPath = `${user.uid}/${productId}/${crypto.randomUUID()}.${extensionForType(detectedType)}`;
    uploadedObjectPath = objectPath;

    const uploadResponse = await fetchWithTimeout(storageObjectUrl(storageBaseUrl, objectPath), {
      method: "POST",
      headers: { ...storageHeaders, "Content-Type": detectedType, "x-upsert": "false" },
      body: fileBytes,
    });
    if (!uploadResponse.ok) {
      console.error("Seller image storage upload failed:", uploadResponse.status);
      uploadedObjectPath = null;
      return apiError("Unable to upload image. Check that the product image storage bucket is configured.", 502);
    }

    const insertResponse = await fetchWithTimeout(`${imagesDb.url}?select=id,product_id,storage_path`, {
      method: "POST",
      headers: { ...imagesDb.headers, Prefer: "return=representation" },
      body: JSON.stringify({ product_id: productId, storage_path: objectPath }),
    });
    if (!insertResponse.ok) {
      try {
        await fetchWithTimeout(storageObjectUrl(storageBaseUrl, objectPath), {
          method: "DELETE",
          headers: storageHeaders,
        });
      } catch {
        console.error("Could not clean up orphaned seller image object.");
      }
      uploadedObjectPath = null;
      console.error("Seller image metadata insert failed:", insertResponse.status);
      return apiError("Image was uploaded but its record could not be saved. Please retry.", 502);
    }

    const rows = (await insertResponse.json()) as ProductImageRow[];
    if (!rows[0]) return apiError("Image record was not returned after upload.", 502);

    uploadedObjectPath = null;
    return NextResponse.json(
      { image: rows[0], content_type: detectedType, size_bytes: fileBytes.byteLength },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (uploadedObjectPath && storageBaseUrl && storageHeaders) {
      try {
        await fetchWithTimeout(storageObjectUrl(storageBaseUrl, uploadedObjectPath), {
          method: "DELETE",
          headers: storageHeaders,
        });
      } catch {
        console.error("Could not clean up image after an unexpected error.");
      }
    }
    return handleApiError(error);
  }
}
