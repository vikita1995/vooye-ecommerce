
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

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

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const applySession = (session: Session | null) => {
      setAuthReady(true);
      if (!session) {
        setToken("");
        setOrders([]);
        setLoading(false);
        return;
      }
      setToken(session.access_token);
    };
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage("Your session could not be verified. Please sign in again.");
      applySession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) applySession(session);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const loadOrders = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/customer/orders", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to load orders.");
      }

      setOrders(data.orders ?? []);
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
          View your purchases and the items included in each order.
        </p>

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
                  <p><strong>{readableStatus(order.status)}</strong></p>
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
