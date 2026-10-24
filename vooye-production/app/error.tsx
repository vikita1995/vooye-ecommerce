"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log only the digest and message; avoid exposing request data or secrets.
    console.error("Vooye page error:", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="wrap">
      <section className="section" role="alert" aria-labelledby="error-title">
        <div className="eyebrow">Something went wrong</div>
        <h1 id="error-title">We couldn’t load this page.</h1>
        <p className="muted">Your account and order information remain protected. Please retry or return to the store.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
          <button type="button" onClick={() => reset()}>Try again</button>
          <Link className="button" href="/">Return to store</Link>
        </div>
      </section>
    </main>
  );
}
