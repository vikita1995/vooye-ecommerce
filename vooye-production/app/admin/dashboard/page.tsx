"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type Metrics = { newOrders: number; paidOnline: number; pendingPayments: number; failedPayments: number; processing: number; shipped: number; delivered: number; cancelled: number; totalSalesPaise: number; currency: string };

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/metrics", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to load dashboard.");
      setMetrics(data.metrics);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load dashboard."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      if (user) void load(); else { setError("Sign in with an administrator account."); setLoading(false); }
    });
    return unsubscribe;
  }, [load]);
  const cards: [string, keyof Metrics][] = [["New / unpaid orders", "newOrders"], ["Successful online payments", "paidOnline"], ["Pending payments", "pendingPayments"], ["Failed payments", "failedPayments"], ["Awaiting processing", "processing"], ["Shipped / in transit", "shipped"], ["Delivered", "delivered"], ["Cancelled", "cancelled"]];
  const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
  return <main className="wrap">
    <header className="top"><Link className="brand" href="/">VOOYE</Link><nav className="nav"><Link href="/admin/customers">Customers</Link><Link href="/admin/operations">Operations</Link><Link href="/admin/orders">Orders</Link><Link href="/admin/products">Products</Link></nav></header>
    <section className="section"><div className="eyebrow">Private administration</div><h1>Admin overview</h1><p className="muted">Live order and payment summaries from the commerce database. COD is not enabled.</p>
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="grid">{cards.map(([label, key]) => <article className="panel" key={key}><p className="eyebrow">{label}</p><h2>{loading ? "…" : metrics?.[key]}</h2></article>)}</div>
      <article className="panel"><p className="eyebrow">Captured online sales less fully refunded orders</p><h2>{loading || !metrics ? "…" : money(metrics.totalSalesPaise)}</h2><p className="muted">This summary uses recorded captured-payment statuses; reconcile with Razorpay before accounting use.</p><button onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh metrics"}</button></article>
      <div className="grid"><Link className="panel" href="/admin/customers"><h2>Customer management →</h2><p>Search accounts and view recent orders.</p></Link><Link className="panel" href="/admin/operations"><h2>Order operations →</h2><p>Review order fulfilment and existing admin operations.</p></Link></div>
    </section>
  </main>;
}
