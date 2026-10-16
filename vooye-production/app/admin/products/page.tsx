"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type ProductStatus = "draft" | "pending_review" | "approved" | "rejected" | "archived";
type ImageInput = { image_url: string; storage_path: string };
type Product = {
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
  images: ImageInput[];
};
type ProductInput = {
  name: string;
  slug: string;
  category: string;
  description: string;
  dimensions: string;
  price_rupees: number;
  stock: number;
  images: ImageInput[];
};

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px",
  border: "1px solid #d7cfc4", borderRadius: 8, background: "#fff",
  color: "#24211d", font: "inherit",
};
const emptyForm = {
  name: "", slug: "", category: "Floor Mirrors", description: "",
  dimensions: "", price: "2999", stock: "250",
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(paise / 100);
const titleCaseStatus = (status: ProductStatus) => status.replaceAll("_", " ");

export default function AdminProductsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState<"all" | ProductStatus>("all");
  const [form, setForm] = useState(emptyForm);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  const authorizedFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const firebaseUser = getFirebaseAuth().currentUser;
    if (!firebaseUser) throw new Error("Please sign in again.");
    const token = await firebaseUser.getIdToken();
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: string; products?: Product[]; product?: Product; image?: ImageInput;
    };
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }, []);

  const loadProducts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const payload = await authorizedFetch(`/api/admin/products?status=${encodeURIComponent(filter)}`);
      setProducts(payload.products ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load product listings.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, filter, user]);

  useEffect(() => {
    if (authReady && user) void loadProducts();
  }, [authReady, user, loadProducts]);

  function newProduct() {
    setEditingId(null);
    setForm(emptyForm);
    setImages([]);
    setFiles([]);
    setError("");
    setMessage("");
  }

  function useStarter(version: "V01" | "V02") {
    const isArch = version === "V01";
    setEditingId(null);
    setImages([]);
    setFiles([]);
    setForm({
      name: isArch ? "V01 Gold Arch Full-Length Mirror with Stand" : "V02 Gold Rounded-Corner Full-Length Mirror with Stand",
      slug: isArch ? "vooye-gold-arched-floor-mirror" : "vooye-gold-rounded-rectangle-floor-mirror",
      category: "Floor Mirrors",
      description: isArch
        ? "Gold-tone arched full-length mirror with a black freestanding support. A statement piece for dressing areas, bedrooms and entryways."
        : "Full-length mirror with softly rounded rectangular corners, a gold-tone edge and a black freestanding support. Designed for dressing areas and bedrooms.",
      dimensions: "",
      price: "2999",
      stock: "250",
    });
    setError("");
    setMessage(`${version} details loaded. Add its photos, then save as a draft.`);
  }

  function editProduct(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      slug: product.slug,
      category: product.category,
      description: product.description,
      dimensions: product.dimensions ?? "",
      price: String(product.price_paise / 100),
      stock: String(product.stock),
    });
    setImages(product.images ?? []);
    setFiles([]);
    setError("");
    setMessage(`Editing ${product.name}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadSelectedFiles(): Promise<ImageInput[]> {
    const uploaded: ImageInput[] = [];
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      const payload = await authorizedFetch("/api/admin/products/upload", { method: "POST", body: formData });
      if (!payload.image) throw new Error(`Upload did not return a storage path for ${file.name}.`);
      uploaded.push(payload.image);
    }
    return uploaded;
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const newImages = await uploadSelectedFiles();
      const allImages = [...images, ...newImages];
      if (allImages.length > 12) throw new Error("A product can have at most 12 images.");
      const payload: ProductInput = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        category: form.category.trim(),
        description: form.description.trim(),
        dimensions: form.dimensions.trim(),
        price_rupees: Number(form.price),
        stock: Number(form.stock),
        images: allImages,
      };
      const result = await authorizedFetch(
        editingId ? "/api/admin/products" : "/api/admin/products",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(editingId ? { product_id: editingId, ...payload } : payload),
        },
      );
      const wasEditing = Boolean(editingId);
      setImages(allImages);
      setFiles([]);
      setEditingId(result.product?.id ?? editingId);
      await loadProducts();
      setMessage(wasEditing
        ? "Product changes saved."
        : "Product saved as a draft. It is not visible in the public shop until you publish it.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the product.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(product: Product, status: "approved" | "draft" | "archived") {
    const verb = status === "approved" ? "publish" : status === "archived" ? "archive" : "unpublish";
    const confirmation = status === "approved"
      ? `Publish "${product.name}" at ${money(product.price_paise)} with stock ${product.stock}? It will become visible in the public shop.`
      : `${verb.charAt(0).toUpperCase() + verb.slice(1)} "${product.name}"?`;
    if (!window.confirm(confirmation)) return;
    setBusyProductId(product.id);
    setError("");
    setMessage("");
    try {
      await authorizedFetch("/api/admin/products", {
        method: "PATCH",
        body: JSON.stringify({ product_id: product.id, status }),
      });
      setMessage(status === "approved" ? `Published ${product.name}.` : `${product.name} updated to ${status}.`);
      await loadProducts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update product status.");
    } finally {
      setBusyProductId(null);
    }
  }

  if (!authReady) return <main className="wrap"><p>Checking sign-in…</p></main>;
  if (!user) {
    return (
      <main className="wrap">
        <header className="top"><Link className="brand" href="/">VOOYE</Link><Link href="/sign-in?next=%2Fadmin%2Fproducts">Sign in</Link></header>
        <section className="section"><h1>Vooye product manager</h1><p className="muted">Sign in with the owner/admin account to manage your catalogue.</p><Link href="/sign-in?next=%2Fadmin%2Fproducts">Go to sign in →</Link></section>
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <nav className="nav"><Link href="/">Storefront</Link><Link href="/cart">Cart</Link><Link href="/account">My account</Link></nav>
      </header>
      <section className="section">
        <div className="eyebrow">Official Vooye catalogue</div>
        <h1>Product manager</h1>
        <p className="muted">Manage prices, stock, descriptions and product photos directly. Seller applications and seller portal are not used for this catalogue.</p>
        <p className="notice">New products are saved as drafts. Publishing makes them visible in the shop; checkout remains separately controlled.</p>

        {message && <p role="status" className="notice">{message}</p>}
        {error && <p role="alert" className="notice">{error}</p>}

        <div className="toolbar">
          <div className="actions">
            <button type="button" onClick={() => useStarter("V01")}>Load V01 mirror details</button>
            <button type="button" onClick={() => useStarter("V02")}>Load V02 mirror details</button>
            <button type="button" onClick={newProduct}>New product</button>
          </div>
          <label>Show{" "}
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="all">All listings</option>
              <option value="draft">Drafts</option>
              <option value="approved">Published</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
              <option value="pending_review">Pending review</option>
            </select>
          </label>
        </div>

        <div className="product-form panel">
          <h2>{editingId ? "Edit product" : "Add a product"}</h2>
          <form className="stack" onSubmit={saveProduct}>
            <label className="field">Product name *
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} minLength={3} maxLength={160} required />
            </label>
            <label className="field">Product URL slug *
              <input style={inputStyle} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} minLength={3} maxLength={80} pattern="[A-Za-z0-9-]+" required />
            </label>
            <div className="two-cols">
              <label className="field">Category *
                <input style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={80} required />
              </label>
              <label className="field">Price (₹) *
                <input style={inputStyle} type="number" min="0.01" max="10000000" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </label>
              <label className="field">Stock quantity *
                <input style={inputStyle} type="number" min="0" max="1000000" step="1" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
              </label>
              <label className="field">Dimensions (optional)
                <input style={inputStyle} value={form.dimensions} onChange={(e) => setForm({ ...form, dimensions: e.target.value })} maxLength={200} placeholder="e.g. 152 × 46 cm" />
              </label>
            </div>
            <label className="field">Description *
              <textarea style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} minLength={1} maxLength={5000} rows={4} required />
            </label>
            <label className="field">Product photos (JPG, PNG or WebP; up to 10 MB each)
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            </label>
            {files.length > 0 && <p className="muted">New photos selected: {files.map((file) => file.name).join(", ")}</p>}
            {images.length > 0 && (
              <div>
                <p className="muted">Saved photos ({images.length}) — remove any you don't need:</p>
                <div className="image-list">
                  {images.map((image, index) => (
                    <div className="image-chip" key={image.storage_path}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.image_url} alt={`Product photo ${index + 1}`} />
                      <button type="button" onClick={() => setImages((old) => old.filter((candidate) => candidate.storage_path !== image.storage_path))}>Remove photo</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="actions">
              <button type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Save as draft"}</button>
              {editingId && <button type="button" onClick={newProduct} disabled={saving}>Cancel edit</button>}
            </div>
          </form>
        </div>

        <div className="toolbar"><h2>Product listings</h2><button type="button" onClick={() => void loadProducts()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
        {loading && <p role="status">Loading catalogue…</p>}
        {!loading && products.length === 0 && <div className="panel"><h3>No listings in this filter</h3><p className="muted">Use one of the V01/V02 starter buttons, add product photos, and save the listing as a draft.</p></div>}
        <div className="grid">
          {products.map((product) => (
            <article className="panel" key={product.id}>
              {product.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.images[0].image_url} alt={product.name} style={{ width: "100%", height: 250, objectFit: "contain", background: "#eee6db" }} />
              ) : <div className="notice">No product photo yet. Edit the listing to add images.</div>}
              <div className="seller-heading"><h3>{product.name}</h3><span className={`badge status-${product.status}`}>{titleCaseStatus(product.status)}</span></div>
              <p className="price">{money(product.price_paise)}</p>
              <p className="muted">Stock: {product.stock} · {product.category}</p>
              <p className="muted">Slug: {product.slug}</p>
              <div className="actions">
                <button type="button" onClick={() => editProduct(product)}>Edit</button>
                {product.status !== "approved" && <button type="button" disabled={busyProductId === product.id} onClick={() => void changeStatus(product, "approved")}>Publish</button>}
                {product.status === "approved" && <button type="button" disabled={busyProductId === product.id} onClick={() => void changeStatus(product, "draft")}>Unpublish</button>}
                {product.status !== "archived" && <button type="button" disabled={busyProductId === product.id} onClick={() => void changeStatus(product, "archived")}>Archive</button>}
              </div>
            </article>
          ))}
        </div>
      </section>
      <style jsx>{`
        .toolbar,.actions,.seller-heading{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
        .toolbar{justify-content:space-between;margin:1.5rem 0}
        .seller-heading{justify-content:space-between;align-items:flex-start}
        .seller-heading h3{margin:0;flex:1}
        .actions button,.toolbar button{padding:.65rem 1rem;cursor:pointer}
        .product-form{margin-top:1.5rem;margin-bottom:2.5rem}
        .two-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
        .image-list{display:flex;gap:.75rem;flex-wrap:wrap}
        .image-chip{width:150px;border:1px solid #ddd;padding:.5rem;display:grid;gap:.5rem}
        .image-chip img{height:130px;width:100%;object-fit:contain;background:#eee6db}
        .image-chip button{font-size:.8rem}
        button:disabled{opacity:.55;cursor:wait}
        @media(max-width:700px){.two-cols{grid-template-columns:1fr}.toolbar{align-items:flex-start;flex-direction:column}.image-chip{width:calc(50% - .75rem)}}
      `}</style>
    </main>
  );
}
