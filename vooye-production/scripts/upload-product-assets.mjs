import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "vooye-products";

if (!process.argv[2]) {
  console.error('Usage: node scripts/upload-product-assets.mjs "<extracted-products-folder>"');
  process.exit(2);
}
if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY. Set these locally; never commit or share the service-role key.");
  process.exit(2);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolute);
    if (entry.isFile()) return [absolute];
    return [];
  }));
  return nested.flat();
}

function contentType(filename) {
  switch (path.extname(filename).toLowerCase()) {
    case ".webp": return "image/webp";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".png": return "image/png";
    default: return null;
  }
}

const files = (await listFiles(root)).filter((file) => contentType(file));
if (files.length !== 5) {
  console.error(`Expected 5 supported image files in ${root}; found ${files.length}. Check that you extracted the supplied product ZIP and passed its products/ folder.`);
  process.exit(2);
}

for (const file of files.sort()) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  const objectPath = `products/${relative}`;
  const { error } = await supabase.storage.from(bucket).upload(objectPath, await readFile(file), {
    contentType: contentType(file) ?? "application/octet-stream",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) {
    console.error(`Upload failed for ${objectPath}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Uploaded ${objectPath}`);
}

console.log(`Uploaded ${files.length} product images to the ${bucket} bucket. Product records remain unpublished until the guarded SQL import runs.`);
