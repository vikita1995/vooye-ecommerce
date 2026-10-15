
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Tab = "sellers" | "products" | "orders";

type Seller = {
  firebase_uid: string;
  store_name: string;
  store_slug: string;
  description: string | null;
  support_email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
};

type Product = {
  id: string;
  seller_uid: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  price_paise: number;
  stock: number;
  status: string;
  created_at: string;
};

type OrderItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  seller: { storeName: string; slug: string };
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  shippingName: string;
  shippingPhone: string;
  shippingAddress1: string;
  shippingAddress2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  createdAt: string;
  user: { email: string; displayName: string | null };
  items: OrderItem[];
};

async function authorizedFetch(
  path: string,
  init: RequestInit = {}
) {
  const { data: { session }, error: sessionError } = await createClient().auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("Sign in with your administrator account first.");
  }
  const token = session.access_token;

  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session expired. Sign in again.");
    }

    if (response.status === 403) {
      throw new Error("This account is not authorized for administration.");
    }

    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "The request could not be completed."
    );
  }

  return data;
}

function money(paise: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(paise / 100);
}

function date(value: string) {
  return new Date(value).toLocaleString("en-IN");
}

export default function AdminPortal() {
  const [tab, setTab] = useState<Tab>("sellers");
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("draft");
  const [sellerFilter, setSellerFilter] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (tab === "sellers") {
        const data = await authorizedFetch(
          `/api/admin/sellers?status=${sellerFilter}`
        );
        setSellers(data.applications ?? []);
      } else if (tab === "products") {
        const data = await authorizedFetch(
          `/api/admin/products?status=${productFilter}`
        );
        setProducts(data.products ?? []);
      } else {
        const data = await authorizedFetch(
          `/api/admin/orders?status=${orderFilter}`
        );
        setOrders(data.orders ?? []);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load data."
      );
    } finally {
      setLoading(false);
    }
  }, [tab, sellerFilter, productFilter, orderFilter]);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void supabase.auth.getSession().then((result: Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getSession"]>>) => {
      const { data, error: sessionError } = result;
      if (!active) return;
      if (sessionError) setError("Unable to verify your sign-in session.");
      if (data.session) void loadData();
      else setError("Sign in before accessing the admin console.");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!active) return;
      if (session) {
        void loadData();
      } else {
        setError("Sign in before accessing the admin console.");
        setSellers([]);
        setProducts([]);
        setOrders([]);
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [loadData]);

  async function reviewSeller(
    seller: Seller,
    status: "approved" | "rejected"
  ) {
    setBusyId(seller.firebase_uid);
    setError("");
    setNotice("");

    try {
      await authorizedFetch("/api/admin/sellers", {
        method: "PATCH",
        body: JSON.stringify({
          firebase_uid: seller.firebase_uid,
          status,
        }),
      });

      setNotice(`Seller application ${status}.`);
      await loadData();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Review failed."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function moderateProduct(
    product: Product,
    status: "active" | "hidden"
  ) {
    setBusyId(product.id);
    setError("");
    setNotice("");

    try {
      await authorizedFetch("/api/admin/products", {
        method: "PATCH",
        body: JSON.stringify({
          product_id: product.id,
          status,
        }),
      });

      setNotice(`Product ${status === "active" ? "approved" : "hidden"}.`);
      await loadData();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Moderation failed."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function updateOrder(order: Order, status: string) {
    setBusyId(order.id);
    setError("");
    setNotice("");

    try {
      await authorizedFetch("/api/admin/orders", {
        method: "PATCH",
        body: JSON.stringify({
          order_id: order.id,
          status,
        }),
      });

      setNotice(`Order ${order.orderNumber} updated to ${status}.`);
      await loadData();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Order update failed."
      );
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "sellers", label: "Seller applications" },
    { id: "products", label: "Products" },
    { id: "orders", label: "Orders" },
  ];

  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">VOOYE</Link>
        <nav className="nav">
          <Link href="/">Storefront</Link>
          <Link href="/seller">Seller portal</Link>
        </nav>
      </header>

      <section className="section">
        <div className="eyebrow">Operations</div>
        <h1>Admin console</h1>
        <p className="muted">
          Review seller applications, moderate product listings and manage
          order fulfillment.
        </p>

        <div className="notice">
          Access is verified by protected server APIs on every request.
          Signing in or opening this page does not grant administrator access.
        </div>

        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}

        <div className="grid">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className="panel"
              aria-pressed={tab === item.id}
              onClick={() => {
                setTab(item.id);
                setError("");
                setNotice("");
              }}
            >
              <strong>{item.label}</strong>
              <p>{tab === item.id ? "Currently selected" : "Open section"}</p>
            </button>
          ))}
        </div>

        <div className="panel">
          <div className="row">
            <h2>
              {tabs.find((item) => item.id === tab)?.label}
            </h2>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {tab === "sellers" && (
            <>
              <label>
                Application status{" "}
                <select
                  value={sellerFilter}
                  onChange={(event) => setSellerFilter(event.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All</option>
                </select>
              </label>

              {sellers.length === 0 && !loading && <p>No applications found.</p>}

              {sellers.map((seller) => (
                <article className="panel" key={seller.firebase_uid}>
                  <h3>{seller.store_name}</h3>
                  <p>Status: {seller.status}</p>
                  <p>Store slug: {seller.store_slug}</p>
                  <p>{seller.description || "No description provided."}</p>
                  <p>Contact: {seller.support_email || "—"} · {seller.phone || "—"}</p>
                  <p>Applied: {date(seller.created_at)}</p>

                  {seller.status === "pending" && (
                    <div className="row">
                      <button
                        disabled={busyId === seller.firebase_uid}
                        onClick={() => void reviewSeller(seller, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        disabled={busyId === seller.firebase_uid}
                        onClick={() => void reviewSeller(seller, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </>
          )}

          {tab === "products" && (
            <>
              <label>
                Product status{" "}
                <select
                  value={productFilter}
                  onChange={(event) => setProductFilter(event.target.value)}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="hidden">Hidden</option>
                  <option value="all">All</option>
                </select>
              </label>

              {products.length === 0 && !loading && <p>No products found.</p>}

              {products.map((product) => (
                <article className="panel" key={product.id}>
                  <h3>{product.name}</h3>
                  <p>Category: {product.category} · Status: {product.status}</p>
                  <p>Price: {money(product.price_paise)}</p>
                  <p>Stock: {product.stock}</p>
                  <p>{product.description}</p>
                  <p>Created: {date(product.created_at)}</p>

                  <div className="row">
                    {product.status !== "active" && (
                      <button
                        disabled={busyId === product.id}
                        onClick={() => void moderateProduct(product, "active")}
                      >
                        Approve / Activate
                      </button>
                    )}
                    {product.status !== "hidden" && (
                      <button
                        disabled={busyId === product.id}
                        onClick={() => void moderateProduct(product, "hidden")}
                      >
                        Hide
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </>
          )}

          {tab === "orders" && (
            <>
              <label>
                Order status{" "}
                <select
                  value={orderFilter}
                  onChange={(event) => setOrderFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="PENDING_PAYMENT">Pending payment</option>
                  <option value="PAID">Paid</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="SHIPPED">Shipped</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="REFUND_PENDING">Refund pending</option>
                  <option value="REFUNDED">Refunded</option>
                </select>
              </label>

              {orders.length === 0 && !loading && <p>No orders found.</p>}

              {orders.map((order) => (
                <article className="panel" key={order.id}>
                  <h3>Order {order.orderNumber}</h3>
                  <p>Order status: {order.status}</p>
                  <p>Payment status: {order.paymentStatus}</p>
                  <p>
                    Customer: {order.user.displayName || "Customer"} ·{" "}
                    {order.user.email}
                  </p>
                  <p>
                    Total: {money(order.totalPaise, order.currency)} ·{" "}
                    {date(order.createdAt)}
                  </p>
                  <p>
                    Ship to: {order.shippingName}, {order.shippingAddress1}
                    {order.shippingAddress2 ? `, ${order.shippingAddress2}` : ""},
                    {" "}{order.shippingCity}, {order.shippingState}{" "}
                    {order.shippingPostalCode}
                  </p>

                  <ul>
                    {order.items.map((item) => (
                      <li key={item.id}>
                        {item.productName} × {item.quantity} —{" "}
                        {money(item.lineTotalPaise, order.currency)}
                        {" "}({item.seller.storeName})
                      </li>
                    ))}
                  </ul>

                  <div className="row">
                    {order.status === "PAID" && (
                      <button
                        disabled={busyId === order.id}
                        onClick={() => void updateOrder(order, "PROCESSING")}
                      >
                        Start processing
                      </button>
                    )}
                    {order.status === "PROCESSING" && (
                      <button
                        disabled={busyId === order.id}
                        onClick={() => void updateOrder(order, "SHIPPED")}
                      >
                        Mark shipped
                      </button>
                    )}
                    {order.status === "SHIPPED" && (
                      <button
                        disabled={busyId === order.id}
                        onClick={() => void updateOrder(order, "DELIVERED")}
                      >
                        Mark delivered
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
