"use client";

import { useBrowserStorage } from "@/lib/browser-storage";
import { products, type Product } from "@/lib/products";
import { ProductGrid } from "@/components/Store";

export default function Wishlist() {
  const storedWishlist = useBrowserStorage("vooye-wishlist");

  let ids: string[] = [];

  try {
    ids = storedWishlist ? (JSON.parse(storedWishlist) as string[]) : [];
  } catch {
    ids = [];
  }

  const items: Product[] = products.filter((product) =>
    ids.includes(product.id)
  );

  return (
    <div className="wrap page">
      <h1>Your wishlist</h1>

      <p className="muted">
        Save pieces and come back when you&apos;re ready.
      </p>

      {items.length > 0 ? (
        <ProductGrid items={items} />
      ) : (
        <div className="empty">
          <h2>No saved items yet</h2>
          <p className="muted">
            Use Save on a product to keep it here.
          </p>
          <a className="button" href="/search">
            Explore products
          </a>
        </div>
      )}
    </div>
  );
}