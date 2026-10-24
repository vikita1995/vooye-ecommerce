"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";

type Product = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  price_paise: number;
  stock: number;
  status: string;
  created_at: string;
};

const money = (paise: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(paise / 100);

export default function SellerHome() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", category: "Floor Mirrors", description: "", dimensions: "", price: "", stock: "1" });

  useEffect(() => {
    try {
      return onAuthStateChanged(firebaseAuth(), (nextUser) => {
        setUser(nextUser);
        setAuthReady(true);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Firebase configuration is missing.");
      setAuthReady(true);
    }
  }, []);

  const api = useCallback(async (method: "GET" | "POST", body?: object) => {
    const current = firebaseAuth().currentUser;
    if (!current) throw new Error("Please sign in again.");
    const token = await current.getIdToken();
    const response = await fetch("/api/products", {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; products?: Product[]; product?: Product };
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const result = await api("GET");
      setProducts(result.products ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, [api, user]);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
    } catch {
      setError("Sign-in failed. Check your credentials and confirm this account is enabled in Firebase Authentication.");
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await api("POST", {
        name: form.name,
        category: form.category,
        description: form.description,
        dimensions: form.dimensions,
        price_rupees: Number(form.price),
        stock: Number(form.stock),
      });
      setMessage(result.product ? "Product saved as a draft in the shared catalogue. It is not visible to customers until approved/published." : "Product saved.");
      setForm({ name: "", category: "Floor Mirrors", description: "", dimensions: "", price: "", stock: "1" });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save product.");
    } finally {
      setSaving(false);
    }
  }

  if (!authReady) return <main className="shell"><p>Loading seller portal…</p></main>;

  if (!user) return (
    <main className="shell">
      <header className="topbar"><div className="brand">VOOYE <span className="muted">SELLER</span></div><span className="muted">Seller workspace</span></header>
      <section className="panel" style={{ maxWidth: 480, marginInline: "auto" }}>
        <h1>Seller sign in</h1>
        <p className="muted">Use the Firebase account associated with your seller profile. Seller access requires an approved seller account.</p>
        {error && <p role="alert" className="notice error">{error}</p>}
        <form className="stack" onSubmit={login}>
          <label className="field">Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="field">Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="primary" type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );

  return (
    <main className="shell">
      <header className="topbar">
        <div><div className="brand">VOOYE <span className="muted">SELLER</span></div><p className="muted" style={{ marginBottom: 0 }}>{user.email || "Signed in"}</p></div>
        <div className="actions"><button className="secondary" type="button" onClick={() => void refresh()} disabled={loading}>Refresh products</button><button className="secondary" type="button" onClick={() => void signOut(firebaseAuth())}>Sign out</button></div>
      </header>
      <h1 className="heading">Seller dashboard</h1>
      <p className="muted">Product records are stored in the existing Vooye catalogue. New listings are created as drafts and require approval before appearing in the public shop.</p>
      {error && <p role="alert" className="notice error">{error}</p>}
      {message && <p role="status" className="notice success">{message}</p>}
      <section className="panel">
        <h2>Add a product</h2>
        <form className="stack" onSubmit={createProduct}>
          <div className="formgrid">
            <label className="field">Product name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={3} maxLength={160} required /></label>
            <label className="field">Category<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} minLength={2} maxLength={80} required /></label>
            <label className="field">Price (₹)<input type="number" min="0.01" max="10000000" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label>
            <label className="field">Stock quantity<input type="number" min="0" max="1000000" step="1" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} required /></label>
            <label className="field">Dimensions (optional)<input value={form.dimensions} onChange={(event) => setForm({ ...form, dimensions: event.target.value })} maxLength={200} /></label>
          </div>
          <label className="field">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={5000} rows={4} required /></label>
          <p className="muted">Image upload and product editing are not included in this first slice; they need a dedicated secure API contract.</p>
          <div><button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save as draft"}</button></div>
        </form>
      </section>
      <section>
        <h2 className="heading">Your products</h2>
        {loading && <p>Loading products…</p>}
        {!loading && products.length === 0 && <div className="panel"><p>No products returned. If you are not an approved seller, the API may deny product creation.</p></div>}
        <div className="grid">
          {products.map((product) => <article className="product" key={product.id}>
            <div className="status muted">{product.status.replaceAll("_", " ")}</div>
            <h3>{product.name}</h3>
            <p>{money(product.price_paise)} · Stock: {product.stock}</p>
            <p className="muted">{product.category}</p>
            <p className="muted">{product.description}</p>
          </article>)}
        </div>
      </section>
    </main>
  );
}
