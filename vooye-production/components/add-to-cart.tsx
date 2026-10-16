"use client";

import { useState } from "react";

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
  function add() {
    const cart = readCart();
    const existing = cart.find((entry) => entry.productId === item.productId);
    if (existing) {
      writeCart(cart.map((entry) => entry.productId === item.productId
        ? { ...entry, quantity: Math.min(entry.quantity + 1, 99) } : entry));
    } else {
      writeCart([...cart, { ...item, quantity: 1 }]);
    }
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }
  return <button className="button" type="button" onClick={add}>{added ? "Added to cart ✓" : "Add to cart"}</button>;
}
