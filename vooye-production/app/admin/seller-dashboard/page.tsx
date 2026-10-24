"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type Listing = {
  id: string; seller_uid: string; name: string; slug: string; category: string;
  price_paise: number; stock: number; status: string; created_at: string; updated_at: string;
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(paise / 100);

export default function AdminSellerDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => onAuthStateChanged(getFirebaseAuth(), (next) => {
    setUser(next);
    setAuthReady(true);
  }), []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/seller-dashboard", {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; products?: Listing[] };
      if (!response.ok) throw new Error(payload.error || "Unable to load seller dashboard.");
      setListings(payload.products ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load seller dashboard.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (authReady && user) void load(); }, [authReady, user, load]);
  useEffect(() => {
    if (authReady && !user) window.location.assign("/admin/login?next=%2Fadmin%2Fseller-dashboard");
  }, [authReady, user]);

  const visible = listings.filter((item) =>
    (filter === "all" || item.status === filter) &&
    [item.name, item.category, item.seller_uid, item.slug].some((value) => value.toLowerCase().includes(query.toLowerCase()))
  );
  const sellers = new Set(listings.map((item) => item.seller_uid)).size;
  const pending = listings.filter((item) => ["draft", "pending_review"].includes(item.status)).length;
  const approved = listings.filter((item) => item.status === "approved").length;

  if (!authReady || !user) return <main className="wrap"><p>Checking administrator access…</p></main>;

  return <main className="wrap">
    <header className="top">
      <Link className="brand" href="/">VOOYE</Link>
      <nav className="nav"><Link href="/admin/products">Product manager</Link><Link href="/">Storefront</Link></nav>
    </header>
    <section className="section">
      <div className="eyebrow">Private administration</div>
      <h1>Seller dashboard</h1>
      <p className="muted">Admin overview of listings across seller accounts. This view is read-only; product publishing and editing remain in the existing product manager.</p>
      {error && <p role="alert" className="notice">{error}</p>}
      <div className="grid" style={{ margin: "24px 0" }}>
        <article className="panel"><div className="eyebrow">Seller accounts represented</div><h2>{sellers}</h2></article>
        <article className="panel"><div className="eyebrow">All listings</div><h2>{listings.length}</h2></article>
        <article className="panel"><div className="eyebrow">Draft / review</div><h2>{pending}</h2></article>
        <article className="panel"><div className="eyebrow">Approved</div><h2>{approved}</h2></article>
      </div>
      <div className="toolbar" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input aria-label="Search seller listings" placeholder="Search product, category, seller UID…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 260, flex: 1, padding: 12 }} />
        <select aria-label="Filter listing status" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: 12 }}>
          <option value="all">All statuses</option><option value="draft">Draft</option><option value="pending_review">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="archived">Archived</option>
        </select>
        <button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      {loading ? <p className="muted">Loading seller listings…</p> : visible.length === 0 ? <p className="notice">No listings match this filter.</p> :
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}>
          <thead><tr>{["Product", "Seller UID", "Status", "Price", "Stock", "Created"].map((heading) => <th key={heading} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid var(--line)" }}>{heading}</th>)}</tr></thead>
          <tbody>{visible.map((item) => <tr key={item.id}>
            <td style={{ padding: 12, borderBottom: "1px solid var(--line)" }}><strong>{item.name}</strong><div className="muted">{item.category} · {item.slug}</div></td>
            <td style={{ padding: 12, borderBottom: "1px solid var(--line)", fontSize: 12, overflowWrap: "anywhere" }}>{item.seller_uid}</td>
            <td style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>{item.status.replaceAll("_", " ")}</td>
            <td style={{ padding: 12, borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{money(item.price_paise)}</td>
            <td style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>{item.stock}</td>
            <td style={{ padding: 12, borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{new Date(item.created_at).toLocaleDateString("en-IN")}</td>
          </tr>)}</tbody>
        </table>}
      <p className="muted" style={{ marginTop: 16 }}>Showing up to 500 latest listings. Seller UID is shown as an identifier; this dashboard does not expose authentication credentials.</p>
    </section>
  </main>;
}
