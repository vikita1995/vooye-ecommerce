"use client";

import { useCallback, useEffect, useState } from "react";

export type CartItem = {
  productId: string;
  slug: string;
  name: string;
  pricePaise: number;
  imageUrl: string | null;
  quantity: number;
};

const CART_KEY = "vooye-cart-v1";
export const MAX_CART_QUANTITY = 10;

export function readCart(): CartItem[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CartItem =>
      item && typeof item.productId === "string" &&
      typeof item.slug === "string" && typeof item.name === "string" &&
      Number.isInteger(item.pricePaise) && item.pricePaise >= 0 &&
      Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= MAX_CART_QUANTITY
    );
  } catch { return []; }
}

export function writeCart(items: CartItem[]) {
  const normalized = items
    .filter((item) => item && typeof item.productId === "string" && item.productId.length > 0)
    .map((item) => ({ ...item, quantity: Math.min(MAX_CART_QUANTITY, Math.max(1, Math.trunc(item.quantity))) }))
    .filter((item) => Number.isSafeInteger(item.pricePaise) && item.pricePaise >= 0);
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(normalized));
  } catch {
    // Keep the UI responsive if browser storage is disabled or full.
  }
  window.dispatchEvent(new Event("vooye-cart-updated"));
}

export default function AddToCartButton({ item }: { item: Omit<CartItem, "quantity"> }) {
  const [added, setAdded] = useState(false);
  const [quantity, setQuantity] = useState(0);

  const syncQuantity = useCallback(() => {
    setQuantity(readCart().find((entry) => entry.productId === item.productId)?.quantity ?? 0);
  }, [item.productId]);

  useEffect(() => {
    syncQuantity();
    window.addEventListener("vooye-cart-updated", syncQuantity);
    window.addEventListener("storage", syncQuantity);
    return () => {
      window.removeEventListener("vooye-cart-updated", syncQuantity);
      window.removeEventListener("storage", syncQuantity);
    };
  }, [syncQuantity]);

  function add() {
    const cart = readCart();
    const existing = cart.find((entry) => entry.productId === item.productId);
    if (existing?.quantity >= MAX_CART_QUANTITY) {
      setAdded(false);
      return;
    }
    if (existing) {
      writeCart(cart.map((entry) => entry.productId === item.productId
        ? { ...entry, quantity: entry.quantity + 1 } : entry));
    } else {
      writeCart([...cart, { ...item, quantity: 1 }]);
    }
    setQuantity((current) => current + 1);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  function removeOne() {
    const cart = readCart();
    const existing = cart.find((entry) => entry.productId === item.productId);
    if (!existing) {
      setQuantity(0);
      return;
    }
    if (existing.quantity <= 1) {
      writeCart(cart.filter((entry) => entry.productId !== item.productId));
      setQuantity(0);
    } else {
      writeCart(cart.map((entry) => entry.productId === item.productId
        ? { ...entry, quantity: entry.quantity - 1 } : entry));
      setQuantity((current) => Math.max(0, current - 1));
    }
  }

  return (
    <div className="add-to-cart-control">
      {quantity > 0 ? (
        <div className="product-quantity-stepper" aria-label={`Quantity for ${item.name}`}>
          <button type="button" onClick={removeOne} aria-label={`Remove one ${item.name}`}>−</button>
          <output aria-live="polite">{quantity}</output>
          <button type="button" onClick={add} aria-label={`Add one ${item.name}`} disabled={quantity >= MAX_CART_QUANTITY}>+1</button>
        </div>
      ) : (
        <button className="button" type="button" onClick={add} aria-label={`Add one ${item.name} to cart`}>
          {added ? "Added ✓" : "Add to cart +1"}
        </button>
      )}
      {quantity > 0 && <span className="cart-quantity" aria-live="polite">In cart</span>}
    </div>
  );
}
