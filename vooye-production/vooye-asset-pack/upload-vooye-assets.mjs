import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const assetRoot = path.join(root, 'vooye-asset-pack', 'assets');

function readEnvFile(file) {
  try {
    const content = requireText(fs.readFile(file, 'utf8'));
    return content;
  } catch {
    return Promise.resolve('');
  }
}
async function requireText(promise) { return await promise; }
function parseEnv(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}

const env = { ...parseEnv(await readEnvFile(path.join(root, '.env'))), ...parseEnv(await readEnvFile(path.join(root, '.env.local'))), ...process.env };
const supabaseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || 'https://cpoitylvklkcrclsaxem.supabase.co').replace(/\/$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_KEY;
if (!key) {
  console.error('Missing server-side Supabase key. Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in the local .env file. Never use a NEXT_PUBLIC_ key for this upload.');
  process.exit(1);
}

const files = [
  { local: 'brand/vooye-logo.png', remote: 'brand/vooye-logo.png', type: 'image/png' },
  ...[
    '01-front-angle.jpeg',
    '02-side-angle.jpeg',
    '03-front-view.jpeg',
    '04-angled-view.jpeg',
    '05-room-view.jpeg',
    '06-room-view.jpeg',
  ].map((name, index) => ({
    local: `products/arched-gold-floor-mirror/${name}`,
    remote: `products/arched-gold-floor-mirror/${String(index + 1).padStart(2, '0')}-${name.replace(/^\d+-/, '')}`,
    type: 'image/jpeg',
  })),
];

const bucket = 'vooye-products';
const uploaded = [];
for (const file of files) {
  const diskPath = path.join(assetRoot, file.local);
  const body = await fs.readFile(diskPath);
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${file.remote.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': file.type,
      'Cache-Control': '3600',
      'x-upsert': 'true',
    },
    body,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`Upload failed for ${file.remote}: HTTP ${response.status} ${detail.slice(0, 500)}`);
    process.exit(1);
  }
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${file.remote.split('/').map(encodeURIComponent).join('/')}`;
  const verify = await fetch(publicUrl, { method: 'HEAD' });
  if (!verify.ok) {
    console.error(`Uploaded ${file.remote}, but public URL verification returned HTTP ${verify.status}. Check bucket visibility and policies.`);
    process.exit(1);
  }
  uploaded.push({ path: file.remote, publicUrl, bytes: body.length });
  console.log(`Uploaded and verified: ${file.remote} (${body.length} bytes)`);
}

const manifest = {
  product: {
    slug: 'arched-gold-floor-mirror',
    name: 'Gold Arched Full-Length Floor Mirror',
    category: 'Full-Length Mirrors',
    description: 'Full-length arched mirror with a slim gold-tone frame and freestanding black support. Product photography shows multiple angles in a bright interior setting.',
    priceRupees: null,
    stock: null,
    note: 'Set the selling price and stock count before creating/publishing the product listing.',
  },
  logoUrl: uploaded.find((item) => item.path === 'brand/vooye-logo.png')?.publicUrl,
  images: uploaded.filter((item) => item.path.startsWith('products/')),
};
const manifestPath = path.join(root, 'vooye-asset-pack', 'uploaded-assets-manifest.json');
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\nAll ${uploaded.length} objects uploaded. Manifest written to ${manifestPath}`);
console.log('This script uploads assets only; it does not insert a product row or publish a listing. Enter product price/stock and connect the approved seller before publishing.');
