
import Link from "next/link";

const adminSections = [
  {
    title: "Seller applications",
    description:
      "View pending applications and review seller approval status.",
    status: "Server API required",
  },
  {
    title: "Catalog moderation",
    description:
      "Review product listings, descriptions, images and listing status.",
    status: "Server API required",
  },
  {
    title: "Orders and payments",
    description:
      "View order status, payment events and reconciliation information.",
    status: "Server API required",
  },
];

export default function AdminPortal() {
  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">
          VOOYE
        </Link>

        <nav className="nav">
          <Link href="/">Storefront</Link>
          <Link href="/seller">Seller portal</Link>
        </nav>
      </header>

      <section className="section">
        <div className="eyebrow">Operations</div>

        <h1>Admin console</h1>

        <p className="muted">
          Read-only administration overview. Live administrative data and
          operations must be connected through protected server APIs.
        </p>

        <div className="notice">
          This page does not grant administrative access. Every admin API
          must verify the Firebase ID token on the server and authorize the
          user using the server-side ADMIN_UIDS allowlist or a trusted,
          server-controlled admin role. Never trust a client-supplied role,
          email address or UI state.
        </div>

        <div className="grid">
          {adminSections.map((section) => (
            <article className="panel" key={section.title}>
              <h2>{section.title}</h2>

              <p>{section.description}</p>

              <span className="badge">{section.status}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
