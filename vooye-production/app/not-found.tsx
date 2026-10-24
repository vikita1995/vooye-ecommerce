import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap">
      <section className="section" aria-labelledby="not-found-title">
        <div className="eyebrow">404 · Page not found</div>
        <h1 id="not-found-title">This page isn’t here.</h1>
        <p className="muted">The link may be outdated, or the page may have moved.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
          <Link className="button" href="/">Return to store</Link>
          <Link className="text-link" href="/#shop">Browse the collection</Link>
        </div>
      </section>
    </main>
  );
}
