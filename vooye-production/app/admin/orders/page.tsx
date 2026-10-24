"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type OrderItem = { id: string; productName: string; quantity: number; unitPricePaise: number; lineTotalPaise: number; seller: { storeName: string; slug: string } };
type Order = {
  id: string; orderNumber: string; status: string; paymentStatus: string; currency: string;
  subtotalPaise: number; shippingPaise: number; totalPaise: number;
  shippingName: string; shippingPhone: string; shippingAddress1: string; shippingAddress2: string | null;
  shippingCity: string; shippingState: string; shippingPostalCode: string; createdAt: string;
  user: { email: string; displayName: string | null }; items: OrderItem[];
};

async function adminFetch(path: string, init: RequestInit = {}) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Sign in with your administrator account first.");
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to process order request.");
  return data;
}
const money = (paise: number, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(paise / 100);

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await adminFetch(`/api/admin/orders?status=${encodeURIComponent(filter)}`);
      setOrders(data.orders ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load orders."); }
    finally { setLoading(false); }
  }, [filter]);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      if (user) void load(); else { setOrders([]); setError("Sign in before accessing orders."); setLoading(false); }
    });
    return unsubscribe;
  }, [load]);
  async function update(order: Order, status: string) {
    if (!window.confirm(`Change order ${order.orderNumber} to ${status.replaceAll("_", " ")}?`)) return;
    setBusyId(order.id); setError(""); setNotice("");
    try {
      await adminFetch("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ order_id: order.id, status }) });
      setNotice(`Order ${order.orderNumber} updated.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Order update failed."); }
    finally { setBusyId(""); }
  }
  const visible = orders.filter((order) => {
    const term = query.trim().toLowerCase();
    return !term || [order.orderNumber, order.user.email, order.user.displayName ?? "", order.shippingName, order.shippingPhone].some((v) => v.toLowerCase().includes(term));
  });
  return <main className="wrap">
    <header className="top"><Link className="brand" href="/">VOOYE</Link><nav className="nav"><Link href="/admin/dashboard">Overview</Link><Link href="/admin/customers">Customers</Link><Link href="/admin/operations">Operations</Link><Link href="/admin/products">Products</Link></nav></header>
    <section className="section"><div className="eyebrow">Private administration</div><h1>Order management</h1>
      <p className="muted">Review payment and fulfilment separately. Payment state is verified by Razorpay callbacks/webhooks and cannot be manually changed here.</p>
      {error && <p className="notice" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      <div className="row"><input aria-label="Search orders" placeholder="Search order, customer, email or phone" value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="Filter by order status" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All order statuses</option><option value="PENDING_PAYMENT">Pending payment</option><option value="PAID">Paid</option><option value="PROCESSING">Processing</option><option value="SHIPPED">Shipped</option><option value="DELIVERED">Delivered</option><option value="CANCELLED">Cancelled</option><option value="REFUND_PENDING">Refund pending</option><option value="REFUNDED">Refunded</option></select><button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
      {loading ? <p role="status">Loading orders…</p> : visible.length === 0 ? <article className="panel">No matching orders.</article> : visible.map((order) => <article className="panel" key={order.id}>
        <div className="row"><h2>{order.orderNumber}</h2><strong>{money(order.totalPaise, order.currency)}</strong></div>
        <p>Order status: <strong>{order.status.replaceAll("_", " ")}</strong> · Payment: <strong>{order.paymentStatus.replaceAll("_", " ")}</strong></p>
        <p>Placed: {new Date(order.createdAt).toLocaleString("en-IN")} · Customer: {order.user.displayName || "Name not provided"} ({order.user.email})</p>
        <p>Ship to: {order.shippingName}, {order.shippingPhone}, {order.shippingAddress1}{order.shippingAddress2 ? `, ${order.shippingAddress2}` : ""}, {order.shippingCity}, {order.shippingState} {order.shippingPostalCode}</p>
        <ul>{order.items.map((item) => <li key={item.id}>{item.productName} × {item.quantity} — {money(item.lineTotalPaise, order.currency)} · {item.seller.storeName}</li>)}</ul>
        <p>Subtotal {money(order.subtotalPaise, order.currency)} · Shipping {money(order.shippingPaise, order.currency)}</p>
        <div className="row">
          {order.status === "PAID" && <button disabled={busyId === order.id} onClick={() => void update(order, "PROCESSING")}>Accept / process</button>}
          {order.status === "PROCESSING" && <button disabled={busyId === order.id} onClick={() => void update(order, "SHIPPED")}>Mark shipped</button>}
          {order.status === "SHIPPED" && <button disabled={busyId === order.id} onClick={() => void update(order, "DELIVERED")}>Mark delivered</button>}
          {["PAID", "PROCESSING", "SHIPPED"].includes(order.status) && <button disabled={busyId === order.id} onClick={() => void update(order, "REFUND_PENDING")}>Flag for refund review</button>}
        </div>
      </article>)}
    </section>
  </main>;
}
