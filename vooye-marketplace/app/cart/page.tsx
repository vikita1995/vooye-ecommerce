"use client";

import Link from "next/link";
import { useBrowserStorage } from "@/lib/browser-storage";
import { products, money } from "@/lib/products";

type Line = { id: string; qty: number };

export default function CartPage() {
  const storedCart = useBrowserStorage("vooye-cart");

  let lines: Line[] = [];

  try {
    lines = storedCart ? (JSON.parse(storedCart) as Line[]) : [];
  } catch {
    lines = [];
  }

  function save(value: Line[]) {
    try {
      localStorage.setItem("vooye-cart", JSON.stringify(value));
      window.dispatchEvent(new Event("vooye-storage"));
    } catch {
      console.error("Unable to save cart.");
    }
  }

  const rows = lines
    .map((line) => ({
      ...line,
      product: products.find((product) => product.id === line.id),
    }))
    .filter((row) => row.product);

  const total = rows.reduce(
    (sum, row) => sum + row.product!.price * row.qty,
    0
  );

  return (
    <div className="wrap page">
      <h1>Your cart</h1>

      {rows.length > 0 ? (
        <div className="two">
          <div className="panel">
            {rows.map((row) => (
              <div className="item row" key={row.id}>
                <div>
                  <b>{row.product!.name}</b>
                  <div className="muted small">
                    {money(row.product!.price)} each
                  </div>
                </div>

                <div className="qty">
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Decrease quantity of ${row.product!.name}`}
                    onClick={() =>
                      save(
                        lines.map((line) =>
                          line.id === row.id
                            ? { ...line, qty: Math.max(1, line.qty - 1) }
                            : line
                        )
                      )
                    }
                  >
                    −
                  </button>

                  {row.qty}

                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Increase quantity of ${row.product!.name}`}
                    onClick={() =>
                      save(
                        lines.map((line) =>
                          line.id === row.id
                            ? { ...line, qty: line.qty + 1 }
                            : line
                        )
                      )
                    }
                  >
                    +
                  </button>

                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      save(lines.filter((line) => line.id !== row.id))
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="panel stack">
            <h2>Order summary</h2>

            <div className="row">
              <span>Subtotal</span>
              <b>{money(total)}</b>
            </div>

            <div className="notice">
              Checkout remains disabled until payments, shipping, tax and
              secure order APIs are configured.
            </div>

            <Link className="button" href="/checkout">
              Continue to checkout
            </Link>
          </div>
        </div>
      ) : (
        <div className="empty">
          <h2>Your cart is waiting</h2>
          <p className="muted">
            Discover something special for your home.
          </p>
          <Link className="button" href="/search">
            Explore products
          </Link>
        </div>
      )}
    </div>
  );
}