
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type OrderItem = {
  id: string;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_price: number | string;
  line_total: number | string;
};

type Order = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  subtotal: number | string;
  shipping_amount: number | string;
  discount_amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  placed_at: string | null;
  created_at: string;
  customer_note: string | null;
  items: OrderItem[];
  payment_status?: string;
  invoice_order_id?: string | null;
};

function money(amount: number | string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency.trim(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function readableStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) =>
    letter.toUpperCase()
  );
}

export default function OrdersPage() {
  const [token, setToken] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const [invoiceBusyOrderId, setInvoiceBusyOrderId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
      if (!active) return;
      setAuthReady(true);
      if (!firebaseUser) {
        setToken("");
        setOrders([]);
        setLoading(false);
        return;
      }

      try {
        const idToken = await firebaseUser.getIdToken();
        const response = await fetch("/api/customer/profile", {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok || !data.customer) {
          throw new Error(data.error || "Unable to initialize your customer profile.");
        }
        if (active) {
          setToken(idToken);
          setLoading(false);
        }
      } catch (cause) {
        if (active) {
          setToken("");
          setMessage(cause instanceof Error ? cause.message : "Unable to initialize your customer profile.");
          setLoading(false);
        }
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const loadOrders = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [legacyResult, commerceResult] = await Promise.allSettled([
        fetch("/api/customer/orders", { headers, cache: "no-store" }),
        fetch("/api/customer/commerce-orders", { headers, cache: "no-store" }),
      ]);

      let legacyOrders: Order[] = [];
      let commerceOrders: Order[] = [];
      let legacyError = "Unable to load your saved order history.";
      let commerceError = "Prisma commerce order history is unavailable.";

      if (legacyResult.status === "fulfilled") {
        const response = legacyResult.value;
        const data = await response.json().catch(() => ({}));
        if (response.ok) legacyOrders = data.orders ?? [];
        else legacyError = data.error || legacyError;
      } else {
        legacyError = legacyResult.reason instanceof Error ? legacyResult.reason.message : legacyError;
      }

      if (commerceResult.status === "fulfilled") {
        const response = commerceResult.value;
        const data = await response.json().catch(() => ({}));
        if (response.ok) commerceOrders = data.orders ?? [];
        else commerceError = data.error || commerceError;
      } else {
        commerceError = commerceResult.reason instanceof Error ? commerceResult.reason.message : commerceError;
      }

      if (legacyResult.status === "rejected" && commerceResult.status === "rejected" ||
          legacyOrders.length === 0 && commerceOrders.length === 0 &&
          legacyResult.status === "fulfilled" && !legacyResult.value.ok &&
          commerceResult.status === "fulfilled" && !commerceResult.value.ok) {
        throw new Error(`${legacyError} ${commerceError}`);
      }

      // Keep legacy orders visible while the Prisma commerce model is migrated;
      // prefer the Prisma row for matching order numbers because it supports invoices.
      const merged = new Map<string, Order>();
      for (const order of legacyOrders) merged.set(order.order_number, order);
      for (const order of commerceOrders) merged.set(order.order_number, order);
      setOrders(Array.from(merged.values()).sort((a, b) =>
        new Date(b.placed_at || b.created_at).getTime() -
        new Date(a.placed_at || a.created_at).getTime()
      ));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Unable to load orders."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void loadOrders();
  }, [token, loadOrders]);
  async function downloadInvoice(order: Order) {
    if (!token || !order.invoice_order_id) return;
    setInvoiceBusyOrderId(order.id);
    setInvoiceError("");
    try {
      const response = await fetch(`/api/customer/orders/${encodeURIComponent(order.invoice_order_id)}/invoice`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Unable to download this invoice.");
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `invoice-${order.order_number}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
    } catch (cause) {
      setInvoiceError(cause instanceof Error ? cause.message : "Unable to download this invoice.");
    } finally {
      setInvoiceBusyOrderId(null);
    }
  }


  if (!authReady || (loading && !token)) {
    return (
      <main className="wrap section">
        <p>Loading your account…</p>
      </main>
    );
  }

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <nav className="nav">
          <Link href="/">Shop</Link>
          <Link href="/account">My account</Link>
          <Link href="/account/addresses">My addresses</Link>
        </nav>
      </header>

      <section className="section">
        <div className="eyebrow">Your account</div>
        <h1>Order history</h1>
        <p className="muted">
          View your purchases, payment status, and available invoices.
        </p>
        {invoiceError && <p role="alert" className="notice">{invoiceError}</p>}

        {!token ? (
          <div className="empty">
            <h2>Sign in to view your orders</h2>
            <p className="muted">
              Your order history is available after you sign in.
            </p>
            <Link href="/sign-in">Sign in to your account</Link>
          </div>
        ) : loading ? (
          <p>Loading your orders…</p>
        ) : message ? (
          <div className="empty">
            <p role="alert">{message}</p>
            <button type="button" onClick={() => void loadOrders()}>
              Try again
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="empty">
            <h2>No orders yet</h2>
            <p className="muted">
              When you place an order, it will appear here.
            </p>
            <Link href="/">Browse the store</Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 20, marginTop: 24 }}>
            {orders.map((order) => (
              <article className="empty" key={order.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h2>Order {order.order_number}</h2>
                    <p className="muted">
                      Placed{" "}
                      {new Date(order.placed_at || order.created_at).toLocaleDateString(
                        "en-IN",
                        { day: "numeric", month: "short", year: "numeric" }
                      )}
                    </p>
                  </div>
                  <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
                    <p><strong>{readableStatus(order.status)}</strong>{order.payment_status ? ` · ${readableStatus(order.payment_status)}` : ""}</p>
                    {order.invoice_order_id && (
                      <button type="button" disabled={invoiceBusyOrderId === order.id} onClick={() => void downloadInvoice(order)}>
                        {invoiceBusyOrderId === order.id ? "Preparing invoice…" : "Download invoice PDF"}
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "12px 0",
                        borderTop: "1px solid #e5e0d9",
                      }}
                    >
                      <div>
                        <p><strong>{item.product_name}</strong></p>
                        {item.product_sku && (
                          <p className="muted">SKU: {item.product_sku}</p>
                        )}
                        <p className="muted">
                          Quantity: {item.quantity} ×{" "}
                          {money(item.unit_price, order.currency)}
                        </p>
                      </div>
                      <p>{money(item.line_total, order.currency)}</p>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: "1px solid #e5e0d9", paddingTop: 12 }}>
                  <p>Subtotal: {money(order.subtotal, order.currency)}</p>
                  <p>Shipping: {money(order.shipping_amount, order.currency)}</p>
                  <p>Discount: {money(order.discount_amount, order.currency)}</p>
                  <p>Tax: {money(order.tax_amount, order.currency)}</p>
                  <h3>Total: {money(order.total_amount, order.currency)}</h3>
                </div>

                {order.customer_note && (
                  <p className="muted">Note: {order.customer_note}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
