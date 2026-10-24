"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type Customer = {
  id: string; name: string | null; email: string | null; phone: string | null;
  phoneVerified: boolean; registeredAt: string; updatedAt: string;
  orderCount: number; accountStatus: string;
  recentOrders: { id: string; orderNumber: string; status: string; paymentStatus: string; totalPaise: number; currency: string; createdAt: string }[];
};

async function adminFetch(path: string) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Sign in with your administrator account first.");
  const response = await fetch(path, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to load customer data.");
  return data;
}

function money(paise: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(paise / 100);
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await adminFetch(`/api/admin/customers?q=${encodeURIComponent(appliedQuery)}&page=${page}&pageSize=20`);
      setCustomers(data.customers ?? []); setTotal(data.total ?? 0); setTotalPages(data.totalPages ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load customers.");
    } finally { setLoading(false); }
  }, [appliedQuery, page]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      if (user) void load();
      else { setCustomers([]); setError("Sign in before accessing customer records."); setLoading(false); }
    });
    return unsubscribe;
  }, [load]);

  return <main className="wrap">
    <header className="top"><Link className="brand" href="/">VOOYE</Link><nav className="nav"><Link href="/admin">Overview</Link><Link href="/admin/operations">Operations</Link><Link href="/admin/orders">Orders</Link><Link href="/admin/products">Products</Link></nav></header>
    <section className="section">
      <div className="eyebrow">Private administration</div><h1>Customers</h1>
      <p className="muted">Customer records and recent order history. Personal information is visible only to authorized administrators.</p>
      {error && <p className="notice" role="alert">{error}</p>}
      <form className="row" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedQuery(query.trim()); }}>
        <input aria-label="Search customers" placeholder="Search name, email or account ID" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="submit" disabled={loading}>Search</button>
        <button type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
      </form>
      <p className="muted">{total} customer account(s)</p>
      {loading ? <p role="status">Loading customers…</p> : customers.length === 0 ? <article className="panel">No customers found.</article> : customers.map((customer) => <article className="panel" key={customer.id}>
        <div className="row"><h2>{customer.name || "Name not provided"}</h2><strong>{customer.orderCount} order(s)</strong></div>
        <p>Email: {customer.email || "Not linked"}</p>
        <p>Mobile: {customer.phone || "Not linked"} · {customer.phoneVerified ? "Verified" : "Not verified"}</p>
        <p>Account status: {customer.accountStatus} · Registered: {new Date(customer.registeredAt).toLocaleDateString("en-IN")}</p>
        <h3>Recent orders</h3>
        {customer.recentOrders.length ? customer.recentOrders.map((order) => <p key={order.id}><strong>{order.orderNumber}</strong> — {order.status} / {order.paymentStatus} — {money(order.totalPaise, order.currency)} — {new Date(order.createdAt).toLocaleDateString("en-IN")}</p>) : <p className="muted">No orders yet.</p>}
      </article>)}
      <div className="row"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {Math.max(1, totalPages)}</span><button disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div>
    </section>
  </main>;
}
