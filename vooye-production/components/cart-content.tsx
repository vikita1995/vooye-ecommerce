"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { readCart, writeCart, type CartItem } from "./add-to-cart";

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
}

export default function CartContent() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const sync = useCallback(() => { setItems(readCart()); setReady(true); }, []);

  useEffect(() => {
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("vooye-cart-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("vooye-cart-updated", sync);
    };
  }, [sync]);

  function updateQuantity(productId: string, quantity: number) {
    const next = quantity <= 0 ? items.filter((item) => item.productId !== productId)
      : items.map((item) => item.productId === productId ? { ...item, quantity } : item);
    writeCart(next);
    setItems(next);
  }

  const subtotal = items.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0);
  return (
    <section className="section">
      <div className="eyebrow">Your bag</div><h1>Your cart</h1>
      {!ready ? <p>Loading your cart…</p> : items.length === 0 ? (
        <div className="empty"><h2>Your cart is waiting for something beautiful.</h2>
          <p className="muted">Browse the collection and add a mirror or home accent to get started.</p>
          <Link className="button" href="/#shop">Continue shopping</Link></div>
      ) : <>
        <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
          {items.map((item) => <article className="empty" key={item.productId} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 150px) 1fr", gap: 20, alignItems: "center" }}>
            {item.imageUrl ? <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: 140, objectFit: "contain", background: "#eee6db" }} /> : <div className="mini-mirror" aria-hidden="true" />}
            <div><h2>{item.name}</h2><p className="price">{money(item.pricePaise)}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
                <span>Quantity</span>
                <div className="quantity-stepper" aria-label={`Quantity for ${item.name}`}>
                  <button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => updateQuantity(item.productId, item.quantity - 1)} disabled={item.quantity <= 1}>−</button>
                  <output aria-live="polite">{item.quantity}</output>
                  <button type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => updateQuantity(item.productId, item.quantity + 1)}>+1</button>
                </div>
                <button className="text-link" type="button" onClick={() => updateQuantity(item.productId, 0)}>Remove</button>
              </div>
              <p style={{ marginTop: 12 }}><strong>Line total: {money(item.pricePaise * item.quantity)}</strong></p>
            </div>
          </article>)}
        </div>
        <div className="empty" style={{ marginTop: 20 }}><p className="muted">Subtotal</p><h2>{money(subtotal)}</h2>
          <p className="muted">Shipping and final availability are calculated at checkout.</p>
          <Link className="button" href="/checkout">Continue to checkout</Link>
          <p style={{ marginTop: 16 }}><Link href="/#shop">Continue shopping →</Link></p>
        </div>
      </>}
      <div className="notice">Payments are Razorpay-only. No cash-on-delivery option is available.</div>
    </section>
  );
}
