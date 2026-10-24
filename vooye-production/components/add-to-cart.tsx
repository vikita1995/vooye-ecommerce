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

export function readCart(): CartItem[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CartItem =>
      item && typeof item.productId === "string" &&
      typeof item.slug === "string" && typeof item.name === "string" &&
      Number.isInteger(item.pricePaise) && item.pricePaise >= 0 &&
      Number.isInteger(item.quantity) && item.quantity > 0
    );
  } catch { return []; }
}

export function writeCart(items: CartItem[]) {
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
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
  return (
    <div className="add-to-cart-control">
      <button className="button" type="button" onClick={add} aria-label={`Add one ${item.name} to cart`}>
        {added ? "Added ✓ · +1 more" : quantity > 0 ? `Add +1 · ${quantity} in cart` : "Add to cart +1"}
      </button>
      {quantity > 0 && <span className="cart-quantity" aria-live="polite">Quantity: {quantity}</span>}
    </div>
  );
}
