import "server-only";

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
  status: string;
  created_at: string;
};

type SellerRow = {
  firebase_uid: string;
  store_name: string;
  status: string;
};

type ProductImageRow = {
  product_id: string;
  image_url: string | null;
  storage_path: string;
  sort_order: number;
};

export type PublishedCatalogProduct = {
  id: string;
  sellerUid: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  dimensions: string | null;
  pricePaise: number;
  stock: number;
  imageUrl: string | null;
  images: string[];
  sellerStoreName: string;
};

function config() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error("PUBLIC_CATALOG_CONFIG_MISSING");
  return { baseUrl, key };
}

async function readRows<T>(table: string, params: Record<string, string>): Promise<T[]> {
  const { baseUrl, key } = config();
  const search = new URLSearchParams(params);
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${search.toString()}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    console.error("Public catalogue query failed", { table, status: response.status });
    throw new Error("PUBLIC_CATALOG_QUERY_FAILED");
  }
  return await response.json() as T[];
}

function publicImageUrl(image: ProductImageRow, baseUrl: string) {
  if (image.image_url && /^https?:\/\//i.test(image.image_url)) return image.image_url;
  const path = image.storage_path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/storage/v1/object/public/vooye-products/${path}`;
}

async function getImages(products: ProductRow[]): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (products.length === 0) return grouped;
  const { baseUrl } = config();
  const ids = products.map((product) => product.id);
  const rows = await readRows<ProductImageRow>("product_images", {
    select: "product_id,image_url,storage_path,sort_order",
    product_id: `in.(${ids.join(",")})`,
    order: "sort_order.asc",
  });
  for (const row of rows) {
    const current = grouped.get(row.product_id) ?? [];
    current.push(publicImageUrl(row, baseUrl));
    grouped.set(row.product_id, current);
  }
  return grouped;
}

/**
 * Read the published catalogue from the same Supabase tables used by the
 * seller/admin product APIs. Only approved listings from approved sellers
 * with positive stock are returned.
 */
export async function getPublishedProducts(): Promise<PublishedCatalogProduct[]> {
  const [products, sellers] = await Promise.all([
    readRows<ProductRow>("products", {
      select: "id,seller_uid,slug,name,category,description,dimensions,price_paise,stock,status,created_at",
      status: "eq.approved",
      stock: "gt.0",
      order: "created_at.desc",
      limit: "60",
    }),
    readRows<SellerRow>("seller_profiles", {
      select: "firebase_uid,store_name,status",
      status: "eq.approved",
    }),
  ]);
  const sellerByUid = new Map(sellers.map((seller) => [seller.firebase_uid, seller]));
  const visible = products.filter((product) => sellerByUid.has(product.seller_uid) && product.stock > 0);
  const imagesByProduct = await getImages(visible);
  return visible.map((product) => {
    const seller = sellerByUid.get(product.seller_uid);
    return {
      id: product.id,
      sellerUid: product.seller_uid,
      slug: product.slug,
      name: product.name,
      category: product.category,
      description: product.description,
      dimensions: product.dimensions,
      pricePaise: product.price_paise,
      stock: product.stock,
      imageUrl: imagesByProduct.get(product.id)?.[0] ?? null,
      images: imagesByProduct.get(product.id) ?? [],
      sellerStoreName: seller?.store_name ?? "Vooye",
    };
  });
}

export async function getPublishedProductBySlug(slug: string): Promise<PublishedCatalogProduct | null> {
  const [products, sellers] = await Promise.all([
    readRows<ProductRow>("products", {
      select: "id,seller_uid,slug,name,category,description,dimensions,price_paise,stock,status,created_at",
      slug: `eq.${slug}`,
      status: "eq.approved",
      stock: "gt.0",
      limit: "1",
    }),
    readRows<SellerRow>("seller_profiles", {
      select: "firebase_uid,store_name,status",
      status: "eq.approved",
    }),
  ]);
  const product = products[0];
  if (!product) return null;
  const seller = sellers.find((candidate) => candidate.firebase_uid === product.seller_uid);
  if (!seller || product.stock <= 0) return null;
  const imagesByProduct = await getImages([product]);
  const images = imagesByProduct.get(product.id) ?? [];
  return {
    id: product.id,
    sellerUid: product.seller_uid,
    slug: product.slug,
    name: product.name,
    category: product.category,
    description: product.description,
    dimensions: product.dimensions,
    pricePaise: product.price_paise,
    stock: product.stock,
    imageUrl: images[0] ?? null,
    images,
    sellerStoreName: seller.store_name,
  };
}
