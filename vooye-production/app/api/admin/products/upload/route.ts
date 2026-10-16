import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireFirebaseAdmin } from "@/lib/firebase/require-admin";
import { apiError } from "@/lib/seller-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  try {
    const user = await requireFirebaseAdmin(request);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return apiError("Image storage is not configured on the server.", 500);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("Choose an image file to upload.", 400);
    }
    const raw = form.get("file");
    if (!(raw instanceof File)) return apiError("Choose an image file.", 400);
    if (!MIME_EXTENSIONS[raw.type]) return apiError("Use a JPG, PNG or WebP image.", 400);
    if (raw.size < 1 || raw.size > MAX_IMAGE_BYTES) return apiError("Each image must be smaller than 10 MB.", 413);

    const bytes = Buffer.from(await raw.arrayBuffer());
    if (bytes.length < 4) return apiError("The image file is invalid.", 400);
    // Validate common file signatures so MIME labels alone cannot disguise an arbitrary upload.
    const signatureValid = raw.type === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : raw.type === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
    if (!signatureValid) return apiError("The selected file is not a valid image of the declared type.", 400);

    const extension = MIME_EXTENSIONS[raw.type];
    const safeBase = raw.name.replace(/\.[^.]+$/, "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "product-image";
    const storagePath = `products/${user.firebaseUid}/${safeBase}-${crypto.randomUUID()}.${extension}`;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "vooye-products";
    const upload = await fetch(`${url}/storage/v1/object/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": raw.type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-upsert": "false",
      },
      body: bytes,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!upload.ok) {
      const detail = await upload.text().catch(() => "");
      console.error("Product image upload failed", { status: upload.status, detail: detail.slice(0, 300) });
      return apiError("Image upload failed. Check the Storage bucket configuration and try again.", 502);
    }
    return NextResponse.json({
      image: {
        image_url: `${url}/storage/v1/object/public/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`,
        storage_path: storagePath,
      },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (message === "Authentication required" || message === "Authentication invalid or expired") return apiError("Please sign in again.", 401);
    if (message === "Forbidden") return apiError("Owner/admin access is required.", 403);
    console.error("Product image upload error:", message || "Unknown error");
    return apiError("Unable to upload the product image.", 500);
  }
}
