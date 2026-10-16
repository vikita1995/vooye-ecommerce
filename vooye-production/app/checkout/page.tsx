"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { readCart, writeCart, type CartItem } from "@/components/add-to-cart";

type Address = {
  id: string;
  address_type: "shipping" | "billing" | string;
  recipient_name: string;
  phone_e164: string;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
};

type CheckoutStatus = { enabled: boolean; message: string };
type OrderCreated = {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
};
type RazorpayResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (result: RazorpayResult) => void | Promise<void>;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on?: (event: "payment.failed", handler: (response: { error?: { description?: string } }) => void) => void;
    };
  }
}

const SELECTED_ADDRESS_KEY = "vooye-selected-shipping-address-v1";

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const syncCart = useCallback(() => {
    setItems(readCart());
  }, []);

  useEffect(() => {
    syncCart();
    window.addEventListener("storage", syncCart);
    window.addEventListener("vooye-cart-updated", syncCart);
    return () => {
      window.removeEventListener("storage", syncCart);
      window.removeEventListener("vooye-cart-updated", syncCart);
    };
  }, [syncCart]);

  useEffect(() => {
    let active = true;
    void fetch("/api/checkout/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: CheckoutStatus) => {
        if (active) setCheckoutStatus(data);
      })
      .catch(() => {
        if (active) setCheckoutStatus({
          enabled: false,
          message: "Checkout readiness could not be verified. Please try again later.",
        });
      });

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
      if (!active) return;
      setAuthReady(true);
      setSignedIn(Boolean(firebaseUser));
      if (!firebaseUser) {
        setAddresses([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const idToken = await firebaseUser.getIdToken();
        const profileResponse = await fetch("/api/customer/profile", {
          headers: { Authorization: "Bearer " + idToken },
          cache: "no-store",
        });
        const profileData = await profileResponse.json();
        if (!profileResponse.ok || !profileData.customer) {
          throw new Error(profileData.error || "Unable to load your customer profile.");
        }

        const response = await fetch("/api/customer/addresses", {
          headers: { Authorization: "Bearer " + idToken },
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load your saved addresses.");

        if (!active) return;
        const allAddresses = (data.addresses ?? []) as Address[];
        const shippingAddresses = allAddresses.filter((address) => address.address_type === "shipping");
        setAddresses(shippingAddresses);

        const storedId = window.localStorage.getItem(SELECTED_ADDRESS_KEY) ?? "";
        const validStored = shippingAddresses.some((address) => address.id === storedId);
        const chosen = validStored ? storedId : (shippingAddresses[0]?.id ?? "");
        setSelectedAddressId(chosen);
        if (chosen) window.localStorage.setItem(SELECTED_ADDRESS_KEY, chosen);
        else window.localStorage.removeItem(SELECTED_ADDRESS_KEY);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load checkout details.");
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const selectedAddress = addresses.find((address) => address.id === selectedAddressId) ?? null;
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0),
    [items],
  );

  function chooseAddress(id: string) {
    setSelectedAddressId(id);
    if (id) window.localStorage.setItem(SELECTED_ADDRESS_KEY, id);
    else window.localStorage.removeItem(SELECTED_ADDRESS_KEY);
  }

  async function startPayment() {
    setError("");
    setMessage("");

    if (!signedIn) {
      router.push("/sign-in?next=%2Fcheckout");
      return;
    }
    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }
    if (!selectedAddress) {
      setError("Select a saved shipping address before continuing.");
      return;
    }
    if (!checkoutStatus?.enabled) {
      setError(checkoutStatus?.message || "Checkout is temporarily unavailable.");
      return;
    }
    if (!razorpayReady || !window.Razorpay) {
      setError("Secure payment is still loading. Wait a moment and try again.");
      return;
    }

    setBusy(true);
    try {
      const currentUser = getFirebaseAuth().currentUser;
      if (!currentUser) throw new Error("Please sign in again.");
      const token = await currentUser.getIdToken();
      const address2 = [selectedAddress.address_line2, selectedAddress.landmark, selectedAddress.locality]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(", ")
        .slice(0, 200);

      const createResponse = await fetch("/api/payments/razorpay/order", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
          shipping: {
            name: selectedAddress.recipient_name,
            phone: selectedAddress.phone_e164,
            address1: selectedAddress.address_line1,
            address2,
            city: selectedAddress.city,
            state: selectedAddress.state,
            postalCode: selectedAddress.postal_code,
          },
        }),
        cache: "no-store",
      });
      const createdData = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) {
        throw new Error(typeof createdData.error === "string" ? createdData.error : "Unable to start checkout.");
      }
      const created = createdData as OrderCreated;

      const razorpay = new window.Razorpay({
        key: created.keyId,
        amount: created.amount,
        currency: created.currency,
        name: "Vooye",
        description: "Your Vooye order",
        order_id: created.razorpayOrderId,
        prefill: {
          name: selectedAddress.recipient_name,
          email: currentUser.email ?? undefined,
          contact: selectedAddress.phone_e164,
        },
        notes: { internalOrderId: created.orderId },
        theme: { color: "#2b251f" },
        handler: async (paymentResult) => {
          setBusy(true);
          setError("");
          setMessage("Verifying your payment with Razorpay…");
          try {
            const verifyResponse = await fetch("/api/payments/razorpay/verify", {
              method: "POST",
              headers: {
                Authorization: "Bearer " + await currentUser.getIdToken(true),
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                orderId: created.orderId,
                razorpayOrderId: paymentResult.razorpay_order_id,
                razorpayPaymentId: paymentResult.razorpay_payment_id,
                razorpaySignature: paymentResult.razorpay_signature,
              }),
              cache: "no-store",
            });
            const verifyData = await verifyResponse.json().catch(() => ({}));
            if (!verifyResponse.ok) {
              throw new Error(typeof verifyData.error === "string"
                ? verifyData.error + " Do not pay again until the order status is confirmed."
                : "Payment could not be confirmed. Do not pay again until the order status is confirmed.");
            }
            writeCart([]);
            setItems([]);
            setMessage("Payment confirmed. Opening your order history…");
            router.push("/account/orders");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Payment may have completed. Check your orders before retrying.");
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setMessage("Payment window closed. If you completed payment, check your order history before trying again.");
          },
        },
      });

      razorpay.on?.("payment.failed", (response) => {
        setBusy(false);
        setError(response.error?.description || "Razorpay could not complete the payment. You can retry only after confirming the order status.");
      });
      setMessage("Complete payment in the secure Razorpay window.");
      razorpay.open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start checkout.");
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() => setRazorpayReady(true)}
        onError={() => setError("Razorpay secure checkout could not load. Please retry later.")}
      />
      <header className="top">
        <Link className="brand" href="/" aria-label="Vooye home">VOOYE</Link>
        <nav className="nav">
          <Link href="/cart">Cart</Link>
          <Link href="/account">My account</Link>
          <Link href="/account/addresses">My addresses</Link>
        </nav>
      </header>

      <section className="section">
        <div className="eyebrow">Secure checkout</div>
        <h1>Delivery and payment</h1>
        <p className="muted">Choose a saved delivery address. Final prices, stock and shipping eligibility are recalculated by the server.</p>

        {error && <p role="alert" className="notice">{error}</p>}
        {message && <p role="status" className="notice">{message}</p>}

        {!authReady || loading ? <p role="status">Loading your account and saved addresses…</p> : !signedIn ? (
          <div className="empty">
            <h2>Sign in to continue</h2>
            <p className="muted">Your cart will stay in this browser while you sign in.</p>
            <Link className="button" href="/sign-in?next=%2Fcheckout">Sign in</Link>
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <h2>Your cart is empty</h2>
            <Link className="button" href="/#shop">Browse the collection</Link>
          </div>
        ) : (
          <div className="grid" style={{ alignItems: "start" }}>
            <article className="panel">
              <h2>Ship to</h2>
              {addresses.length === 0 ? (
                <>
                  <p className="muted">You need a saved Shipping address before checkout.</p>
                  <Link className="button" href="/account/addresses">Add delivery address</Link>
                </>
              ) : (
                <>
                  <label className="field">Saved shipping address
                    <select value={selectedAddressId} onChange={(event) => chooseAddress(event.target.value)} required>
                      {addresses.map((address) => (
                        <option key={address.id} value={address.id}>
                          {address.recipient_name} — {address.locality}, {address.city} {address.postal_code}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedAddress && <div style={{ marginTop: 16 }}>
                    <strong>{selectedAddress.recipient_name}</strong>
                    <p>{selectedAddress.phone_e164}</p>
                    <p>{selectedAddress.address_line1}{selectedAddress.address_line2 ? ", " + selectedAddress.address_line2 : ""}</p>
                    {selectedAddress.landmark && <p>Landmark: {selectedAddress.landmark}</p>}
                    <p>{selectedAddress.locality}, {selectedAddress.city}, {selectedAddress.state} — {selectedAddress.postal_code}</p>
                    <p>{selectedAddress.country_code}</p>
                  </div>}
                  <p style={{ marginTop: 16 }}><Link href="/account/addresses">Manage saved addresses →</Link></p>
                </>
              )}
            </article>

            <article className="panel">
              <h2>Order summary</h2>
              {items.map((item) => (
                <div key={item.productId} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid #e5e0d9" }}>
                  <div><strong>{item.name}</strong><p className="muted">Qty {item.quantity}</p></div>
                  <span>{money(item.pricePaise * item.quantity)}</span>
                </div>
              ))}
              <p className="muted" style={{ marginTop: 14 }}>Browser prices are estimates. The server recalculates current listing prices and stock before creating an order.</p>
              <p className="muted">Subtotal estimate</p>
              <h2>{money(subtotal)}</h2>
              <p className="muted">Final shipping charge is set by the server. Razorpay only; no cash-on-delivery option.</p>
              {!checkoutStatus ? <p role="status">Checking checkout readiness…</p> : !checkoutStatus.enabled ? (
                <p role="status" className="notice">{checkoutStatus.message}</p>
              ) : null}
              <button className="button" type="button" onClick={() => void startPayment()} disabled={busy || !checkoutStatus?.enabled || !razorpayReady || addresses.length === 0}>
                {busy ? "Please wait…" : !checkoutStatus?.enabled ? "Checkout unavailable" : !razorpayReady ? "Loading secure payment…" : "Continue to Razorpay"}
              </button>
            </article>
          </div>
        )}
      </section>
    </main>
  );
}
