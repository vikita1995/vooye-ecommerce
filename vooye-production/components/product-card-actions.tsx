"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AddToCartButton from "@/components/add-to-cart";

type ProductActionItem = {
  productId: string;
  slug: string;
  name: string;
  pricePaise: number;
  imageUrl: string | null;
};

const WISHLIST_KEY = "vooye-wishlist-v1";

export default function ProductCardActions({ item }: { item: ProductActionItem }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const items = JSON.parse(window.localStorage.getItem(WISHLIST_KEY) || "[]");
      setSaved(Array.isArray(items) && items.some((entry) => entry?.productId === item.productId));
    } catch {
      setSaved(false);
    }
  }, [item.productId]);

  function toggleWishlist() {
    let items: ProductActionItem[] = [];
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(WISHLIST_KEY) || "[]");
      if (Array.isArray(stored)) items = stored.filter((entry) => entry && typeof entry.productId === "string");
    } catch {}
    const next = saved ? items.filter((entry) => entry.productId !== item.productId) : [...items.filter((entry) => entry.productId !== item.productId), item];
    window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
    setSaved(!saved);
    window.dispatchEvent(new Event("vooye-wishlist-updated"));
  }

  function buyNow() {
    const key = "vooye-cart-v1";
    let cart: Array<ProductActionItem & { quantity: number }> = [];
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(key) || "[]");
      if (Array.isArray(stored)) cart = stored as Array<ProductActionItem & { quantity: number }>;
    } catch {}
    const existing = cart.find((entry) => entry.productId === item.productId);
    const next = existing
      ? cart.map((entry) => entry.productId === item.productId ? { ...entry, quantity: Math.min((entry.quantity || 0) + 1, 99) } : entry)
      : [...cart, { ...item, quantity: 1 }];
    window.localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event("vooye-cart-updated"));
    router.push("/checkout");
  }

  return (
    <div className="product-card-actions">
      <AddToCartButton item={item} />
      <button type="button" className={`wishlist-button${saved ? " is-saved" : ""}`} aria-pressed={saved} onClick={toggleWishlist}>
        {saved ? "♥ Saved" : "♡ Wishlist"}
      </button>
      <button type="button" className="buy-now-button" onClick={buyNow}>Buy now ↗</button>
      <Link className="product-link" href={`/product/${encodeURIComponent(item.slug)}`}>View details ↗</Link>
    </div>
  );
}
