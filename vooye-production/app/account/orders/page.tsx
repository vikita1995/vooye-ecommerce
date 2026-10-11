
import Link from "next/link";

export default function OrdersPage() {
  return (
    <main className="wrap">
      <header className="top">
        <Link className="brand" href="/">
          VOOYE
        </Link>
        <nav className="nav">
          <Link href="/">Shop</Link>
          <Link href="/account">My account</Link>
          <Link href="/seller">Seller portal</Link>
        </nav>
      </header>

      <section className="section">
        <div className="eyebrow">Your account</div>
        <h1>Order history</h1>
        <div className="empty">
          <h2>Sign in to view your orders</h2>
          <p className="muted">
            Order history is private to the signed-in customer. Connect Firebase
            sign-in and the authenticated account API before enabling this page.
          </p>
        </div>
      </section>
    </main>
  );
}
